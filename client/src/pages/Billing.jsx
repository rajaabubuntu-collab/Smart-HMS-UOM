import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, Loading, Notice, PageHeading, Pager, useResource } from '../components/ui';
import Modal from '../components/Modal';
import { dateLabel, timeLabel, money, today } from '../scheduling';

function minor(value) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a valid LKR amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
function Status({ bill }) {
  return (
    <span
      className={`status-pill ${bill.status === 'Paid' ? 'completed' : bill.status === 'Overdue' ? 'cancelled' : 'waiting'}`}
    >
      {bill.status}
      {bill.paidMinor > 0 && bill.balanceMinor > 0 ? ' · Part paid' : ''}
    </span>
  );
}
function Charges({ items }) {
  return (
    <div className="billing-items">
      {items.map((item, i) => (
        <div className="billing-item" key={i}>
          <div>
            <strong>{item.description}</strong>
            <p>
              {item.quantity} × {money(item.unitPriceMinor)}
            </p>
          </div>
          <strong>{money(item.quantity * item.unitPriceMinor)}</strong>
        </div>
      ))}
    </div>
  );
}
function BillEditor({ bill, appointment, onClose, onSaved }) {
  const [items, setItems] = useState(
    (bill?.items.slice(1) || []).map((i) => ({ ...i, price: (i.unitPriceMinor / 100).toFixed(2) })),
  );
  const [dueDate, setDueDate] = useState(bill?.dueDate || today());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        additionalItems: items.map((i) => ({
          description: i.description,
          quantity: Number(i.quantity),
          unitPriceMinor: minor(i.price),
        })),
        dueDate,
        reason,
        ...(bill ? { revision: bill.revision } : { appointment }),
      };
      await api(bill ? `/billing/bills/${bill._id}` : '/billing/bills', {
        method: bill ? 'PATCH' : 'POST',
        body,
      });
      onSaved();
    } catch (err) {
      setError(err.message + (err.fields ? ' ' + Object.values(err.fields).join(' ') : ''));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={bill ? 'Edit unpaid bill' : 'Generate bill'}
      onClose={busy ? () => {} : onClose}
      wide
    >
      <form onSubmit={save}>
        <Notice>{error}</Notice>
        <p>
          The booked consultation fee is included automatically and cannot be changed here. Add only
          applicable service charges. Bills are locked after the first payment record.
        </p>
        <fieldset className="clinical-fieldset" disabled={busy}>
          {bill && <Charges items={[bill.items[0]]} />}
          {items.map((item, i) => (
            <fieldset className="medication-row" key={i}>
              <legend>Additional charge {i + 1}</legend>
              {[
                ['description', 'Description'],
                ['quantity', 'Quantity'],
                ['price', 'Unit price (LKR)'],
              ].map(([key, label]) => (
                <Field
                  key={key}
                  name={`charge-${i}-${key}`}
                  label={label}
                  required
                  value={item[key]}
                  type={key === 'quantity' ? 'number' : 'text'}
                  min={key === 'quantity' ? 1 : undefined}
                  max={key === 'quantity' ? 100 : undefined}
                  maxLength={key === 'description' ? 160 : undefined}
                  inputMode={key === 'price' ? 'decimal' : undefined}
                  onChange={(e) =>
                    setItems((v) =>
                      v.map((entry, n) => (n === i ? { ...entry, [key]: e.target.value } : entry)),
                    )
                  }
                />
              ))}
              <button
                type="button"
                className="button subtle"
                onClick={() => setItems((v) => v.filter((_, n) => n !== i))}
              >
                Remove charge {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button subtle"
            disabled={items.length >= 19}
            onClick={() => setItems((v) => [...v, { description: '', quantity: 1, price: '' }])}
          >
            Add service charge
          </button>
          <Field
            name="dueDate"
            label="Due date"
            type="date"
            required
            value={dueDate}
            min="1900-01-01"
            max="2199-12-31"
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Field
            name="billReason"
            label="Reason / billing note"
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="muted">
            An unpaid balance becomes overdue the day after the due date, in Sri Lanka time.
          </p>
          <button className="button primary">
            {busy ? 'Saving…' : bill ? 'Save bill changes' : 'Generate bill'}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
export function Billing() {
  const { user } = useAuth();
  const staff = user.role !== 'patient';
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('reference') || '');
  const [query, setQuery] = useState(search),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [revision, refresh] = useState(0),
    [create, setCreate] = useState(false);
  const { data, error, pending } = useResource(
    `/billing/bills?page=${page}&search=${encodeURIComponent(query)}${status ? `&status=${status}` : ''}`,
    revision,
  );
  return (
    <>
      <PageHeading
        eyebrow={staff ? 'RECEPTION & ACCOUNTS' : 'PATIENT PORTAL'}
        title={staff ? 'Billing' : 'My bills & payments'}
        description="Itemised bills, outstanding balances and recorded payment history."
      />
      <div className="card padded billing-filters">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <Field
            name="billSearch"
            label="Search bills"
            placeholder="Invoice, appointment or patient name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="button subtle">Search</button>
        </form>
        <Field
          name="billStatus"
          label="Payment status"
          as="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {['Pending', 'Paid', 'Overdue'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Field>
        <button className="button subtle" onClick={() => refresh((v) => v + 1)}>
          Refresh bills
        </button>
      </div>
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <>
          {!data.records.length && (
            <div className="card padded">
              <h2>No bills found</h2>
              <p>Bills are generated when consultations are completed.</p>
              {staff &&
                params.get('appointment') &&
                !status &&
                query === params.get('reference') && (
                  <button className="button primary" onClick={() => setCreate(true)}>
                    Generate missing bill
                  </button>
                )}
            </div>
          )}
          {data.records.map((bill) => (
            <article className="card padded billing-row" key={bill._id}>
              <div>
                <h2>{bill.reference}</h2>
                <p>
                  {bill.patientName} · {bill.appointmentReference}
                </p>
                <p className="muted">
                  {bill.doctorName} · Due {dateLabel(`${bill.dueDate}T00:00:00+05:30`)}
                </p>
                <Status bill={bill} />
              </div>
              <div>
                <p>
                  Total <strong>{money(bill.totalMinor)}</strong>
                </p>
                <p>
                  Balance <strong>{money(bill.balanceMinor)}</strong>
                </p>
                <Link className="button primary" to={`/billing/${bill._id}`}>
                  View bill
                </Link>
              </div>
            </article>
          ))}
          <Pager {...data} onChange={setPage} />
        </>
      )}
      {staff && (
        <p className="muted">
          For an older completed appointment without a bill, open{' '}
          <Link to="/appointments">Appointments</Link> and choose Billing. Payments are recorded by
          staff after receipt; this app does not process online payments.
        </p>
      )}
      {create && (
        <BillEditor
          appointment={params.get('appointment')}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            refresh((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function PaymentForm({ bill, onClose, onSaved }) {
  const [amount, setAmount] = useState((bill.balanceMinor / 100).toFixed(2)),
    [method, setMethod] = useState('Cash'),
    [reference, setReference] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // Retain the same request identity across network retries, including a lost response.
  const [attempt, setAttempt] = useState(null);
  async function pay(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const details = {
        revision: bill.revision,
        amountMinor: minor(amount),
        method,
        externalReference: reference.trim(),
      };
      const key = JSON.stringify(details);
      const requestKey = attempt?.key === key ? attempt.requestKey : crypto.randomUUID();
      setAttempt({ key, requestKey });
      await api(`/billing/bills/${bill._id}/payments`, {
        method: 'POST',
        body: { ...details, requestKey },
      });
      onSaved();
    } catch (err) {
      setError(err.message + (err.fields ? ' ' + Object.values(err.fields).join(' ') : ''));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Record received payment" onClose={busy ? () => {} : onClose}>
      <form onSubmit={pay}>
        <Notice>{error}</Notice>
        <p>
          Outstanding balance: <strong>{money(bill.balanceMinor)}</strong>
        </p>
        <fieldset className="clinical-fieldset" disabled={busy}>
          <Field
            name="paymentAmount"
            label="Amount received (LKR)"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirmed(false);
            }}
          />
          <Field
            name="paymentMethod"
            label="Payment method"
            as="select"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setConfirmed(false);
            }}
          >
            <option>Cash</option>
            <option>Bank transfer</option>
          </Field>
          <Field
            name="paymentReference"
            label="Payment reference"
            hint={
              method === 'Bank transfer'
                ? 'Required bank transfer reference.'
                : 'Optional receipt note.'
            }
            required={method === 'Bank transfer'}
            maxLength={100}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <label className="clinical-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I confirm this payment has been received.
          </label>
          <button className="button primary" disabled={!confirmed}>
            {busy ? 'Recording…' : 'Confirm received payment'}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
function ReversePayment({ bill, payment, onClose, onSaved }) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function reverse(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/billing/bills/${bill._id}/payments/${payment._id}/reverse`, {
        method: 'POST',
        body: { revision: bill.revision, reason },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Reverse payment record" onClose={busy ? () => {} : onClose}>
      <form onSubmit={reverse}>
        <Notice>{error}</Notice>
        <p>
          Reverse {payment.reference} for {money(payment.amountMinor)}? The balance will increase
          and the original entry will remain visible. This corrects a record; it does not transfer
          or refund money.
        </p>
        <Field
          name="reversalReason"
          label="Reason for reversal"
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="button primary" disabled={busy}>
          Confirm reversal
        </button>
      </form>
    </Modal>
  );
}
export function BillDetail() {
  const { id } = useParams(),
    { user } = useAuth();
  const staff = user.role !== 'patient';
  const [revision, refresh] = useState(0),
    [modal, setModal] = useState(null);
  const { data, pending, error } = useResource(`/billing/bills/${id}`, revision);
  const saved = () => {
    setModal(null);
    refresh((v) => v + 1);
  };
  return (
    <div className="bill-detail">
      <PageHeading
        eyebrow="SMART HMS · LKR"
        title="Bill & payment statement"
        description="Charges and payment records for this appointment."
      >
        <Link className="button subtle billing-no-print" to="/billing">
          Back to bills
        </Link>
      </PageHeading>
      <Notice>{error}</Notice>
      {pending && <Loading />}
      {data && (
        <>
          <article className="card padded">
            <div className="billing-row">
              <div>
                <h2>{data.bill.reference}</h2>
                <p>{data.bill.patientName}</p>
                <p>
                  {data.bill.doctorName} · {data.bill.appointmentReference}
                </p>
                <p>
                  Issued {dateLabel(data.bill.createdAt)} · Due{' '}
                  {dateLabel(`${data.bill.dueDate}T00:00:00+05:30`)}
                </p>
              </div>
              <Status bill={data.bill} />
            </div>
            <Charges items={data.bill.items} />
            <div className="billing-totals">
              <p>
                Total <strong>{money(data.bill.totalMinor)}</strong>
              </p>
              <p>
                Paid <strong>{money(data.bill.paidMinor)}</strong>
              </p>
              <p>
                Outstanding <strong>{money(data.bill.balanceMinor)}</strong>
              </p>
            </div>
            <div className="clinical-actions billing-no-print">
              <button className="button subtle" onClick={() => window.print()}>
                Print statement
              </button>
              <button className="button subtle" onClick={() => refresh((v) => v + 1)}>
                Refresh statement
              </button>
              {staff && data.bill.balanceMinor > 0 && (
                <button className="button primary" onClick={() => setModal('payment')}>
                  Record payment
                </button>
              )}
              {staff && data.payments.length === 0 && (
                <button className="button subtle" onClick={() => setModal('edit')}>
                  Edit charges / due date
                </button>
              )}
            </div>
          </article>
          <section className="card padded clinical-record">
            <h2>Payment history</h2>
            {!data.payments.length && <p>No payments recorded.</p>}
            {data.payments.map((p) => (
              <article className="prescription-version" key={p._id}>
                <h3>
                  {p.reference} · {money(p.amountMinor)}
                </h3>
                <p>
                  {p.method} · {dateLabel(p.createdAt)} · {timeLabel(p.createdAt)}
                </p>
                {p.externalReference && <p>Reference: {p.externalReference}</p>}
                {p.reversedAt ? (
                  <Notice>
                    Reversed on {dateLabel(p.reversedAt)}: {p.reversalReason}
                  </Notice>
                ) : (
                  user.role === 'admin' && (
                    <button className="button subtle billing-no-print" onClick={() => setModal(p)}>
                      Reverse record
                    </button>
                  )
                )}
              </article>
            ))}
          </section>
          <section className="card padded clinical-record billing-no-print">
            <h2>Bill revisions</h2>
            {data.bill.versions.map((v, i) => (
              <details key={i}>
                <summary>
                  Version {i + 1} · {dateLabel(v.at)} · {money(v.totalMinor)}
                </summary>
                <p>{v.reason}</p>
                <p>Due {v.dueDate}</p>
                <Charges items={v.items} />
              </details>
            ))}
          </section>
          {modal === 'edit' && (
            <BillEditor bill={data.bill} onClose={() => setModal(null)} onSaved={saved} />
          )}
          {modal === 'payment' && (
            <PaymentForm bill={data.bill} onClose={() => setModal(null)} onSaved={saved} />
          )}
          {modal && typeof modal === 'object' && (
            <ReversePayment
              bill={data.bill}
              payment={modal}
              onClose={() => setModal(null)}
              onSaved={saved}
            />
          )}
        </>
      )}
    </div>
  );
}
