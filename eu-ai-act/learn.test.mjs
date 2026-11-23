import assert from 'node:assert/strict';
import {test} from 'node:test';
import {corpus} from './evaluate.mjs';
import {modules, totalQuestions} from '../public/eu-ai-act/learn-data.mjs';
import {recordAttempt, restoreProgress, summarize} from '../public/eu-ai-act/learn-progress.mjs';

test('each learning scenario has distinct answer choices and official source citations', () => {
  const sources = new Map(corpus.documents.map(doc => [doc.id, doc]));
  const prompts = new Set();
  assert.equal(new Set(modules.map(topic => topic.id)).size, modules.length);
  for (const topic of modules) {
    assert.ok(topic.questions.length >= 2);
    for (const item of topic.questions) {
      assert.ok(!prompts.has(item.prompt), item.prompt);
      prompts.add(item.prompt);
      assert.ok(item.why);
      assert.ok(Number.isInteger(item.correct) && item.choices[item.correct]);
      assert.equal(new Set(item.choices).size, item.choices.length);
      assert.ok(item.sources.length);
      for (const id of item.sources) {
        assert.equal(new URL(sources.get(id).url).hostname, 'eur-lex.europa.eu');
      }
    }
  }
  assert.equal(prompts.size, totalQuestions);
});

test('practice records attempts, and replay only increases XP when the best score improves', () => {
  const topic = modules[0];
  const correct = topic.questions.map(item => item.correct);
  const wrong = topic.questions.map(item => (item.correct + 1) % item.choices.length);
  const first = recordAttempt({}, topic, wrong);
  assert.equal(first.score, 0);
  assert.deepEqual(summarize(first.progress), {completed: 1, mastered: 0, points: 0, level: 1});
  const improved = recordAttempt(first.progress, topic, correct);
  assert.equal(summarize(improved.progress).points, topic.questions.length * 100);
  const replay = recordAttempt(improved.progress, topic, wrong);
  assert.equal(replay.progress[topic.id].attempts, 3);
  assert.deepEqual(summarize(replay.progress), summarize(improved.progress));
  assert.deepEqual(restoreProgress(JSON.parse(JSON.stringify(replay.progress))), replay.progress);
});

test('malformed progress and incomplete answers cannot increase XP', () => {
  const topic = modules[0];
  assert.deepEqual(restoreProgress({[topic.id]: {best: 1000, attempts: 1}, mixed: {best: 8, attempts: 1}}), {});
  assert.deepEqual(restoreProgress(null), {});
  assert.throws(() => recordAttempt({}, topic, []), RangeError);
  assert.throws(() => recordAttempt({}, topic, topic.questions.map(() => -1)), RangeError);
});
