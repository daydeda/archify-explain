import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { checkForUpdate } from '../scripts/check-update.mjs';

const skillRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = fs.readFileSync(path.join(skillRoot, 'skill-release.json'), 'utf8');

function fixture(packageName) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-renamed-fork-'));
  fs.writeFileSync(path.join(root, 'skill-release.json'), release);
  if (packageName) fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: packageName }));
  return root;
}

test('a renamed fork never offers upstream releases as updates', async (t) => {
  const root = fixture('archify-explain');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let fetched = false;
  const result = await checkForUpdate({
    releasePath: path.join(root, 'skill-release.json'),
    cacheDirectory: path.join(root, 'cache'),
    fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  });
  assert.deepEqual(result, { status: 'silent', reason: 'renamed-fork' });
  assert.equal(fetched, false);
});

test('the upstream package name and a missing package.json keep the normal update check', async (t) => {
  for (const name of ['archify', null]) {
    const root = fixture(name);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const result = await checkForUpdate({
      releasePath: path.join(root, 'skill-release.json'),
      cacheDirectory: path.join(root, 'cache'),
      fetchImpl: async () => { throw new Error('offline'); },
    });
    assert.notEqual(result.reason, 'renamed-fork');
  }
});

test('the shipped fork package is recognised as a renamed fork', async (t) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(skillRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'archify-explain');
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-renamed-fork-cache-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const result = await checkForUpdate({
    cacheDirectory: cache,
    fetchImpl: async () => { throw new Error('must not fetch'); },
  });
  assert.equal(result.reason, 'renamed-fork');
});
