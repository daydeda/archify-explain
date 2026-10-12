import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { applyTemplate } from '../renderers/shared/utils.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'archify.mjs');
const template = fs.readFileSync(path.join(root, 'assets', 'template.html'), 'utf8');

function render(t, { withExplain }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-explain-panel-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const diagram = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Explain panel', output: 'out.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', pos: [40, 40], size: [140, 60] },
      { id: 'api', type: 'backend', label: 'API', pos: [260, 40], size: [140, 60] },
      { id: 'db', type: 'database', label: 'DB', pos: [480, 40], size: [140, 60] },
    ],
    connections: [
      { from: 'web', to: 'api', label: 'HTTPS' },
      { id: 'sql', from: 'api', to: 'db', label: 'SQL' },
    ],
  };
  if (withExplain) {
    diagram.components[1].details = { summary: 'Serves </script> safely.', steps: ['Checks the token.', 'Queries the DB.'] };
    diagram.connections[1].explanation = 'The API is the only writer.';
  }
  const input = path.join(dir, 'in.json');
  const output = path.join(dir, 'out.html');
  fs.writeFileSync(input, JSON.stringify(diagram));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', input, output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return fs.readFileSync(output, 'utf8');
}

function explainData(html) {
  const match = html.match(/<script id="archify-explain-data" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

test('authored details and explanations are embedded for the passport, keyed by node id and edge key', (t) => {
  const html = render(t, { withExplain: true });
  assert.deepEqual(explainData(html), {
    nodes: { api: { summary: 'Serves </script> safely.', steps: ['Checks the token.', 'Queries the DB.'] } },
    edges: { 1: 'The API is the only writer.' },
  });
  // The second connection carries data-edge-key="1", which the passport uses.
  assert.match(html, /data-edge-from="api" data-edge-to="db" data-edge-label="SQL" data-edge-key="1"/);
  // Script-breaking text stays escaped inside the JSON block.
  assert.ok(!/Serves <\/script>/.test(html));
});

test('the explanation data stays outside the SVG so exports are unchanged', (t) => {
  const html = render(t, { withExplain: true });
  const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
  assert.ok(!svg.includes('archify-explain-data'));
  assert.ok(!svg.includes('Checks the token.'));
});

test('diagrams without details emit no explanation data and keep the passport section hidden', (t) => {
  const html = render(t, { withExplain: false });
  assert.equal(explainData(html), null);
  assert.ok(!html.includes('<!-- ARCHIFY:EXPLAIN_DATA -->'));
  assert.match(html, /<div class="semantic-passport-explain" id="focus-explain" hidden>/);
});

test('a custom template without the explanation slot fails loudly only when details are authored', () => {
  const legacy = template.replace('    <!-- ARCHIFY:EXPLAIN_DATA -->\n', '');
  const base = { title: 'T', subtitle: '', svg: '      <!-- ARCHIFY:SVG_SLOT_START -->\n      <!-- ARCHIFY:SVG_SLOT_END -->', cards: '' };
  assert.doesNotThrow(() => applyTemplate(legacy, { ...base, explain: null }));
  assert.throws(() => applyTemplate(legacy, { ...base, explain: { nodes: {}, edges: { 0: 'x' } } }), /EXPLAIN_DATA/);
});
