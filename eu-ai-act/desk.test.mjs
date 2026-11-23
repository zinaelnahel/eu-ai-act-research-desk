import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {corpus, desk, runEvaluation} from './evaluate.mjs';

test('pins all numbered provisions and introductory material to the official editions', () => {
  assert.equal(desk.documents.size, corpus.documents.length);
  assert.equal(corpus.documents.filter(doc => doc.kind === 'article').length, 119);
  assert.equal(corpus.documents.filter(doc => doc.kind === 'annex').length, 14);
  assert.equal(corpus.documents.filter(doc => doc.kind === 'recital').length, 227);
  assert.equal(corpus.documents.filter(doc => doc.id.startsWith('amend_')).length, 47);
  for (let i = 1; i <= 113; i++) assert.ok(desk.documents.has('art_' + i));
  for (let i = 1; i <= 180; i++) assert.ok(desk.documents.has('rct_' + i));
  for (const doc of corpus.documents) {
    assert.ok(doc.blocks.length > 0 && doc.blocks.every(Boolean), doc.id);
    assert.equal(new URL(doc.url).hostname, 'eur-lex.europa.eu');
    assert.ok(!doc.blocks.some(text => /[▼�]/.test(text)), doc.id);
  }
});

test('resolves every corpus item explicitly', () => {
  for (const doc of corpus.documents) {
    const result = desk.ask(doc.label);
    assert.equal(result.kind, 'lookup', doc.label);
    assert.deepEqual(result.evidence.map(item => item.id), [doc.id], doc.label);
  }
});

for (const result of runEvaluation().results) {
  test(result.name, () => {
    assert.ok(result.passed, JSON.stringify(result));
  });
}

test('published report matches a fresh evaluation', () => {
  const report = JSON.parse(readFileSync(new URL('../public/eu-ai-act/evaluation.json', import.meta.url), 'utf8'));
  assert.deepEqual(report, runEvaluation());
});
