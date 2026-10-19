import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDepartmentAI,
  recommendationConfig,
  departmentChoices,
} from '../src/recommendations/ai.js';

const config = recommendationConfig({ RECOMMENDATION_PROVIDER: 'ollama' });
const choices = departmentChoices([
  { _id: '111111111111111111111111', name: 'General Medicine' },
  { _id: '222222222222222222222222', name: 'Dermatology' },
]);
const input = {
  symptoms: 'My skin feels itchy',
  comments: '',
  duration: { value: 2, unit: 'days' },
  name: 'SECRET_NAME',
  email: 'SECRET_EMAIL',
  patientId: 'SECRET_ID',
};
const answer = { decision: 'matched', departmentId: choices[1].id, evidence: ['skin feels itchy'] };
const modelAnswer = { ...answer, departmentId: '2' };
const envelope = (content = modelAnswer, extra = {}) => ({
  done: true,
  done_reason: 'stop',
  message: { content: JSON.stringify(content) },
  ...extra,
});
const reply = (value) => new Response(JSON.stringify(value));

test('AI sends only necessary fields to loopback, asks for structured output and validates evidence', async () => {
  let request;
  const ai = createDepartmentAI(config, {
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return reply(envelope());
    },
  });
  assert.deepEqual(await ai.recommend(input, choices), { status: 'ok', ...answer });
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.redirect, 'error');
  assert.ok(!request.body.includes('SECRET'));
  const sent = JSON.parse(request.body);
  assert.equal(sent.model, config.model);
  assert.equal(sent.stream, false);
  assert.deepEqual(sent.format.required.sort(), ['decision', 'departmentId', 'evidence']);
  assert.equal(sent.format.additionalProperties, false);
  assert.deepEqual(sent.format.properties.decision.enum, ['matched', 'staff', 'review']);
  assert.ok(!sent.messages[0].content.includes('second local model'));
  assert.ok(!sent.messages[0].content.includes('Return unclear'));
  assert.equal(sent.options.temperature, 0);
  assert.deepEqual(
    JSON.parse(sent.messages[1].content).departments.map((d) => d.id),
    ['1', '2'],
  );
  assert.ok(!request.body.includes(choices[1].id));
});

test('default single-model mode makes only one call even when the answer is invalid', async () => {
  let calls = 0;
  const ai = createDepartmentAI(config, {
    fetchImpl: async () => {
      calls++;
      return reply(envelope({ ...modelAnswer, evidence: ['not in the description'] }));
    },
  });
  assert.equal(ai.thinkingEnabled, false);
  assert.equal((await ai.recommend(input, choices)).status, 'invalid');
  assert.equal(calls, 1);
});

test('invalid, truncated, ungrounded or excessive model output never becomes an AI suggestion', async () => {
  for (const result of [
    envelope(modelAnswer, { done_reason: 'length' }),
    envelope(modelAnswer, { done: false }),
    envelope({ ...modelAnswer, departmentId: 'invented' }),
    envelope({ ...modelAnswer, departmentId: null }),
    envelope({ ...modelAnswer, evidence: ['invented symptom'] }),
    envelope({ ...modelAnswer, evidence: [] }),
    envelope({ ...modelAnswer, diagnosis: 'invented diagnosis' }),
    envelope({ decision: 'staff', departmentId: '2', evidence: [] }),
    envelope(modelAnswer, { message: { content: 'not JSON' } }),
    envelope(modelAnswer, { message: { content: JSON.stringify(modelAnswer), tool_calls: [{}] } }),
    { padding: 'x'.repeat(33000) },
  ]) {
    const ai = createDepartmentAI(config, { fetchImpl: async () => reply(result) });
    assert.notEqual((await ai.recommend(input, choices)).status, 'ok');
  }
});

