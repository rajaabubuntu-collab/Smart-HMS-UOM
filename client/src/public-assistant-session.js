export const assistantSessionKey = 'smart-hms:public-chat:v1';
export const assistantIdleMs = 30 * 60 * 1000;
const modes = ['information', 'medical', 'urgent', 'unknown', 'privacy', 'unavailable', 'busy'];
const text = (value, max = 6000) => typeof value === 'string' && value.length <= max;
const date = (value) => text(value, 50) && Number.isFinite(Date.parse(value));
const href = (value) =>
  text(value, 400) &&
  /^\/(?!\/)/.test(value) &&
  ![...value].some((char) => char === '\\' || char.charCodeAt(0) <= 32);

// Browser storage can be missing, old or malformed. Never render an unchecked snapshot.
function validTurn(turn) {
  const r = turn?.response;
  return (
    text(turn?.question, 500) &&
    r &&
    modes.includes(r.mode) &&
    (!r.reply || text(r.reply, 1400)) &&
    (!r.context || text(r.context, 6000)) &&
    Array.isArray(r.facts) &&
    r.facts.length <= 6 &&
    r.facts.every(
      (f) =>
        f &&
        text(f.id, 50) &&
        text(f.title, 200) &&
        text(f.text) &&
        href(f.href) &&
        (!f.values ||
          (typeof f.values === 'object' &&
            Object.values(f.values).every((v) => text(v) || typeof v === 'number'))) &&
        (!f.hours ||
          (Array.isArray(f.hours) &&
            f.hours.length <= 7 &&
            f.hours.every(
              (d) =>
                d &&
                text(d.day, 20) &&
                (!d.opens || text(d.opens, 10)) &&
                (!d.closes || text(d.closes, 10)),
            ))),
    ) &&
    (!r.checkedAt || date(r.checkedAt)) &&
    (!r.filters ||
      ((!r.filters.date ||
        (/^\d{4}-\d{2}-\d{2}$/.test(r.filters.date) &&
          (r.status === 'invalid-date' || date(`${r.filters.date}T00:00:00+05:30`)))) &&
        (!r.filters.period ||
          ['any', 'morning', 'afternoon', 'evening'].includes(r.filters.period)))) &&
    (!r.doctors ||
      (Array.isArray(r.doctors) &&
        r.doctors.length <= 4 &&
        Number.isSafeInteger(r.total) &&
        r.total >= 0 &&
        r.doctors.every(
          (d) =>
            d &&
            text(d.id, 24) &&
            text(d.name, 100) &&
            text(d.department, 200) &&
            text(d.specialization, 200) &&
            text(d.qualification, 200) &&
            Number.isSafeInteger(d.consultationFeeMinor) &&
            d.consultationFeeMinor >= 0 &&
            href(d.href) &&
            href(d.bookingHref) &&
            Array.isArray(d.slots) &&
            d.slots.length <= 3 &&
            d.slots.every(
              (s) => s && text(s.id, 24) && date(s.startsAt) && date(s.endsAt) && href(s.href),
            ),
        )))
  );
}

export function createAssistantSession({
  storage,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let turns = [],
    owner = null,
    touched = 0,
    timer,
    revision = 0;
  const listeners = new Set(),
    resets = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  function persist() {
    try {
      // Do not persist requests that the assistant rejected as private or clinical.
      const saved = turns.filter(
        (turn) => !['privacy', 'medical', 'urgent'].includes(turn.response.mode),
      );
      if (!saved.length) storage?.removeItem(assistantSessionKey);
      else
        storage?.setItem(
          assistantSessionKey,
          JSON.stringify({ version: 1, owner, touched, turns: saved }),
        );
    } catch {
      /* Storage disabled/full: navigation still works in memory. */
    }
  }
  function clear() {
    cancel(timer);
    turns = [];
    touched = 0;
    revision++;
    persist();
    emit();
    resets.forEach((fn) => fn());
  }
  function expire() {
    if (touched && (now() - touched >= assistantIdleMs || touched > now())) clear();
  }
  function arm() {
    cancel(timer);
    if (touched) timer = schedule(expire, Math.max(0, touched + assistantIdleMs - now()));
  }
  try {
    const raw = storage?.getItem(assistantSessionKey);
    if (raw) {
      if (raw.length > 120000) throw new Error('oversized');
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        !(data.owner === null || text(data.owner, 100)) ||
        !Number.isFinite(data.touched) ||
        data.touched <= 0 ||
        now() - data.touched >= assistantIdleMs ||
        data.touched > now() ||
        !Array.isArray(data.turns) ||
        data.turns.length > 6 ||
        !data.turns.every(validTurn)
      )
        throw new Error('invalid');
      turns = data.turns;
      owner = data.owner;
      touched = data.touched;
      arm();
    }
  } catch {
    try {
      storage?.removeItem(assistantSessionKey);
    } catch {
      /* Unavailable storage. */
    }
  }
  return {
    getSnapshot: () => turns,
    getRevision: () => revision,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onReset(fn) {
      resets.add(fn);
      return () => resets.delete(fn);
    },
    expire,
    touch() {
      expire();
      touched = now();
      persist();
      arm();
    },
    append(turn, expectedRevision) {
      expire();
      if (expectedRevision !== revision || !validTurn(turn)) return;
      turns = [...turns.slice(-5), turn];
      touched = now();
      persist();
      arm();
      emit();
    },
    identify(userId) {
      expire();
      const next = userId || null;
      // Anonymous -> signed-in preserves this visit. Logout/account changes erase it.
      if (owner && owner !== next) clear();
      owner = next;
      persist();
    },
    logout() {
      clear();
      owner = null;
    },
    clear,
    dispose() {
      cancel(timer);
      listeners.clear();
      resets.clear();
    },
  };
}

let storage;
try {
  if (typeof window !== 'undefined') storage = window.sessionStorage;
} catch {
  /* In-memory fallback. */
}
export const assistantSession = createAssistantSession({ storage });
if (typeof window !== 'undefined') {
  // Timers may be suspended in background tabs. Check before a restored page is used.
  window.addEventListener('pageshow', assistantSession.expire);
  window.addEventListener('focus', assistantSession.expire);
  document.addEventListener('visibilitychange', assistantSession.expire);
}
