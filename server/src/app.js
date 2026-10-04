import express from 'express';
import { billingRouter } from './billing/routes.js';
import { clinicalRouter } from './clinical/routes.js';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schedulingRouter } from './scheduling/routes.js';
import { User, Patient, Doctor, Department, Session, audit, publicUser } from './models.js';
import {
  authenticate,
  allowRoles,
  createSession,
  sendSession,
  cookieName,
  cookieOptions,
  httpError,
} from './auth.js';
import {
  parse,
  registerSchema,
  loginSchema,
  profileSchema,
  departmentSchema,
  staffSchema,
  pageSchema,
} from './validation.js';

// Use a fixed-cost comparison even for unknown accounts to reduce login timing differences.
const dummyHash = bcrypt.hashSync('not-a-real-account-password', 12);

export function createApp(config, { rateLimitEnabled = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({ strictTransportSecurity: config.env === 'production' ? undefined : false }));
  app.use(cors({ origin: config.origin, credentials: true }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Cookie authentication requires CSRF protection, including login and registration.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.origin) {
      return next(httpError(403, 'Request origin is not allowed.'));
    }
    next();
  });
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());
  if (rateLimitEnabled)
    app.use(
      '/api',
      rateLimit({
        windowMs: 60000,
        limit: 150,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { message: 'Too many requests. Please try again shortly.' },
      }),
    );
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many sign-in attempts. Please try again in 15 minutes.' },
  });
  if (rateLimitEnabled) app.use(['/api/auth/login', '/api/auth/register'], authLimiter);

  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'unavailable',
      database: ready ? 'connected' : 'disconnected',
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    const data = parse(registerSchema, req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    let authSession;
    await mongoose.connection.transaction(async (session) => {
      const [user] = await User.create(
        [{ name: data.name, email: data.email, phone: data.phone, passwordHash, role: 'patient' }],
        { session },
      );
      await Patient.create(
        [{ user: user._id, dateOfBirth: data.dateOfBirth, gender: data.gender }],
        { session },
      );
      await audit(user._id, 'patient_registered', 'authentication', user._id, session);
      authSession = await createSession(user, config, session);
    });
    sendSession(res, authSession, config, 201);
  });

  app.post('/api/auth/login', async (req, res) => {
    const data = parse(loginSchema, req.body);
    const user = await User.findOne({ email: data.email }).select('+passwordHash');
    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
    if (!valid || !user?.isActive) {
      await audit(undefined, 'login_failed', 'authentication');
      throw httpError(401, 'Email or password is incorrect.');
    }
    let authSession;
    await mongoose.connection.transaction(async (session) => {
      authSession = await createSession(user, config, session);
      await audit(user._id, 'login', 'authentication', user._id, session);
    });
    sendSession(res, authSession, config);
  });

  app.use('/api', authenticate(config));
  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/logout', async (req, res) => {
    await mongoose.connection.transaction(async (session) => {
      await Session.deleteOne({ _id: req.authSession._id }, { session });
      await audit(req.user._id, 'logout', 'authentication', req.user._id, session);
    });
    res.clearCookie(cookieName, cookieOptions(config)).status(204).end();
  });

  app.get('/api/patients/me', allowRoles('patient'), async (req, res) => {
    const profile = await Patient.findOne({ user: req.user._id }).lean();
    if (!profile) throw httpError(404, 'Patient profile not found.');
    res.json({ profile, user: publicUser(req.user) });
  });
  app.patch('/api/patients/me', allowRoles('patient'), async (req, res) => {
    const data = parse(profileSchema, req.body);
    let profile;
    await mongoose.connection.transaction(async (session) => {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { phone: data.phone } },
        { session, runValidators: true },
      );
      profile = await Patient.findOneAndUpdate(
        { user: req.user._id },
        { $set: { address: data.address, emergencyContact: data.emergencyContact } },
        { returnDocument: 'after', runValidators: true, session },
      ).lean();
      if (!profile) throw httpError(404, 'Patient profile not found.');
      await audit(req.user._id, 'profile_updated', 'patients', profile._id, session);
    });
    const user = await User.findById(req.user._id);
    res.json({ profile, user: publicUser(user) });
  });

  app.get('/api/doctors/me', allowRoles('doctor'), async (req, res) => {
    const profile = await Doctor.findOne({ user: req.user._id })
      .populate('department', 'name description')
      .lean();
    if (!profile) throw httpError(404, 'Doctor profile not found.');
    res.json({ profile });
  });
  app.get('/api/reception/overview', allowRoles('receptionist'), async (req, res) => {
    const patientCount = await Patient.countDocuments();
    res.json({ patientCount });
  });

  app.use('/api/admin', allowRoles('admin'));
  app.get('/api/admin/overview', async (req, res) => {
    const [patients, doctors, receptionists, departments] = await Promise.all([
      Patient.countDocuments(),
      Doctor.countDocuments(),
      User.countDocuments({ role: 'receptionist' }),
      Department.countDocuments(),
    ]);
    res.json({ patients, doctors, receptionists, departments });
  });
  app.get('/api/admin/departments', async (req, res) => {
    const { page, limit } = parse(pageSchema, req.query);
    const [items, total] = await Promise.all([
      Department.find()
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Department.countDocuments(),
    ]);
    res.json({ items, total, page, limit });
  });
  app.post('/api/admin/departments', async (req, res) => {
    const data = parse(departmentSchema, req.body);
    let department;
    await mongoose.connection.transaction(async (session) => {
      [department] = await Department.create(
        [{ ...data, nameKey: data.name.toLowerCase().replace(/\s+/g, ' ') }],
        { session },
      );
      await audit(req.user._id, 'department_created', 'departments', department._id, session);
    });
    res.status(201).json({
      department: {
        id: department._id,
        name: department.name,
        description: department.description,
      },
    });
  });
  app.get('/api/admin/staff', async (req, res) => {
    const { page, limit } = parse(pageSchema, req.query);
    const filter = { role: { $in: ['doctor', 'receptionist'] } };
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    const profiles = await Doctor.find({ user: { $in: users.map((u) => u._id) } })
      .populate('department', 'name')
      .lean();
    res.json({
      items: users.map((user) => ({
        ...publicUser(user),
        doctor: profiles.find((p) => String(p.user) === String(user._id)) ?? null,
      })),
      total,
      page,
      limit,
    });
  });
  app.post('/api/admin/staff', async (req, res) => {
    const data = parse(staffSchema, req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    let user;
    await mongoose.connection.transaction(async (session) => {
      if (
        data.role === 'doctor' &&
        !(await Department.exists({ _id: data.department, isActive: true }).session(session))
      )
        throw httpError(400, 'Choose an active department.');
      [user] = await User.create(
        [{ name: data.name, email: data.email, phone: data.phone, passwordHash, role: data.role }],
        { session },
      );
      if (data.role === 'doctor')
        await Doctor.create(
          [
            {
              user: user._id,
              department: data.department,
              specialization: data.specialization,
              qualification: data.qualification,
              consultationFeeMinor: data.consultationFeeMinor,
            },
          ],
          { session },
        );
      await audit(req.user._id, 'staff_created', 'staff', user._id, session);
    });
    res.status(201).json({ user: publicUser(user) });
  });

  app.use('/api', schedulingRouter());
  app.use('/api', clinicalRouter());
  app.use('/api', billingRouter());
  app.use('/api', (req, res, next) => next(httpError(404, 'API endpoint not found.')));
  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (config.env === 'production' && existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*path}', (req, res) => res.sendFile(`${clientDist}/index.html`));
  }
  app.use((err, req, res, _next) => {
    let status = err.status || 500;
    let message = err.message;
    if (err.code === 11000) {
      status = 409;
      message =
        err.keyPattern?.doctor || err.keyPattern?.patient || err.keyPattern?.appointment
          ? 'A consultation is already active. Refresh the queue before continuing.'
          : err.keyPattern?.slot || err.keyPattern?.startsAt
            ? 'This slot or session was just taken. Refresh availability and choose another.'
            : 'An account or department with those details already exists.';
    }
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      status = 400;
      message = 'Invalid record data.';
    }
    if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'Request body must be valid JSON.';
    }
    if (err.type === 'entity.too.large') {
      status = 413;
      message = 'Request is too large.';
    }
    if (status >= 500) {
      console.error('Request failed:', err.name, err.code || 'internal_error');
      message = 'Something went wrong. Please try again.';
    }
    res.status(status).json({ message, ...(err.fields ? { fields: err.fields } : {}) });
  });
  return app;
}
