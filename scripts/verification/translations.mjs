import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const en = JSON.parse(await readFile('client/src/i18n/en.json'));
for (const language of ['si', 'ta']) {
  const catalog = JSON.parse(await readFile(`client/src/i18n/${language}.json`));
  assert.deepEqual(
    Object.keys(catalog).sort(),
    Object.keys(en).sort(),
    `${language}: catalogue keys`,
  );
  for (const [key, text] of Object.entries(catalog)) {
    assert.ok(typeof text === 'string' && text.trim(), `${language}: empty translation`);
    assert.deepEqual(
      (text.match(/\{\w+\}/g) || []).sort(),
      (key.match(/\{\w+\}/g) || []).sort(),
      `${language}: placeholders in ${key}`,
    );
  }
  console.log(
    `${language}: ${Object.keys(catalog).length} nonempty entries and matching interpolation placeholders. Linguistic review remains manual.`,
  );
}
