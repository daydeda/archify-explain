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

const thai = {
  locale: 'th',
  label: 'ไทย',
  strings: { 'Language demo': 'ตัวอย่างภาษา', API: 'เอพีไอ', 'Serves requests.': 'รับคำขอ' },
};

function architecture(alternate) {
  const diagram = {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Language demo', output: 'out.html' },
    components: [
      { id: 'web', type: 'frontend', label: 'Web', pos: [40, 40], size: [140, 60] },
      { id: 'api', type: 'backend', label: 'API', pos: [260, 40], size: [140, 60], details: { summary: 'Serves requests.' } },
    ],
    connections: [{ from: 'web', to: 'api', label: 'HTTPS' }],
  };
  if (alternate !== undefined) diagram.meta.alternate_language = alternate;
  return diagram;
}

function run(t, type, json, command = 'render') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-alternate-language-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'in.json');
  const output = path.join(dir, 'out.html');
  fs.writeFileSync(input, JSON.stringify(json));
  const args = command === 'render' ? [cli, 'render', type, input, output] : [cli, 'validate', type, input, '--json'];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { result, html: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '' };
}

function payload(html) {
  const match = html.match(/<script id="archify-alternate-language-data" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

test('an alternate language is embedded with base and alternate labels', (t) => {
  const { result, html } = run(t, 'architecture', architecture(thai));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(payload(html), {
    base: { locale: 'en', label: 'EN' },
    alternate: { locale: 'th', label: 'ไทย' },
    strings: thai.strings,
  });
  // The switch exists but stays hidden until the script finds data.
  assert.match(html, /<button id="btn-language" type="button" hidden/);
});

test('base_label overrides the default short code', (t) => {
  const { html } = run(t, 'architecture', architecture({ ...thai, base_label: 'English' }));
  assert.equal(payload(html).base.label, 'English');
});

test('translations stay out of the SVG so exports keep the authored language', (t) => {
  const { html } = run(t, 'architecture', architecture(thai));
  const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
  assert.ok(!svg.includes('ตัวอย่างภาษา'));
  assert.ok(!svg.includes('archify-alternate-language-data'));
});

test('without alternate_language there is no payload', (t) => {
  const { result, html } = run(t, 'architecture', architecture());
  assert.equal(result.status, 0);
  assert.equal(payload(html), null);
  assert.ok(!html.includes('<!-- ARCHIFY:ALTERNATE_LANGUAGE_DATA -->'));
});

test('every diagram mode accepts alternate_language', (t) => {
  for (const [type, file] of [
    ['workflow', 'agent-tool-call.workflow.json'],
    ['sequence', 'cache-miss-request.sequence.json'],
    ['dataflow', 'product-analytics.dataflow.json'],
    ['lifecycle', 'agent-run.lifecycle.json'],
  ]) {
    const json = JSON.parse(fs.readFileSync(path.join(root, 'examples', file), 'utf8'));
    json.meta.alternate_language = thai;
    const { result, html } = run(t, type, json);
    assert.equal(result.status, 0, `${type}: ${result.stdout}${result.stderr}`);
    assert.equal(payload(html).alternate.locale, 'th', type);
  }
});

test('malformed alternate languages are rejected', (t) => {
  for (const bad of [
    { label: 'ไทย', strings: { a: 'b' } },
    { locale: 'th', strings: { a: 'b' } },
    { locale: 'th', label: 'ไทย' },
    { locale: 'th', label: 'ไทย', strings: {} },
    { locale: 'Thai', label: 'ไทย', strings: { a: 'b' } },
    { locale: 'th', label: 'x'.repeat(25), strings: { a: 'b' } },
    { locale: 'th', label: 'ไทย', strings: { a: '' } },
    { locale: 'th', label: 'ไทย', strings: { a: 'b' }, extra: true },
  ]) {
    const { result } = run(t, 'architecture', architecture(bad), 'validate');
    assert.notEqual(result.status, 0, `expected rejection for ${JSON.stringify(bad)}`);
  }
});

test('a custom template without the slot fails loudly only when a second language is authored', () => {
  const legacy = template.replace('    <!-- ARCHIFY:ALTERNATE_LANGUAGE_DATA -->\n', '');
  const base = { title: 'T', subtitle: '', svg: '      <!-- ARCHIFY:SVG_SLOT_START -->\n      <!-- ARCHIFY:SVG_SLOT_END -->', cards: '' };
  assert.doesNotThrow(() => applyTemplate(legacy, base));
  assert.throws(() => applyTemplate(legacy, { ...base, alternateLanguage: thai }), /ALTERNATE_LANGUAGE_DATA/);
});
