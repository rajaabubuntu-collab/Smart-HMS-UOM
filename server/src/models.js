import mongoose from 'mongoose';

const { Schema, model } = mongoose;
export const roles = ['patient', 'doctor', 'receptionist', 'admin'];
const reference = (ref, required = true) => ({ type: Schema.Types.ObjectId, ref, required });

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      maxlength: 254,
    },
    phone: { type: String, default: '', maxlength: 25 },
    avatarId: { type: String, default: '', select: true },
    passwordHash: { type: String, required: true, select: false },
    securityRevision: { type: Number, default: 0, select: false },
    recoveryRequestedAt: { type: Date, select: false },
    role: { type: String, enum: roles, required: true },
    isActive: { type: Boolean, default: true },
    isDemo: { type: Boolean, default: false },
    notificationPreferences: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

const patientSchema = new Schema(
  {
    user: { ...reference('User'), unique: true },
    dateOfBirth: { type: String, required: true },
    gender: {
      type: String,
      enum: ['female', 'male', 'other', 'prefer-not-to-say'],
      required: true,
    },
    bloodType: {
      type: String,
      enum: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      default: '',
    },
    allergies: { type: [String], default: [] },
    bookingRevision: { type: Number, default: 0, select: false },
    address: { type: String, default: '', maxlength: 300 },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relationship: { type: String, default: '' },
    },
  },
  { timestamps: true },
);