test('model can abstain or ask for review without returning a department', async () => {
  for (const decision of ['staff', 'review']) {
    const value = { decision, departmentId: null, evidence: [] };
    const ai = createDepartmentAI(config, { fetchImpl: async () => reply(envelope(value)) });
    assert.deepEqual(await ai.recommend(input, choices), { status: 'ok', ...value });
  }
});

test('evidence preserves everyday wording instead of combining or correcting patient words', async () => {
  const description = { ...input, symptoms: 'my nose hurt and itchy. ', comments: '' };
  const directory = departmentChoices([{ _id: '333333333333333333333333', name: 'ENT' }]);
  for (const [quote, expected] of [
    ['nose hurt and itchy', 'ok'],
    ['nose itchy', 'invalid'],
    ['my nose hurts and is itchy', 'invalid'],
  ]) {
    const ai = createDepartmentAI(config, {
      fetchImpl: async () =>
        reply(envelope({ decision: 'matched', departmentId: '1', evidence: [quote] })),
    });
    const result = await ai.recommend(description, directory);
    assert.equal(result.status, expected);
    if (expected === 'ok') assert.equal(result.departmentId, directory[0].id);
  }
});

test('timeout, disconnected caller and occupied model release capacity without leaking provider errors', async () => {
  let calls = 0;
  const ai = createDepartmentAI(
    { ...config, timeoutMs: 30 },
    {
      fetchImpl: async (_url, { signal }) => {
        calls++;
        if (calls > 1) return reply(envelope());
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('PRIVATE_PROVIDER_ERROR')), {
            once: true,
          }),
        );
      },
    },
  );
  const first = ai.recommend(input, choices);
  assert.equal((await ai.recommend(input, choices)).status, 'busy');
  assert.equal((await first).status, 'timeout');
  assert.equal((await ai.recommend(input, choices)).status, 'ok');
  const controller = new AbortController();
  const cancellable = createDepartmentAI(config, {
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
      ),
  });
  const pending = cancellable.recommend(input, choices, { signal: controller.signal });
  controller.abort();
  assert.equal((await pending).status, 'timeout');
});

test('disabled AI and empty directory do not contact the provider; errors return a bounded status', async () => {
  const fail = async () => {
    throw new Error('PRIVATE_PROVIDER_ERROR');
  };
  assert.equal(
    (await createDepartmentAI(undefined, { fetchImpl: fail }).recommend(input, choices)).status,
    'disabled',
  );
  assert.equal(
    (await createDepartmentAI(config, { fetchImpl: fail }).recommend(input, [])).status,
    'unavailable',
  );
  assert.equal(
    (await createDepartmentAI(config, { fetchImpl: fail }).recommend(input, choices)).status,
    'unavailable',
  );
  const missing = createDepartmentAI(config, {
    fetchImpl: async () => new Response('private details', { status: 404 }),
  });
  assert.deepEqual(await missing.recommend(input, choices), { status: 'unavailable' });
});

test('configuration rejects external origins, cloud models and unsafe limits', () => {
  for (const environment of [
    { OLLAMA_BASE_URL: 'https://ollama.com' },
    { OLLAMA_BASE_URL: 'http://127.0.0.1:11434/redirect' },
    { OLLAMA_BASE_URL: 'http://user:pass@localhost:11434' },
    { OLLAMA_BASE_URL: 'http://localhost:11434?token=secret' },
    { OLLAMA_MODEL: 'qwen:cloud' },
    { OLLAMA_TIMEOUT_MS: '0' },
    { RECOMMENDATION_PROVIDER: 'cloud' },
  ])
    assert.throws(() => recommendationConfig(environment));
  assert.equal(recommendationConfig().provider, 'rules');
  assert.deepEqual(departmentChoices([{ _id: 'x', name: 'Unreviewed Service' }]), []);
});

