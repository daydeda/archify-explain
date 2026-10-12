import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from '../bin/visual-check.mjs';
import { desktopBrowser } from './helpers/desktop-browser.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.ARCHIFY_CHROME ? findChrome() : null;

const diagram = {
  schema_version: 1,
  diagram_type: 'architecture',
  meta: {
    title: 'Explain demo',
    output: 'explain.html',
    alternate_language: {
      locale: 'th',
      label: 'ไทย',
      strings: {
        'Explain demo': 'ตัวอย่างคำอธิบาย',
        'public API': 'API สาธารณะ',
        'Serves every page.': 'ให้บริการทุกหน้า',
        'Checks the token.': 'ตรวจ token',
        'The web app calls the API.': 'เว็บแอปเรียก API',
      },
    },
  },
  components: [
    { id: 'web', type: 'frontend', label: 'Web', pos: [40, 40], size: [140, 60] },
    {
      id: 'api', type: 'backend', label: 'API', sublabel: 'public API', pos: [300, 40], size: [140, 60],
      details: { summary: 'Serves every page.', steps: ['Checks the token.', 'Reads the cache.'] },
    },
  ],
  connections: [{ from: 'web', to: 'api', label: 'HTTPS', explanation: 'The web app calls the API.' }],
};

test('clicking a node shows its details and the language switch translates authored text', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run real-browser explain/language checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-explain-browser-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const input = path.join(scratch, 'explain.json');
  const output = path.join(scratch, 'explain.html');
  fs.writeFileSync(input, JSON.stringify(diagram));
  execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, output]);

  const browser = desktopBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  async function run(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(r.exceptionDetails, undefined, r.exceptionDetails?.exception?.description);
    return r.result?.value;
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.pageErrors=[];addEventListener('error',e=>pageErrors.push(e.message));
    window.waitFor=predicate=>new Promise((resolve,reject)=>{const start=performance.now();(function poll(){if(predicate())return resolve();if(performance.now()-start>8000)return reject(new Error('timed out'));requestAnimationFrame(poll);})();});
  ` });
  async function load({ clearStorage = false } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: pathToFileURL(output).href });
    await loaded;
    await run('document.fonts.ready');
    if (clearStorage) {
      await run(`(()=>{try{localStorage.clear();}catch(_){}})()`);
      const reloaded = browser.cdp.waitFor('Page.loadEventFired', session);
      await send('Page.reload', {});
      await reloaded;
    }
  }
  const state = () => run(`(()=>({
    lang: document.documentElement.lang,
    title: document.querySelector('h1').textContent.trim(),
    button: document.getElementById('btn-language').hidden ? null : document.getElementById('language-label').textContent,
    explainHidden: document.getElementById('focus-explain').hidden,
    summary: document.getElementById('focus-explain-summary').textContent,
    steps: [...document.querySelectorAll('#focus-explain-steps li')].map(li => li.textContent),
    why: [...document.querySelectorAll('.relationship-lens-why')].map(n => n.textContent),
    sublabel: [...document.querySelectorAll('[data-node-id="api"] text')].map(n => n.textContent).join('|'),
    errors: pageErrors,
  }))()`);

  await load({ clearStorage: true });
  let s = await state();
  assert.equal(s.lang, 'en');
  assert.equal(s.button, 'ไทย');
  assert.equal(s.explainHidden, true);

  await run(`document.querySelector('[data-node-id="api"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await run(`waitFor(()=>!document.getElementById('focus-chip').hidden)`);
  s = await state();
  assert.equal(s.explainHidden, false);
  assert.equal(s.summary, 'Serves every page.');
  assert.deepEqual(s.steps, ['Checks the token.', 'Reads the cache.']);
  assert.deepEqual(s.why, ['The web app calls the API.']);

  await run(`document.getElementById('btn-language').click()`);
  s = await state();
  assert.equal(s.lang, 'th');
  assert.equal(s.title, 'ตัวอย่างคำอธิบาย');
  assert.equal(s.button, 'EN');
  assert.equal(s.summary, 'ให้บริการทุกหน้า');
  assert.deepEqual(s.steps, ['ตรวจ token', 'Reads the cache.'], 'untranslated text stays as authored');
  assert.deepEqual(s.why, ['เว็บแอปเรียก API']);
  assert.match(s.sublabel, /API สาธารณะ/);

  // The choice survives a reload, and switching back restores every original.
  await load();
  s = await state();
  assert.equal(s.lang, 'th');
  assert.equal(s.title, 'ตัวอย่างคำอธิบาย');
  await run(`document.getElementById('btn-language').click()`);
  s = await state();
  assert.equal(s.lang, 'en');
  assert.equal(s.title, 'Explain demo');
  assert.match(s.sublabel, /public API/);
  assert.deepEqual(s.errors, []);
});

test('a diagram without a second language keeps the switch hidden', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run real-browser explain/language checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-explain-browser-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const output = path.join(scratch, 'plain.html');
  execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), path.join(skillRoot, 'examples', 'web-app.architecture.json'), output]);
  const browser = desktopBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
  await send('Page.navigate', { url: pathToFileURL(output).href });
  await loaded;
  const r = await send('Runtime.evaluate', { expression: `document.getElementById('btn-language').hidden && Archify.alternateLanguage.available() === false`, returnByValue: true });
  assert.equal(r.result.value, true);
});
