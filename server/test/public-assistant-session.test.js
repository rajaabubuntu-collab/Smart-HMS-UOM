import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssistantSession,
  assistantSessionKey,
  assistantIdleMs,
} from '../../client/src/public-assistant-session.js';
function fixture() {
  let time = 10000000;
  const entries = new Map(),
    timers = new Map();
  let id = 0;
  const storage = {
    getItem: (key) => entries.get(key),
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const options = {
    storage,
    now: () => time,
    schedule: (fn, delay) => {
      timers.set(++id, { fn, at: time + delay });
      return id;
    },
    cancel: (key) => timers.delete(key),
  };
  return {
    storage,
    options,
    create: () => createAssistantSession(options),
    advance(ms, fire = true) {
      time += ms;
      if (fire)
        for (const [key, job] of timers)
          if (job.at <= time) {
            timers.delete(key);
            job.fn();
          }
    },
  };
}
const turn = (question = 'Opening hours?', mode = 'information') => ({
  question,
  response: {
    mode,
    reply: 'Please see the published reception hours.',
    context: 'signed-context',
    facts: [],
  },
});
function append(session, value = turn()) {
  session.touch();
  session.append(value, session.getRevision());
}

test('tab snapshot restores conversation/context without extending inactivity on reload or navigation', () => {
  const f = fixture(),
    first = f.create();
  append(first);
  f.advance(20 * 60000);
  first.dispose();
  const second = f.create();
  assert.deepEqual(second.getSnapshot(), [turn()]);
  assert.equal(second.getSnapshot()[0].response.context, 'signed-context');
  f.advance(10 * 60000);
  assert.equal(second.getSnapshot().length, 0);
  assert.equal(f.storage.getItem(assistantSessionKey), undefined);
  second.dispose();
});
test('chat interaction extends idle expiry; suspended tabs expire on wake before reuse', () => {
  const f = fixture(),
    session = f.create();
  append(session);
  f.advance(20 * 60000);
  session.touch();
  f.advance(20 * 60000);
  assert.equal(session.getSnapshot().length, 1);
  f.advance(10 * 60000, false);
  session.expire();
  assert.equal(session.getSnapshot().length, 0);
  append(session);
  f.advance(assistantIdleMs + 1, false);
  session.touch();
  assert.equal(session.getSnapshot().length, 0);
  session.dispose();
});
test('anonymous sign-in preserves chat, same-account reload keeps it, logout and account switches clear it', () => {
  const f = fixture(),
    session = f.create();
  append(session);
  session.identify('patient-A');
  assert.equal(session.getSnapshot().length, 1);
  session.dispose();
  const reloaded = f.create();
  reloaded.identify('patient-A');
  assert.equal(reloaded.getSnapshot().length, 1);
  reloaded.identify('patient-B');
  assert.equal(reloaded.getSnapshot().length, 0);
  append(reloaded);
  reloaded.logout();
  assert.equal(reloaded.getSnapshot().length, 0);
  assert.equal(f.storage.getItem(assistantSessionKey), undefined);
  append(reloaded);
  reloaded.identify('patient-B');
  reloaded.identify(null);
  assert.equal(reloaded.getSnapshot().length, 0);
  reloaded.dispose();
});
test('clear and expiry invalidate pending answers so late requests cannot resurrect a conversation', () => {
  const f = fixture(),
    session = f.create();
  let reset = 0;
  session.onReset(() => reset++);
  session.touch();
  const revision = session.getRevision();
  session.clear();
  session.append(turn(), revision);
  assert.equal(session.getSnapshot().length, 0);
  session.touch();
  const next = session.getRevision();
  f.advance(assistantIdleMs + 1);
  session.append(turn(), next);
  assert.equal(session.getSnapshot().length, 0);
  assert.equal(reset, 2);
  session.dispose();
});
test('disabled storage falls back to memory; snapshots are bounded and exclude private/clinical requests', () => {
  const f = fixture();
  const session = createAssistantSession({
    ...f.options,
    storage: {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    },
  });
  append(session);
  assert.equal(session.getSnapshot().length, 1);
  session.clear();
  assert.equal(session.getSnapshot().length, 0);
  session.dispose();
  const persistent = f.create();
  for (let i = 0; i < 10; i++) append(persistent, turn(`Question ${i}`));
  assert.equal(persistent.getSnapshot().length, 6);
  assert.equal(JSON.parse(f.storage.getItem(assistantSessionKey)).turns.length, 6);
  for (const mode of ['privacy', 'medical', 'urgent'])
    append(persistent, turn('Do not store this', mode));
  assert.ok(!f.storage.getItem(assistantSessionKey).includes('Do not store this'));
  persistent.dispose();
});
test('malformed, oversized, expired and unsafe-link snapshots are discarded without breaking chat', () => {
  const f = fixture();
  const snapshot = { version: 1, owner: null, touched: 10000000, turns: [turn()] };
  for (const raw of [
    '{',
    'x'.repeat(120001),
    JSON.stringify({ ...snapshot, version: 0 }),
    JSON.stringify({ ...snapshot, touched: 1 }),
    JSON.stringify({ ...snapshot, touched: 999999999 }),
    JSON.stringify({
      ...snapshot,
      turns: [
        {
          question: 'Hello',
          response: {
            mode: 'information',
            facts: [{ id: 'x', title: 'x', text: 'x', href: 'https://evil.example' }],
          },
        },
      ],
    }),
    JSON.stringify({
      ...snapshot,
      turns: [{ question: 'Hello', response: { mode: 'information', facts: [], doctors: [{}] } }],
    }),
  ]) {
    f.storage.setItem(assistantSessionKey, raw);
    const session = f.create();
    assert.equal(session.getSnapshot().length, 0);
    assert.equal(f.storage.getItem(assistantSessionKey), undefined);
    session.dispose();
  }
});
