const column = (key, label, format = 'text') => ({ key, label, format });
const metric = (key, label, format = 'number') => ({ key, label, format });
export const reports = {
  appointments: {
    title: 'Daily appointments',
    basis:
      'Appointments starting on the selected Sri Lanka date, including cancellations. Status is current when generated; patient names are current and doctor/department names are booking snapshots.',
    singleDay: true,
    columns: [
      column('reference', 'Appointment'),
      column('startsAt', 'Time', 'datetime'),
      column('patientName', 'Patient'),
      column('doctorName', 'Doctor'),
      column('departmentName', 'Department'),
      column('status', 'Status'),
    ],
    metrics: [
      metric('count', 'Appointments'),
      metric('completed', 'Completed'),
      metric('cancelled', 'Cancelled'),
      metric('pending', 'Not completed or cancelled'),
    ],
  },
  schedules: {
    title: 'Doctor schedules',
    basis:
      'Sessions starting in the selected period. Includes closed sessions and generated slot counts. Doctor and department names reflect current profiles.',
    columns: [
      column('startsAt', 'Starts', 'datetime'),
      column('endsAt', 'Ends', 'datetime'),
      column('doctorName', 'Doctor'),
      column('departmentName', 'Department'),
      column('state', 'Session'),
      column('slots', 'Generated slots', 'number'),
      column('activeSlots', 'Active slots', 'number'),
    ],
    metrics: [
      metric('count', 'Sessions'),
      metric('active', 'Active sessions'),
      metric('slots', 'Generated slots'),
      metric('activeSlots', 'Active slots'),
    ],
  },
  consultations: {
    title: 'Consultation statistics',
    basis:
      'Completed consultation records grouped by completion date in Sri Lanka time. Drafts and legacy completed appointments without consultation records are excluded. No clinical notes are included.',
    columns: [
      column('date', 'Completion date'),
      column('count', 'Completed consultations', 'number'),
    ],
    metrics: [metric('count', 'Completed consultations')],
  },
  registrations: {
    title: 'Patient registrations',
    basis:
      'Patient profiles created within the selected period, including walk-ins. Displays current names; contact details and clinical information are omitted.',
    columns: [
      column('registeredAt', 'Registered', 'datetime'),
      column('patientId', 'Patient ID'),
      column('name', 'Patient'),
    ],
    metrics: [metric('count', 'New patient profiles')],
  },
  demographics: {
    title: 'Patient demographics',
    basis:
      'Age and recorded gender for the cohort of patients registered within this period. Age is calculated on the period end date; this is not the whole hospital population unless the range covers all registrations.',
    columns: [
      column('ageBand', 'Age on period end date'),
      column('gender', 'Recorded gender'),
      column('count', 'Patients', 'number'),
    ],
    metrics: [metric('count', 'Patient profiles in cohort'), metric('unknownAge', 'Unknown age')],
  },
  revenue: {
    title: 'Revenue summary',
    basis:
      'Recorded payment receipts by receipt date, minus payment-record reversals by reversal date, in Sri Lanka time. Reversals may relate to older receipts; net can be negative. This is not a bank reconciliation or a record of money transferred by this app.',
    columns: [
      column('date', 'Event date'),
      column('method', 'Method'),
      column('receiptCount', 'Receipts', 'number'),
      column('reversalCount', 'Reversals', 'number'),
      column('receiptsMinor', 'Receipts', 'money'),
      column('reversalsMinor', 'Reversals', 'money'),
      column('netMinor', 'Net recorded', 'money'),
    ],
    metrics: [
      metric('receiptsMinor', 'Recorded receipts', 'money'),
      metric('reversalsMinor', 'Record reversals', 'money'),
      metric('netMinor', 'Net recorded', 'money'),
    ],
  },
  billing: {
    title: 'Billing statistics',
    basis:
      'Invoices issued within the selected period, grouped by their current payment status. Balances include subsequent payments and reversals; overdue is determined on the generation date, not the period end date.',
    columns: [
      column('status', 'Current status'),
      column('count', 'Invoices', 'number'),
      column('totalMinor', 'Invoiced', 'money'),
      column('paidMinor', 'Currently paid', 'money'),
      column('balanceMinor', 'Outstanding', 'money'),
    ],
    metrics: [
      metric('count', 'Invoices'),
      metric('totalMinor', 'Invoiced', 'money'),
      metric('paidMinor', 'Currently paid', 'money'),
      metric('balanceMinor', 'Outstanding', 'money'),
    ],
  },
  workload: {
    title: 'Doctor workload',
    basis:
      'Completed consultation records per doctor, selected by completion date. Includes inactive doctors; names reflect current profiles. Drafts and legacy appointments without a consultation record are excluded.',
    columns: [
      column('doctorName', 'Doctor'),
      column('doctorId', 'Doctor ID'),
      column('count', 'Completed consultations', 'number'),
    ],
    metrics: [
      metric('count', 'Completed consultations'),
      metric('doctors', 'Doctors with completions'),
    ],
  },
  departments: {
    title: 'Department utilisation',
    basis:
      'Appointment counts by department name saved at booking, selected by appointment start date. Renamed departments may appear separately. These are activity counts, not a capacity utilisation percentage.',
    columns: [
      column('departmentName', 'Booked department'),
      column('count', 'Appointments', 'number'),
      column('completed', 'Completed', 'number'),
      column('cancelled', 'Cancelled', 'number'),
      column('nonCancelled', 'Not cancelled', 'number'),
    ],
    metrics: [
      metric('count', 'Appointments'),
      metric('completed', 'Completed'),
      metric('cancelled', 'Cancelled'),
    ],
  },
  feedback: {
    title: 'Patient feedback summary',
    basis:
      'Submitted feedback selected by submission date, grouped by star rating. The average is weighted by submission count. Comments and patient identities are omitted; feedback is not a measure of clinical outcomes.',
    columns: [column('rating', 'Stars', 'number'), column('count', 'Submissions', 'number')],
    metrics: [metric('count', 'Submissions'), metric('average', 'Average rating / 5', 'decimal')],
  },
};
