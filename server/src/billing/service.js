import { billingNotice } from '../notifications/service.js';
import { randomBytes } from 'node:crypto';
import { Bill, Patient, audit } from '../models.js';
import { hospitalDate } from '../scheduling/time.js';
export const billingReference = (prefix) =>
  `${prefix}-${randomBytes(8).toString('hex').toUpperCase()}`;
export function billStatus(bill, today = hospitalDate()) {
  if (bill.paidMinor >= bill.totalMinor) return 'Paid';
  return bill.dueDate < today ? 'Overdue' : 'Pending';
}
export function billResponse(bill) {
  const data = bill.toObject ? bill.toObject() : bill;
  return { ...data, status: billStatus(data), balanceMinor: data.totalMinor - data.paidMinor };
}
// Caller supplies its consultation/appointment transaction and holds the doctor lock.
export async function generateBill(appointment, actor, session, options = {}) {
  const existing = await Bill.findOne({ appointment: appointment._id }).session(session);
  if (existing) return existing;
  const patient = await Patient.findById(appointment.patient)
    .populate('user', 'name')
    .session(session);
  const items = [
    {
      description: 'Consultation fee',
      quantity: 1,
      unitPriceMinor: appointment.consultationFeeMinor,
    },
    ...(options.additionalItems || []),
  ];
  const totalMinor = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
  const dueDate = options.dueDate || hospitalDate();
  const [bill] = await Bill.create(
    [
      {
        reference: billingReference('INV'),
        appointment: appointment._id,
        patient: appointment.patient,
        doctor: appointment.doctor,
        appointmentReference: appointment.reference,
        patientName: patient.user.name,
        doctorName: appointment.doctorName,
        items,
        totalMinor,
        dueDate,
        versions: [
          {
            at: new Date(),
            actor,
            reason: options.reason || 'Generated on consultation completion',
            items,
            totalMinor,
            dueDate,
          },
        ],
      },
    ],
    { session },
  );
  await billingNotice(
    bill,
    `bill:${bill._id}:created`,
    'New bill available',
    'A bill is ready for your completed appointment.',
    session,
  );
  await audit(actor, 'bill_generated', 'billing', bill._id, session);
  return bill;
}
