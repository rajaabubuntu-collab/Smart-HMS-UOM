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

// Catalogue parity alone misses strings that are absent from ALL catalogues.
// Use ESLint's parser to check literal UI calls and translatable photo metadata.
const { Linter } = await import('eslint');
const { readdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const linter = new Linter();
const missing = [];
const check = (node, file) => {
  if (node?.type === 'Literal' && typeof node.value === 'string' && !(node.value in en))
    missing.push(`${file}:${node.loc.start.line}: ${node.value}`);
  if (node?.type === 'ConditionalExpression') {
    check(node.consequent, file);
    check(node.alternate, file);
  }
};
async function inspectDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await inspectDirectory(file);
    else if (/\.jsx?$/.test(entry.name)) {
      const messages = linter.verify(await readFile(file, 'utf8'), [
        {
          languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: {
            translations: {
              rules: {
                known: {
                  create() {
                    return {
                      CallExpression(node) {
                        if (node.callee.name === 't') check(node.arguments[0], file);
                      },
                      Property(node) {
                        if (['alt', 'caption'].includes(node.key.name)) check(node.value, file);
                      },
                    };
                  },
                },
              },
            },
          },
          rules: { 'translations/known': 'error' },
        },
      ]);
      assert.ok(!messages.some((message) => message.fatal), `Cannot parse ${file}`);
    }
  }
}
await inspectDirectory('client/src');
assert.equal(missing.length, 0, `Missing UI translation keys:\n${missing.join('\n')}`);
console.log('Literal UI labels and photo metadata have translation keys.');
