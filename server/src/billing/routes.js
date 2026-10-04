import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Bill, Payment, Appointment, Patient, audit } from '../models.js';
import { allowRoles, httpError } from '../auth.js';
import { objectId, pageSchema, parse } from '../validation.js';
import { hospitalDate, validDate } from '../scheduling/time.js';
import { lockDoctors } from '../scheduling/service.js';
import { billResponse, billingReference, generateBill } from './service.js';
const text = (n) => z.string().trim().max(n);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validDate)
  .refine((d) => d >= '1900-01-01' && d <= '2199-12-31');
const revision = z.number().int().nonnegative();
const item = z
  .object({
    description: text(160).min(1),
    quantity: z.number().int().min(1).max(100),
    unitPriceMinor: z.number().int().min(0).max(100000000),
  })
  .strict();
const additionalItems = z.array(item).max(19);
const createSchema = z
  .object({
    appointment: objectId,
    additionalItems: additionalItems.default([]),
    dueDate: date,
    reason: text(500).min(1),
  })
  .strict();
const editSchema = z
  .object({ revision, additionalItems, dueDate: date, reason: text(500).min(1) })
  .strict();
const paymentSchema = z
  .object({
    revision,
    requestKey: z.uuid(),
    amountMinor: z.number().int().min(1).max(200000000000),
    method: z.enum(['Cash', 'Bank transfer']),
    externalReference: text(100).default(''),
  })
  .strict()
  .refine((d) => d.method !== 'Bank transfer' || d.externalReference.length > 0, {
    message: 'Enter the bank transfer reference.',
    path: ['externalReference'],
  });
const reversalSchema = z.object({ revision, reason: text(500).min(1) }).strict();
const listSchema = pageSchema
  .extend({
    status: z.enum(['Pending', 'Paid', 'Overdue']).optional(),
    search: text(100).default(''),
  })
  .strict();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const staff = allowRoles('admin', 'receptionist');