test('one thinking retry releases the first model, uses final validated JSON and hides reasoning', async () => {
  const calls = [];
  const ai = createDepartmentAI(
    { ...config, thinkingModel: 'qwen3:4b', thinkingTimeoutMs: 1000 },
    {
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push({ url, body });
        if (url.endsWith('/api/generate')) return reply({ done: true });
        if (!body.think)
          return reply(envelope({ decision: 'unclear', departmentId: null, evidence: [] }));
        return reply(
          envelope(modelAnswer, {
            message: { content: JSON.stringify(modelAnswer), thinking: 'PRIVATE_REASONING' },
          }),
        );
      },
    },
  );
  const result = await ai.recommend(input, choices);
  assert.equal(result.status, 'ok');
  assert.equal(result.departmentId, choices[1].id);
  assert.equal(result.model, 'qwen3:4b');
  assert.equal(result.thinkingAttempted, true);
  assert.equal(result.thinkingStatus, 'ok');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].body.keep_alive, 0);
  assert.equal(calls[2].body.think, true);
  assert.equal(calls[2].body.keep_alive, 0);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_REASONING'));
  assert.ok(!JSON.stringify(calls[2]).includes('SECRET'));
});

test('thinking never retries valid matches, safety/scope referrals or a missing provider', async () => {
  for (const decision of ['matched', 'staff', 'review', 'missing']) {
    let count = 0;
    const ai = createDepartmentAI(
      { ...config, thinkingModel: 'qwen3:4b', thinkingTimeoutMs: 1000 },
      {
        fetchImpl: async () => {
          count++;
          return decision === 'missing'
            ? new Response('', { status: 404 })
            : reply(
                envelope(
                  decision === 'matched'
                    ? modelAnswer
                    : { decision, departmentId: null, evidence: [] },
                ),
              );
        },
      },
    );
    await ai.recommend(input, choices);
    assert.equal(count, 1, decision);
  }
});

test('failed thinking attempt keeps primary abstention, releases capacity and never loops', async () => {
  for (const failure of ['invalid', 'missing', 'timeout']) {
    let count = 0;
    const ai = createDepartmentAI(
      { ...config, thinkingModel: 'qwen3:4b', thinkingTimeoutMs: 20 },
      {
        fetchImpl: async (url, options) => {
          count++;
          if (url.endsWith('/api/generate')) return reply({ done: true });
          if (!JSON.parse(options.body).think)
            return reply(envelope({ decision: 'unclear', departmentId: null, evidence: [] }));
          assert.equal((await ai.recommend(input, choices)).status, 'busy');
          if (failure === 'timeout')
            return new Promise((_resolve, reject) =>
              options.signal.addEventListener('abort', () => reject(new Error('timeout')), {
                once: true,
              }),
            );
          return failure === 'missing'
            ? new Response('', { status: 404 })
            : reply(envelope({ ...modelAnswer, evidence: ['invented symptom'] }));
        },
      },
    );
    const result = await ai.recommend(input, choices);
    assert.equal(result.decision, 'unclear');
    assert.equal(result.thinkingAttempted, true);
    assert.notEqual(result.thinkingStatus, 'ok');
    assert.equal(count, 3);
  }
});

test('invalid primary output gets at most one retry and cancellation prevents the retry', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let count = 0;
    const ai = createDepartmentAI(
      { ...config, thinkingModel: 'qwen3:4b', thinkingTimeoutMs: 1000 },
      {
        fetchImpl: async (url, options) => {
          count++;
          if (url.endsWith('/api/generate')) return reply({ done: true });
          if (JSON.parse(options.body).think) return reply(envelope(modelAnswer));
          if (cancel) controller.abort();
          return reply(envelope({ ...modelAnswer, evidence: ['made up'] }));
        },
      },
    );
    const result = await ai.recommend(input, choices, { signal: controller.signal });
    assert.equal(count, cancel ? 1 : 3);
    assert.equal(result.status, cancel ? 'invalid' : 'ok');
  }
  assert.throws(() => recommendationConfig({ OLLAMA_THINKING_MODEL: 'qwen:cloud' }));
});
