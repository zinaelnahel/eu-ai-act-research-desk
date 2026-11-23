import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {cases, corpus, desk, runEvaluation, scoreAnswer} from './evaluate.mjs';

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

test('a valid but irrelevant Article 50 citation fails the school emotion case', () => {
  const fixture = cases.find(item => item.name === 'school emotion');
  const answer = desk.ask(fixture.question);
  const extra = desk.ask('Article 50').evidence[0];
  const scored = scoreAnswer(fixture, {...answer, evidence: [...answer.evidence, extra]});
  assert.deepEqual(scored.unexpected, ['art_50']);
  assert.equal(scored.precision, 0.5);
  assert.equal(scored.citationQuality, true);
  assert.equal(scored.phraseQuality, true);
  assert.equal(scored.passed, false);
});

test('duplicate provisions and empty excerpts cannot pass', () => {
  const fixture = cases.find(item => item.name === 'school emotion');
  const answer = desk.ask(fixture.question);
  const [item] = answer.evidence;
  const repeated = scoreAnswer(fixture, {...answer, evidence: [item, item]});
  assert.deepEqual(repeated.duplicates, [item.id]);
  assert.equal(repeated.precision, 0.5);
  assert.equal(repeated.passed, false);
  assert.equal(scoreAnswer(fixture, {...answer, evidence: [{...item, quote: ''}]}).passed, false);
});

test('published report matches a fresh evaluation', () => {
  const report = JSON.parse(readFileSync(new URL('../public/eu-ai-act/evaluation.json', import.meta.url), 'utf8'));
  assert.deepEqual(report, runEvaluation());
});
