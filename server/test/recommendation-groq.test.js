import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDepartmentAI,
  recommendationConfig,
  departmentChoices,
} from '../src/recommendations/ai.js';

const config = recommendationConfig({
  RECOMMENDATION_PROVIDER: 'groq',
  GROQ_API_KEY: 'test-secret',
  OLLAMA_THINKING_MODEL: 'qwen3:4b',
});
const choices = departmentChoices([{ _id: 'private-database-id', name: 'ENT' }]);
const input = {
  symptoms: 'my nose hurt and itchy.',
  comments: '',
  name: 'PRIVATE_NAME',
  email: 'PRIVATE_EMAIL',
  patientId: 'PRIVATE_ID',
};
const answer = { decision: 'matched', departmentId: '1', evidence: ['my nose hurt and itchy.'] };
const envelope = (output = answer, extra = {}) => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) }, ...extra }],
});
const reply = (value) => new Response(JSON.stringify(value));

test('Groq configuration requires a key, restricts models and disables local thinking retries', () => {
  assert.throws(
    () => recommendationConfig({ RECOMMENDATION_PROVIDER: 'groq' }),
    /GROQ_API_KEY is required/,
  );
  assert.throws(
    () =>
      recommendationConfig({
        RECOMMENDATION_PROVIDER: 'groq',
        GROQ_API_KEY: 'secret',
        GROQ_MODEL: 'arbitrary',
      }),
    /Invalid recommendation configuration/,
  );
  assert.equal(config.thinkingModel, undefined);
  assert.equal(config.model, 'openai/gpt-oss-120b');
  assert.equal(config.timeoutMs, 20000);
});

test('Groq uses fixed HTTPS, structured output and minimal fields; maps allowed IDs back', async () => {
  let request;
  const ai = createDepartmentAI(config, {
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return reply(envelope());
    },
  });
  assert.deepEqual(await ai.recommend(input, choices), {
    status: 'ok',
    ...answer,
    departmentId: 'private-database-id',
  });
  assert.equal(ai.thinkingEnabled, false);
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.Authorization, 'Bearer test-secret');
  const body = JSON.parse(request.body);
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.include_reasoning, false);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(body.max_completion_tokens, 1024);
  assert.ok(!/PRIVATE_|test-secret|private-database-id/.test(request.body));
  assert.deepEqual(Object.keys(JSON.parse(body.messages[1].content).patientDescription).sort(), [
    'comments',
    'symptoms',
  ]);
});

test('Groq rejects invented departments/evidence, invalid shapes, refusals and truncated completions', async () => {
  for (const value of [
    envelope({ ...answer, departmentId: '99' }),
    envelope({ ...answer, evidence: ['different symptoms'] }),
    envelope({ ...answer, diagnosis: 'unsupported' }),
    envelope({ decision: 'staff', departmentId: '1', evidence: [] }),
    envelope(answer, { finish_reason: 'length' }),
    envelope(answer, { message: { content: JSON.stringify(answer), tool_calls: [{}] } }),
    envelope(answer, { message: { content: JSON.stringify(answer), refusal: 'refused' } }),
    envelope(answer, { message: { content: 'invalid json' } }),
    { choices: [] },
  ]) {
    let calls = 0;
    const ai = createDepartmentAI(config, {
      fetchImpl: async () => {
        calls++;
        return reply(value);
      },
    });
    assert.equal((await ai.recommend(input, choices)).status, 'invalid');
    assert.equal(calls, 1, 'No cloud or local retry');
  }
});

test('Groq staff and review decisions remain valid referrals', async () => {
  for (const decision of ['staff', 'review']) {
    const output = { decision, departmentId: null, evidence: [] };
    const ai = createDepartmentAI(config, { fetchImpl: async () => reply(envelope(output)) });
    assert.deepEqual(await ai.recommend(input, choices), { status: 'ok', ...output });
  }
});

test('Groq rate limit starts a bounded cooldown without retrying or exposing provider details', async () => {
  let calls = 0;
  const ai = createDepartmentAI(config, {
    fetchImpl: async () => {
      calls++;
      return new Response('PRIVATE_ERROR', { status: 429, headers: { 'retry-after': '60' } });
    },
  });
  assert.deepEqual(await ai.recommend(input, choices), { status: 'rate_limited' });
  assert.deepEqual(await ai.recommend(input, choices), { status: 'rate_limited' });
  assert.equal(calls, 1);
});

test('Groq auth errors, network errors and oversized output fail safely', async () => {
  for (const fetchImpl of [
    async () => new Response('PRIVATE_KEY_ERROR', { status: 401 }),
    async () => {
      throw new Error('PRIVATE_NETWORK_ERROR');
    },
    async () => reply({ padding: 'x'.repeat(33000) }),
  ]) {
    const ai = createDepartmentAI(config, { fetchImpl });
    assert.deepEqual(await ai.recommend(input, choices), { status: 'unavailable' });
  }
});

test('Groq timeout and caller cancellation release capacity', async () => {
  let calls = 0;
  const ai = createDepartmentAI(
    { ...config, timeoutMs: 20 },
    {
      fetchImpl: async (_url, { signal }) => {
        calls++;
        if (calls > 2) return reply(envelope());
        return new Promise((_resolve, reject) => {
          if (signal.aborted) reject(new Error('aborted'));
          else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      },
    },
  );
  const pending = ai.recommend(input, choices);
  assert.equal((await ai.recommend(input, choices)).status, 'busy');
  assert.equal((await pending).status, 'timeout');
  const controller = new AbortController();
  const cancelled = ai.recommend(input, choices, { signal: controller.signal });
  controller.abort();
  assert.equal((await cancelled).status, 'timeout');
  assert.equal((await ai.recommend(input, choices)).status, 'ok');
});
