import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  User,
  Patient,
  Doctor,
  Department,
  Appointment,
  Session,
  PasswordReset,
  audit,
  publicUser,
} from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { objectId, pageSchema, departmentSchema, parse } from '../validation.js';
import { openStatuses, lockDoctors } from '../scheduling/service.js';
import { escapeRegex } from '../reporting/service.js';

export async function lockDepartments(ids, session) {
  for (const id of [...new Set(ids.map(String))].sort()) {
    const department = await Department.findOneAndUpdate(
      { _id: id },
      { $inc: { revision: 1 } },
      { session, returnDocument: 'after' },
    );
    if (!department) throw httpError(400, 'Choose an active department.');
  }
}
export function administrationRouter() {
  const router = Router();
  router.use('/admin', allowRoles('admin'));
  router.get('/admin/patients', async (req, res) => {
    const { page, limit, search, status } = parse(
      pageSchema
        .extend({
          search: z.string().trim().max(100).default(''),
          status: z.enum(['all', 'active', 'inactive']).default('all'),
        })
        .strict(),
      req.query,
    );
    const filter = {
      role: 'patient',
      ...(status !== 'all' ? { isActive: status === 'active' } : {}),
      ...(search
        ? {
            $or: ['name', 'email', 'phone'].map((key) => ({
              [key]: { $regex: escapeRegex(search), $options: 'i' },
            })),
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ items: users.map(publicUser), total, page, limit });
  });
  router.patch('/admin/patients/:id/status', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const data = parse(
      z
        .object({
          isActive: z.boolean(),
          expectedActive: z.boolean(),
          reason: z.string().trim().min(3).max(300),
        })
        .strict(),
      req.body,
    );
    let user;
    await mongoose.connection.transaction(async (session) => {
      const patient = await Patient.findOneAndUpdate(
        { user: id },
        { $inc: { bookingRevision: 1 } },
        { session },
      );
      if (!patient) throw httpError(404, 'Patient not found.');
      if (
        !data.isActive &&
        (await Appointment.exists({ patient: patient._id, status: { $in: openStatuses } }).session(
          session,
        ))
      )
        throw httpError(
          409,
          'Complete or cancel open appointments before deactivating this patient.',
        );
      user = await User.findOneAndUpdate(
        { _id: id, role: 'patient', isActive: data.expectedActive },
        { $set: { isActive: data.isActive }, $inc: { securityRevision: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!user) throw httpError(409, 'Account status changed. Refresh and try again.');
      if (!data.isActive) {
        await Session.deleteMany({ user: id }, { session });
        await PasswordReset.deleteMany({ user: id }, { session });
      }
      await audit(
        req.user._id,
        data.isActive ? 'patient_activated' : 'patient_deactivated',
        'patients',
        id,
        session,
        { reason: data.reason },
      );
    });
    res.json({ user: publicUser(user) });
  });
  router.patch('/admin/departments/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const data = parse(
      departmentSchema
        .extend({
          revision: z.number().int().nonnegative(),
          isActive: z.boolean(),
          isPublic: z.boolean(),
          reason: z.string().trim().min(3).max(300),
        })
        .strict(),
      req.body,
    );
    let department;
    await mongoose.connection.transaction(async (session) => {
      department = await Department.findOneAndUpdate(
        {
          _id: id,
          ...(data.revision === 0
            ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
            : { revision: data.revision }),
        },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!department) throw httpError(409, 'Department changed. Refresh and try again.');
      if (!data.isActive && (await Doctor.exists({ department: id }).session(session)))
        throw httpError(409, 'Reassign all doctors before deactivating this department.');
      Object.assign(department, {
        name: data.name,
        nameKey: data.name.toLowerCase().replace(/\s+/g, ' '),
        description: data.description,
        isActive: data.isActive,
        isPublic: data.isPublic,
      });
      await department.save({ session });
      await audit(req.user._id, 'department_updated', 'departments', id, session, {
        reason: data.reason,
      });
    });
    res.json({ department });
  });
  router.patch('/admin/doctors/:id/publication', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const data = parse(
      z.object({ isPublic: z.boolean(), expectedPublic: z.boolean() }).strict(),
      req.body,
    );
    await mongoose.connection.transaction(async (session) => {
      await lockDoctors([id], session);
      const doctor = await Doctor.findById(id).session(session);
      if (!doctor || Boolean(doctor.isPublic) !== data.expectedPublic)
        throw httpError(409, 'Doctor profile changed. Refresh and try again.');
      if (data.isPublic) {
        const user = await User.findOne({ _id: doctor.user, isActive: true }).session(session);
        const department = await Department.findOne({
          _id: doctor.department,
          isActive: true,
          isPublic: true,
        }).session(session);
        if (!user || !department)
          throw httpError(409, 'Activate the doctor and publish their department first.');
      }
      doctor.isPublic = data.isPublic;
      await doctor.save({ session });
      await audit(
        req.user._id,
        data.isPublic ? 'doctor_published' : 'doctor_unpublished',
        'staff',
        id,
        session,
      );
    });
    res.json({ isPublic: data.isPublic });
  });
  return router;
}
// A shared publication filter protects both search results and individual public profiles.
export function publishedDoctors({ department, id, q } = {}) {
  return [
    {
      $match: {
        isPublic: true,
        ...(id ? { _id: new mongoose.Types.ObjectId(id) } : {}),
        ...(department ? { department: new mongoose.Types.ObjectId(department) } : {}),
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        pipeline: [{ $match: { isActive: true } }, { $project: { name: 1, avatarId: 1 } }],
        as: 'account',
      },
    },
    { $unwind: '$account' },
    {
      $lookup: {
        from: 'departments',
        localField: 'department',
        foreignField: '_id',
        pipeline: [{ $match: { isActive: true, isPublic: true } }, { $project: { name: 1 } }],
        as: 'service',
      },
    },
    { $unwind: '$service' },
    ...(q
      ? [
          {
            $match: {
              $or: ['account.name', 'specialization'].map((field) => ({
                [field]: { $regex: escapeRegex(q), $options: 'i' },
              })),
            },
          },
        ]
      : []),
  ];
}
const publicDoctorFields = {
  _id: 1,
  name: '$account.name',
  avatarUrl: {
    $cond: [
      { $ne: [{ $ifNull: ['$account.avatarId', ''] }, ''] },
      {
        $concat: ['/api/public/doctors/', { $toString: '$_id' }, '/avatar?v=', '$account.avatarId'],
      },
      '',
    ],
  },
  department: '$service.name',
  departmentId: '$service._id',
  specialization: 1,
  qualification: 1,
  consultationFeeMinor: 1,
};
export function publicDirectoryRouter() {
  const router = Router();
  router.get('/public/departments', async (req, res) => {
    const { page, limit } = parse(pageSchema, req.query);
    const filter = { isActive: true, isPublic: true };
    const [items, total] = await Promise.all([
      Department.find(filter)
        .select('name description')
        .sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Department.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  });
  router.get('/public/departments/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const department = await Department.findOne({ _id: id, isActive: true, isPublic: true })
      .select('name description')
      .lean();
    if (!department) throw httpError(404, 'Department information is unavailable.');
    res.json({ department });
  });
  router.get('/public/doctors', async (req, res) => {
    const query = parse(
      pageSchema
        .extend({ department: objectId.optional(), q: z.string().trim().max(100).default('') })
        .strict(),
      req.query,
    );
    const { page, limit } = query;
    const [result] = await Doctor.aggregate([
      ...publishedDoctors(query),
      { $sort: { 'account.name': 1, _id: 1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: publicDoctorFields },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ]).option({ maxTimeMS: 10000 });
    res.json({ items: result.items, total: result.total[0]?.value || 0, page, limit });
  });
  router.get('/public/doctors/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const [doctor] = await Doctor.aggregate([
      ...publishedDoctors({ id }),
      { $project: publicDoctorFields },
    ]).option({ maxTimeMS: 10000 });
    if (!doctor) throw httpError(404, 'Doctor information is unavailable.');
    res.json({ doctor });
  });
  return router;
}
