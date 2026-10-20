import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import {
  createDepartmentAI,
  recommendationConfig,
  departmentChoices,
} from '../src/recommendations/ai.js';
import { departmentCatalog } from '../src/recommendations/departments.js';

// Explicit live smoke test: two fictional descriptions, no database access.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
try {
  const config = recommendationConfig({ ...process.env, RECOMMENDATION_PROVIDER: 'groq' });
  const ai = createDepartmentAI(config);
  const choices = departmentChoices(departmentCatalog.map((d) => ({ _id: d.id, name: d.name })));
  const scenarios = [
    { symptoms: 'my nose hurt and itchy.', expected: 'ent' },
    {
      symptoms: 'I need a routine appointment for my thyroid follow-up',
      expected: 'endocrinology',
    },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const started = Date.now();
    const result = await ai.recommend({ symptoms: scenario.symptoms, comments: '' }, choices);
    const passed =
      result.status === 'ok' &&
      result.decision === 'matched' &&
      result.departmentId === scenario.expected;
    console.log(
      JSON.stringify({
        scenario: index + 1,
        passed,
        status: result.status,
        decision: result.decision,
        department: choices.find((d) => d.id === result.departmentId)?.name,
        elapsedMs: Date.now() - started,
      }),
    );
    if (!passed) {
      process.exitCode = 1;
      if (result.status !== 'ok') {
        console.error(
          'Groq check did not complete. Check the API key, account quota and network connection. Provider error bodies and secrets are not printed.',
        );
        break;
      }
    }
  }
} catch {
  console.error(
    'Groq configuration is incomplete or invalid. Add GROQ_API_KEY to the private root .env and see docs/groq-ai.md.',
  );
  process.exitCode = 1;
}