patientSchema.index({ createdAt: 1 });

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, unique: true, select: false },
    description: { type: String, default: '', maxlength: 500 },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const doctorSchema = new Schema(
  {
    user: { ...reference('User'), unique: true },
    department: reference('Department'),
    specialization: { type: String, required: true, maxlength: 100 },
    qualification: { type: String, default: '', maxlength: 200 },
    isPublic: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
    // Store LKR in minor units to avoid floating-point billing errors.
    consultationFeeMinor: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
    bookingRevision: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);
doctorSchema.index({ department: 1 });

const sessionSchema = new Schema(
  {
    user: reference('User'),
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1 });

const auditSchema = new Schema(
  {
    actor: reference('User', false),
    action: { type: String, required: true },
    module: { type: String, required: true },
    target: { type: String, default: '' },
    ipAddress: { type: String, select: false, maxlength: 45 },
    reason: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });
auditSchema.index({ actor: 1, createdAt: -1 });
auditSchema.index({ module: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });

export const User = model('User', userSchema);
export const Patient = model('Patient', patientSchema);
export const Doctor = model('Doctor', doctorSchema);
export const Department = model('Department', departmentSchema);
export const Session = model('Session', sessionSchema);
export const AuditLog = model('AuditLog', auditSchema);
export const PasswordReset = model(
  'PasswordReset',
  new Schema(
    {
      user: reference('User'),
      tokenHash: { type: String, select: false, index: true },
      sealedToken: { type: String, select: false },
      destination: { type: String, select: false },
      kind: { type: String, enum: ['reset', 'changed'], default: 'reset' },
      status: { type: String, default: 'queued' },
      expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { timestamps: true },
  ),
);

const scheduleSchema = new Schema(
  {
    doctor: reference('Doctor'),
    date: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    slotMinutes: { type: Number, required: true, min: 5, max: 120 },
    isActive: { type: Boolean, default: true },
    createdBy: reference('User'),
    closedReason: { type: String, default: '' },
  },
  { timestamps: true },
);
scheduleSchema.index({ doctor: 1, date: 1, isActive: 1 });
scheduleSchema.index({ startsAt: 1 });
const slotSchema = new Schema(
  {
    schedule: reference('DoctorSchedule'),
    doctor: reference('Doctor'),
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
slotSchema.index(
  { doctor: 1, startsAt: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
slotSchema.index({ schedule: 1, isActive: 1 });

export const appointmentStatuses = [
  'Scheduled',
  'Waiting',
  'In Consultation',
  'Completed',
  'Cancelled',
];
const appointmentSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    patient: reference('Patient'),
    doctor: reference('Doctor'),
    slot: reference('AppointmentSlot'),
    schedule: reference('DoctorSchedule'),
    bookedBy: reference('User'),
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    doctorName: { type: String, required: true },
    departmentName: { type: String, required: true },
    consultationFeeMinor: { type: Number, required: true },
    reason: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: appointmentStatuses, default: 'Scheduled' },
    holdsSlot: { type: Boolean, default: true },
    scheduleRevision: { type: Number, default: 0 },
    remindedRevision: { type: Number, default: -1 },
    checkedInAt: Date,
    cancelledAt: Date,
    cancellationReason: { type: String, default: '' },
    history: [
      {
        _id: false,
        action: String,
        actor: reference('User'),
        at: { type: Date, default: Date.now },
        fromStartsAt: Date,
        toStartsAt: Date,
        fromDoctorName: String,
        toDoctorName: String,
        reason: String,
      },
    ],
  },
  { timestamps: true },
);
// Cancellation releases the unique slot claim without deleting appointment history.
appointmentSchema.index(
  { slot: 1 },
  { unique: true, partialFilterExpression: { holdsSlot: true }, name: 'one_reservation_per_slot' },
);
appointmentSchema.index({ patient: 1, startsAt: 1 });
appointmentSchema.index({ doctor: 1, startsAt: 1, status: 1 });
appointmentSchema.index({ schedule: 1, status: 1 });
appointmentSchema.index({ status: 1, startsAt: 1 });
appointmentSchema.index({ startsAt: 1 });
export const DoctorSchedule = model('DoctorSchedule', scheduleSchema);
export const AppointmentSlot = model('AppointmentSlot', slotSchema);
export const Appointment = model('Appointment', appointmentSchema);

const medicationSchema = new Schema(
  { name: String, dosage: String, frequency: String, duration: String },
  { _id: false },
);
const consultationSchema = new Schema(
  {
    appointment: { ...reference('Appointment'), unique: true },
    patient: reference('Patient'),
    doctor: reference('Doctor'),
    status: { type: String, enum: ['Draft', 'Completed'], default: 'Draft' },
    revision: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    treatment: { type: String, default: '' },
    currentMedications: { type: String, default: '' },
    medications: [medicationSchema],
    noMedicationReason: { type: String, default: '' },
    reviewedAllergies: [String],
    completedAt: Date,
    prescriptions: [
      {
        _id: false,
        at: Date,
        actor: reference('User'),
        reason: String,
        medications: [medicationSchema],
        noMedicationReason: String,
        reviewedAllergies: [String],
      },
    ],
  },
  { timestamps: true },
);
consultationSchema.index({ patient: 1, completedAt: -1 });
consultationSchema.index({ status: 1, completedAt: 1 });
consultationSchema.index(
  { doctor: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Draft' },
    name: 'one_active_consultation_per_doctor',
  },
);
consultationSchema.index(
  { patient: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Draft' },
    name: 'one_active_consultation_per_patient',
  },
);
export const Consultation = model('Consultation', consultationSchema);

const chargeSchema = new Schema(
  {
    description: { type: String, required: true, maxlength: 160 },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPriceMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false },
);
const billSchema = new Schema(
  {
    reference: { type: String, unique: true, required: true },
    appointment: { ...reference('Appointment'), unique: true },
    patient: reference('Patient'),
    doctor: reference('Doctor'),
    appointmentReference: String,
    patientName: String,
    doctorName: String,
    currency: { type: String, default: 'LKR', enum: ['LKR'] },
    items: [chargeSchema],
    totalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    paidMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    dueDate: { type: String, required: true },
    revision: { type: Number, default: 0 },
    versions: [
      {
        _id: false,
        at: Date,
        actor: reference('User'),
        reason: String,
        items: [chargeSchema],
        totalMinor: Number,
        dueDate: String,
      },
    ],
  },
  { timestamps: true },
);
billSchema.index({ patient: 1, createdAt: -1 });
billSchema.index({ createdAt: 1 });
const paymentSchema = new Schema(
  {
    bill: reference('Bill'),
    reference: { type: String, unique: true, required: true },
    requestKey: { type: String, required: true },
    actor: reference('User'),
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    method: { type: String, required: true, enum: ['Cash', 'Bank transfer'] },
    externalReference: { type: String, default: '' },
    reversedAt: Date,
    reversedBy: reference('User', false),
    reversalReason: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
paymentSchema.index({ bill: 1, requestKey: 1 }, { unique: true });
paymentSchema.index({ bill: 1, createdAt: -1 });
paymentSchema.index({ createdAt: 1 });
paymentSchema.index({ reversedAt: 1 });
export const Bill = model('Bill', billSchema);
export const Payment = model('Payment', paymentSchema);

const notificationSchema = new Schema(
  {
    recipient: reference('User'),
    eventKey: { type: String, required: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['appointment', 'reminder', 'clinical', 'billing'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 600 },
    path: { type: String, required: true, maxlength: 300 },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
notificationSchema.index({ recipient: 1, eventKey: 1 }, { unique: true });
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
export const Notification = model('Notification', notificationSchema);

const emailContentSchema = new Schema(
  {
    version: { type: Number, enum: [1], required: true },
    kind: { type: String, required: true, maxlength: 60 },
    subject: { type: String, required: true, maxlength: 300 },
    title: { type: String, required: true, maxlength: 120 },
    summary: { type: String, required: true, maxlength: 600 },
    nextStep: { type: String, required: true, maxlength: 600 },
    actionLabel: { type: String, required: true, maxlength: 100 },
    tone: { type: String, enum: ['blue', 'green', 'amber'] },
    path: { type: String, required: true, maxlength: 300 },
    recipientName: { type: String, maxlength: 120 },
    occurredAt: { type: Date, required: true },
    hospital: {
      name: { type: String, maxlength: 120 },
      address: { type: String, maxlength: 400 },
      phone: { type: String, maxlength: 30 },
      email: { type: String, maxlength: 254 },
    },
    details: [
      {
        _id: false,
        label: { type: String, maxlength: 100 },
        value: { type: String, maxlength: 500 },
      },
    ],
  },
  { _id: false },
);
const deliverySchema = new Schema(
  {
    recipient: reference('User'),
    eventKey: { type: String, required: true },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    transport: { type: String, enum: ['local', 'smtp', 'twilio', 'notifylk'], required: true },
    destination: { type: String, required: true, select: false },
    emailContent: { type: emailContentSchema, select: false },
    smsContent: {
      type: new Schema(
        {
          version: { type: Number, enum: [1], required: true },
          kind: { type: String, required: true, maxlength: 60 },
          text: { type: String, required: true, maxlength: 160 },
        },
        { _id: false },
      ),
      select: false,
    },
    status: {
      type: String,
      enum: [
        'queued',
        'processing',
        'simulated',
        'accepted',
        'delivered',
        'failed',
        'skipped',
        'unknown',
      ],
      default: 'queued',
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    startedAt: Date,
    providerId: { type: String, select: false },
    providerStatus: String,
    lastError: String,
    checkedAt: Date,
  },
  { timestamps: true },
);
deliverySchema.index({ recipient: 1, eventKey: 1, channel: 1 }, { unique: true });
deliverySchema.index({ status: 1, nextAttemptAt: 1 });
deliverySchema.index({ recipient: 1, createdAt: -1 });
export const Delivery = model('Delivery', deliverySchema);

const feedbackSchema = new Schema(
  {
    appointment: { ...reference('Appointment'), unique: true },
    patient: reference('Patient'),
    doctor: reference('Doctor'),
    appointmentReference: { type: String, required: true },
    patientName: { type: String, required: true },
    doctorName: { type: String, required: true },
    departmentName: { type: String, required: true },
    visitAt: { type: Date, required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    comment: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
feedbackSchema.index({ patient: 1, createdAt: -1 });
feedbackSchema.index({ createdAt: -1, _id: -1 });
feedbackSchema.index({ rating: 1, createdAt: -1, _id: -1 });
export const Feedback = model('Feedback', feedbackSchema);

const hospitalDetailsSchema = new Schema(
  {
    name: String,
    description: String,
    address: String,
    phone: String,
    email: String,
    visitNotes: String,
    isDemo: Boolean,
    hours: [
      new Schema(
        { day: String, closed: Boolean, allDay: Boolean, opens: String, closes: String },
        { _id: false },
      ),
    ],
  },
  { _id: false },
);
export const HospitalSettings = model(
  'HospitalSettings',
  new Schema(
    {
      draft: { type: hospitalDetailsSchema, required: true },
      published: { type: hospitalDetailsSchema, default: null },
      version: { type: Number, default: 0 },
      publishedAt: { type: Date, default: null },
      updatedBy: reference('User'),
    },
    { timestamps: true },
  ),
);

export const Enquiry = model(
  'Enquiry',
  new Schema(
    {
      requestId: { type: String, required: true, unique: true, select: false },
      reference: { type: String, required: true, unique: true },
      name: { type: String, required: true, maxlength: 120 },
      email: { type: String, required: true, maxlength: 254 },
      phone: { type: String, default: '', maxlength: 30 },
      subject: {
        type: String,
        enum: ['appointments', 'services', 'visiting', 'billing', 'other'],
        required: true,
      },
      message: { type: String, required: true, maxlength: 2000 },
      status: {
        type: String,
        enum: ['new', 'in_progress', 'resolved'],
        default: 'new',
        index: true,
      },
      updatedBy: reference('User', false),
    },
    { timestamps: true },
  ),
);
Enquiry.schema.index({ createdAt: -1, _id: -1 });

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(
    [
      User,
      Patient,
      Doctor,
      Department,
      Session,
      PasswordReset,
      AuditLog,
      DoctorSchedule,
      AppointmentSlot,
      Appointment,
      Consultation,
      Bill,
      Payment,
      Notification,
      Delivery,
      HospitalSettings,
      Feedback,
      Enquiry,
    ].map((m) => m.init()),
  );
}

export function userAvatarUrl(user) {
  return user.avatarId ? `/api/users/${user._id}/avatar?v=${user.avatarId}` : '';
}

export function publicUser(user) {
  const id = user._id.toString();
  return {
    id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: userAvatarUrl(user),
  };
}

export async function audit(actor, action, module, target = '', session, metadata = {}) {
  await AuditLog.create(
    [
      {
        actor,
        action,
        module,
        target: String(target),
        ipAddress: metadata.ipAddress,
        reason: metadata.reason,
      },
    ],
    { session },
  );
}