async function scope(user) {
  if (user.role !== 'patient') return {};
  const patient = await Patient.findOne({ user: user._id });
  if (!patient) throw httpError(404, 'Patient profile not found.');
  return { patient: patient._id };
}
function expectRevision(bill, expected) {
  if (bill.revision !== expected)
    throw httpError(409, 'This bill changed in another window. Reload it before continuing.');
}
export function billingRouter() {
  const router = Router();
  router.use('/billing', allowRoles('patient', 'receptionist', 'admin'));
  router.get('/billing/bills', async (req, res) => {
    const { page, limit, status, search } = parse(listSchema, req.query);
    const query = await scope(req.user);
    if (search)
      query.$or = ['reference', 'appointmentReference', 'patientName'].map((field) => ({
        [field]: { $regex: escapeRegex(search), $options: 'i' },
      }));
    if (status === 'Paid') query.$expr = { $gte: ['$paidMinor', '$totalMinor'] };
    if (status === 'Pending' || status === 'Overdue') {
      query.$expr = { $lt: ['$paidMinor', '$totalMinor'] };
      query.dueDate = status === 'Overdue' ? { $lt: hospitalDate() } : { $gte: hospitalDate() };
    }
    const records = await Bill.find(query)
      .select('-versions')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({
      records: records.map(billResponse),
      total: await Bill.countDocuments(query),
      page,
      limit,
    });
  });
  router.get('/billing/bills/:id', async (req, res) => {
    const bill = await Bill.findOne({
      _id: parse(objectId, req.params.id),
      ...(await scope(req.user)),
    }).lean();
    if (!bill) throw httpError(404, 'Bill not found.');
    const payments = await Payment.find({ bill: bill._id })
      .sort({ createdAt: 1, _id: 1 })
      .select('-requestKey')
      .lean();
    res.json({ bill: billResponse(bill), payments });
  });
  router.post('/billing/bills', staff, async (req, res) => {
    const data = parse(createSchema, req.body);
    let bill;
    await mongoose.connection.transaction(async (session) => {
      const initial = await Appointment.findById(data.appointment).session(session);
      if (!initial) throw httpError(404, 'Appointment not found.');
      await lockDoctors([initial.doctor], session);
      const appointment = await Appointment.findById(initial._id).session(session);
      if (appointment.status !== 'Completed')
        throw httpError(409, 'Bills can only be generated for completed appointments.');
      if (await Bill.exists({ appointment: appointment._id }).session(session))
        throw httpError(409, 'This appointment already has a bill. Open it in Billing.');
      bill = await generateBill(appointment, req.user._id, session, data);
    });
    res.status(201).json({ bill: billResponse(bill) });
  });
  router.patch('/billing/bills/:id', staff, async (req, res) => {
    const id = parse(objectId, req.params.id),
      data = parse(editSchema, req.body);
    let bill;
    await mongoose.connection.transaction(async (session) => {
      bill = await Bill.findById(id).session(session);
      if (!bill) throw httpError(404, 'Bill not found.');
      expectRevision(bill, data.revision);
      if (await Payment.exists({ bill: id }).session(session))
        throw httpError(409, 'Bills with payment history cannot be edited.');
      // The original booked consultation fee is immutable; staff may itemise extra services.
      bill.items = [bill.items[0], ...data.additionalItems];
      bill.totalMinor = bill.items.reduce((sum, i) => sum + i.quantity * i.unitPriceMinor, 0);
      bill.dueDate = data.dueDate;
      bill.revision += 1;
      bill.versions.push({
        at: new Date(),
        actor: req.user._id,
        reason: data.reason,
        items: bill.items,
        totalMinor: bill.totalMinor,
        dueDate: bill.dueDate,
      });
      await bill.save({ session });
      await audit(req.user._id, 'bill_revised', 'billing', id, session);
    });
    res.json({ bill: billResponse(bill) });
  });
  router.post('/billing/bills/:id/payments', staff, async (req, res) => {
    const id = parse(objectId, req.params.id),
      data = parse(paymentSchema, req.body);
    let payment,
      repeated = false;
    await mongoose.connection.transaction(async (session) => {
      const bill = await Bill.findById(id).session(session);
      if (!bill) throw httpError(404, 'Bill not found.');
      const prior = await Payment.findOne({ bill: id, requestKey: data.requestKey }).session(
        session,
      );
      if (prior) {
        if (
          prior.amountMinor !== data.amountMinor ||
          prior.method !== data.method ||
          prior.externalReference !== data.externalReference ||
          String(prior.actor) !== String(req.user._id)
        )
          throw httpError(409, 'This payment request was already used with different details.');
        payment = prior;
        repeated = true;
        return;
      }
      expectRevision(bill, data.revision);
      if (data.amountMinor > bill.totalMinor - bill.paidMinor)
        throw httpError(409, 'Payment exceeds the outstanding balance.');
      bill.paidMinor += data.amountMinor;
      bill.revision += 1;
      await bill.save({ session });
      [payment] = await Payment.create(
        [
          {
            bill: id,
            reference: billingReference('RCT'),
            actor: req.user._id,
            requestKey: data.requestKey,
            amountMinor: data.amountMinor,
            method: data.method,
            externalReference: data.externalReference,
          },
        ],
        { session },
      );
      await audit(req.user._id, 'payment_recorded', 'billing', payment._id, session);
    });
    res
      .status(repeated ? 200 : 201)
      .json({ payment: { id: payment._id, reference: payment.reference }, repeated });
  });
  router.post(
    '/billing/bills/:id/payments/:paymentId/reverse',
    allowRoles('admin'),
    async (req, res) => {
      const id = parse(objectId, req.params.id),
        paymentId = parse(objectId, req.params.paymentId),
        data = parse(reversalSchema, req.body);
      await mongoose.connection.transaction(async (session) => {
        const bill = await Bill.findById(id).session(session);
        const payment = await Payment.findOne({ _id: paymentId, bill: id }).session(session);
        if (!bill || !payment) throw httpError(404, 'Payment not found.');
        expectRevision(bill, data.revision);
        if (payment.reversedAt) throw httpError(409, 'This payment is already reversed.');
        bill.paidMinor -= payment.amountMinor;
        bill.revision += 1;
        payment.reversedAt = new Date();
        payment.reversedBy = req.user._id;
        payment.reversalReason = data.reason;
        await bill.save({ session });
        await payment.save({ session });
        await audit(req.user._id, 'payment_reversed', 'billing', payment._id, session);
      });
      res.json({
        message: 'Payment record reversed. No money was transferred by this application.',
      });
    },
  );
  return router;
}
