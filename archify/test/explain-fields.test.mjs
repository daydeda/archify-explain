import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'archify.mjs');

function diagram({ details, explanation } = {}) {
  const api = { id: 'api', type: 'backend', label: 'API', pos: [260, 40], size: [140, 60] };
  if (details !== undefined) api.details = details;
  const call = { id: 'call', from: 'web', to: 'api', label: 'HTTPS' };
  if (explanation !== undefined) call.explanation = explanation;
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Explain fields', output: 'explain-fields.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', pos: [40, 40], size: [140, 60] },
      api,
    ],
    connections: [call],
  };
}

function validate(t, json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-explain-fields-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'candidate.json');
  fs.writeFileSync(input, JSON.stringify(json));
  return spawnSync(process.execPath, [cli, 'validate', 'architecture', input, '--json'], { encoding: 'utf8' });
}

test('component details and connection explanations are accepted', (t) => {
  const result = validate(t, diagram({
    details: { summary: 'Serves the public API.', steps: ['Checks the token.', 'Reads from the cache.'] },
    explanation: 'The web app calls the API for every page load.',
  }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('a summary alone or steps alone is enough', (t) => {
  assert.equal(validate(t, diagram({ details: { summary: 'Only a summary.' } })).status, 0);
  assert.equal(validate(t, diagram({ details: { steps: ['Only steps.'] } })).status, 0);
});

test('existing diagrams without the new fields stay valid', (t) => {
  assert.equal(validate(t, diagram()).status, 0);
});

test('malformed details and explanations are rejected', (t) => {
  for (const details of [
    {},
    { summary: '' },
    { steps: [] },
    { steps: [''] },
    { summary: 'x'.repeat(601) },
    { steps: Array.from({ length: 13 }, (_, i) => `step ${i}`) },
    { summary: 'ok', unknown: true },
    'a plain string',
  ]) {
    const result = validate(t, diagram({ details }));
    assert.notEqual(result.status, 0, `expected rejection for ${JSON.stringify(details)}`);
  }
  for (const explanation of ['', 'x'.repeat(601), 42]) {
    const result = validate(t, diagram({ explanation }));
    assert.notEqual(result.status, 0, `expected rejection for ${JSON.stringify(explanation)}`);
  }
});
