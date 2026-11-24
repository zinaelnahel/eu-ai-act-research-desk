import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {answerRag, verifiedContext} from './rag.mjs';
import {cases, feedbackCases, retrievalFeedbackCases, boundaryFeedbackCases, starterCases, scoreRag} from './rag-eval.mjs';
import {createProvider} from './rag-provider.mjs';
import {desk} from './evaluate.mjs';
import {createAnswerHandler} from '../api/answer.mjs';
import {createAnswerLimit} from './answer-limit.mjs';
import {resolveFollowUp} from '../public/eu-ai-act/follow-up.mjs';

const example = cases[0];

test('follow-ups resolve known references and clarify multi-source context', () => {
  const reference = {question: example.question, ids: ['art_5']};
  const school = resolveFollowUp('Does that also apply to schools?', reference);
  assert.equal(school.reference, 'Article 5');
  const exception = resolveFollowUp('What’s the exception?', {question: school.question, ids: ['art_5']});
  assert.deepEqual(desk.ask(exception.question).evidence.map(item => item.id), ['art_5']);
  assert.match(exception.question, /in schools/);
  assert.deepEqual(resolveFollowUp('What is the exception?', {question: 'GPAI obligations', ids: ['art_53', 'art_55']}), {clarify: true});
  assert.deepEqual(resolveFollowUp('Who can file a complaint?', reference), {question: 'Who can file a complaint?'});
});

test('the schools follow-up preserves the polarity of the prohibition question', async () => {
  const reference = {question: example.question, ids: ['art_5']};
  const {question} = resolveFollowUp('Does that also apply in schools?', reference);
  const result = await answerRag(question, {complete: () => assert.fail('Source rule must not call the model')});
  assert.equal(result.answerMode, 'source-rule');
  assert.equal(result.claims[0].sourceId, 'art_5');
  assert.match(result.claims[0].text, /^Yes, the prohibition also applies in schools\..+medical or safety reasons\.$/);
});
function draftFor(fixture, passages) {
  const drafts = fixture.drafts || {[fixture.source]: fixture.draft};
  return {claims: Object.entries(drafts).map(([sourceId, text]) => {
    assert.ok(passages.some(passage => passage.id === sourceId));
    return {sourceId, text};
  })};
}

for (const fixture of [...cases, ...feedbackCases, ...retrievalFeedbackCases, ...boundaryFeedbackCases, ...starterCases]) {
  test('RAG contract: ' + fixture.question, async () => {
    const complete = async (stage, _, data) => stage === 'draft'
      ? draftFor(fixture, data.passages) : {approved: true};
    const result = await answerRag(fixture.question, {complete});
    const report = scoreRag(fixture, result);
    assert.ok(report.passed, JSON.stringify(report));
    for (const claim of result.claims) {
      const source = desk.documents.get(claim.sourceId);
      assert.ok(source.blocks.join('\n\n').includes(claim.quote));
      assert.equal(claim.url, source.url);
    }
  });
}

test('accepts multiple supported claims from different provisions', async () => {
  const result = await answerRag('What are the obligations for GPAI providers?', {complete: async (stage, _, data) => {
    if (stage === 'review') return {approved: true};
    return {claims: data.passages.map(pass => ({
      sourceId: pass.id,
      text: pass.id === 'art_53' ? 'Providers must keep technical documentation up to date.'
        : 'Systemic-risk model providers must assess and mitigate systemic risks.',
    }))};
  }});
  assert.equal(result.status, 'answered');
  assert.deepEqual(result.claims.map(claim => claim.sourceId), ['art_53', 'art_55']);
});

test('scoring catches a correct citation attached to the wrong class of provider', async () => {
  const fixture = cases.find(item => item.id === 'gpai-obligations');
  const result = await answerRag(fixture.question, {complete: async (stage, _, data) =>
    stage === 'draft' ? draftFor(fixture, data.passages) : {approved: true}});
  const [general, systemic] = result.claims;
  assert.equal(scoreRag(fixture, {...result, claims: [general]}).passed, false);
  assert.equal(scoreRag(fixture, {...result, claims: [
    {...general, text: general.text + ' All GPAI providers must report serious incidents.'}, systemic,
  ]}).passed, false);
});

test('scoring rejects a reversed rule even when citation and expected keywords are present', async () => {
  const fixture = cases.find(item => item.id === 'workplace-exception');
  const result = await answerRag(fixture.question, {complete: async (stage, _, data) =>
    stage === 'draft' ? draftFor(fixture, data.passages) : {approved: true}});
  const [claim] = result.claims;
  const wrong = {...claim, text: 'Emotion recognition is allowed at work except where prohibited for medical or safety reasons.'};
  const score = scoreRag(fixture, {...result, claims: [wrong]});
  assert.equal(score.invalidCitations, 0);
  assert.deepEqual(score.missing, []);
  assert.equal(score.contradictions.length, 1);
  assert.equal(score.passed, false);
});

test('rate limit rejects excess requests before the model and resets', async () => {
  let time = 0;
  let runs = 0;
  const limit = createAnswerLimit({now: () => time, limit: 2});
  const handle = createAnswerHandler(() => {}, async () => ({runs: ++runs}), limit);
  const ask = ip => handle(new Request('https://example.test/api/answer', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'x-vercel-forwarded-for': ip},
    body: JSON.stringify({question: example.question}),
  }));
  assert.equal((await ask('192.0.2.1')).status, 200);
  assert.equal((await ask('192.0.2.1')).status, 200);
  const limited = await ask('192.0.2.1');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal(runs, 2);
  assert.equal((await ask('192.0.2.2')).status, 200);
  time = 60_000;
  assert.equal((await ask('192.0.2.1')).status, 200);
});

test('evaluation fails a changed citation or an exception with missing safeguards', async () => {
  const fixture = cases.find(item => item.id === 'chatbot-disclosure');
  const result = await answerRag(fixture.question, {complete: async (stage, _, data) =>
    stage === 'draft' ? draftFor(fixture, data.passages) : {approved: true}});
  const [claim] = result.claims;
  assert.equal(scoreRag(fixture, {...result, claims: [{...claim, quote: 'Altered excerpt'}]}).invalidCitations, 1);
  const incomplete = {...claim, text: claim.text + ' Systems authorised to investigate criminal offences are exempt.'};
  assert.equal(scoreRag(fixture, {...result, claims: [incomplete]}).passed, false);
  const unsafe = await answerRag(fixture.question, {complete: async (stage) => {
    assert.equal(stage, 'draft');
    return {claims: [{sourceId: incomplete.sourceId, text: incomplete.text}]};
  }});
  assert.equal(unsafe.status, 'rejected');
});

test('chatbot disclosure requires a timing claim and presents it separately to review', async () => {
  const fixture = cases.find(item => item.id === 'chatbot-disclosure');
  const noTiming = await answerRag(fixture.question, {complete: async (stage, _, data) => {
    assert.equal(stage, 'draft');
    return {claims: draftFor(fixture, data.passages).claims.slice(0, 1)};
  }});
  assert.equal(noTiming.reason, 'invalid-draft');
  const complete = async (stage, _, data) => {
    if (stage === 'draft') return draftFor(fixture, data.passages);
    assert.deepEqual(data.claims.map(claim => claim.sourceId), ['art_50', 'art_50_p5']);
    return {approved: true};
  };
  const result = await answerRag(fixture.question, {complete});
  assert.deepEqual(result.claims.map(claim => claim.sourceId), ['art_50', 'art_50']);
  assert.match(result.claims[1].quote, /^5\. /);
});

test('rejects an overbroad explanation right even with a valid Article 86 citation', async () => {
  const fixture = feedbackCases.find(item => item.id === 'adverse-explanation');
  const result = await answerRag(fixture.question, {complete: async stage => {
    assert.equal(stage, 'draft');
    return {claims: [{sourceId: 'art_86', text: 'A person can get an explanation from the deployer of any adverse decision based on high-risk AI.'}]};
  }});
  assert.equal(result.reason, 'invalid-draft');
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.retrievedIds, ['art_86']);
});

test('rejects altered quotations, unknown source IDs, and unsupported numbers before review', async () => {
  for (const alteration of [
    {quote: 'A synthetic placeholder'}, {sourceId: 'unknown'}, {text: 'There are 123 exceptions.'},
    {text: 'Emotion recognition is allowed at work, except where the AI system is intended for medical or safety purposes.'},
  ]) {
    const result = await answerRag(example.question, {complete: async (stage, _, {passages}) => {
      assert.equal(stage, 'draft');
      const draft = draftFor(example, passages);
      Object.assign(draft.claims[0], alteration);
      return draft;
    }});
    assert.equal(result.status, 'rejected');
    assert.equal(result.metrics.modelCalls, 2);
    assert.deepEqual(result.claims, []);
  }
});

test('retries an invalid draft once, then reviews the corrected draft', async () => {
  const stages = [];
  const result = await answerRag(example.question, {complete: async (stage, _, data) => {
    stages.push(stage);
    if (stage === 'review') return {approved: true};
    const draft = draftFor(example, data.passages);
    if (stages.length === 1) draft.claims[0].text = 'There are 123 exceptions.';
    return draft;
  }});
  assert.deepEqual(stages, ['draft', 'draft', 'review']);
  assert.equal(result.status, 'answered');
  assert.equal(result.metrics.modelCalls, 3);
});

test('retries a reviewed rejection without publishing the rejected draft', async () => {
  let reviews = 0;
  const result = await answerRag(example.question, {complete: async (stage, _, {passages}) =>
    stage === 'draft' ? draftFor(example, passages) : {approved: ++reviews === 2}});
  assert.equal(result.status, 'answered');
  assert.equal(result.metrics.modelCalls, 4);
});

test('rejects malformed model output and a reviewer refusal', async () => {
  for (const review of [{approved: false}, {approved: true, extra: 'synthetic note'}, 'yes']) {
    const result = await answerRag(example.question, {complete: async (stage, _, {passages}) =>
      stage === 'draft' ? draftFor(example, passages) : review});
    assert.equal(result.status, 'rejected');
    assert.deepEqual(result.claims, []);
  }
  const invalid = await answerRag(example.question, {complete: async () => ({text: 'synthetic note'})});
  assert.equal(invalid.status, 'rejected');
});

test('empty drafts abstain and provider failures leave the evidence fallback available', async () => {
  const empty = await answerRag(example.question, {complete: async () => ({claims: []})});
  assert.equal(empty.status, 'abstained');
  assert.equal(empty.metrics.modelCalls, 1);
  const failed = await answerRag(example.question, {complete: async () => {throw new Error('provider offline');}});
  assert.equal(failed.status, 'unavailable');
  assert.deepEqual(failed.retrievedIds, ['art_5']);
  assert.deepEqual(failed.claims, []);
});

test('synthetic unapproved records and unrelated metadata are excluded before generation', async () => {
  const original = desk.ask(example.question);
  const [item] = original.evidence;
  const amended = {...original, evidence: [
    {...item, quote: 'Synthetic draft for formatting review.'},
    {id: 'restricted-test-record', url: 'https://example.invalid/', quote: 'Test-only metadata'},
    {...item, privateNote: 'Test-only metadata'},
  ]};
  assert.deepEqual(verifiedContext(amended).map(row => row.id), ['art_5']);
  const result = await answerRag(example.question, {
    retrieve: () => amended,
    complete: async (stage, _, data) => {
      assert.ok(!JSON.stringify(data).includes('Test-only metadata'));
      assert.ok(!JSON.stringify(data).includes('formatting review'));
      return stage === 'draft' ? draftFor(example, data.passages) : {approved: true};
    },
  });
  assert.equal(result.status, 'answered');
});

test('HTTP handler exposes availability and validates JSON requests', async () => {
  const handler = createAnswerHandler(undefined);
  const url = 'http://127.0.0.1/api/answer';
  const post = (body, fields = {}) => handler(new Request(url, {
    method: 'POST', headers: {'Content-Type': 'application/json', ...fields}, body,
  }));
  assert.deepEqual(await (await handler(new Request(url))).json(), {available: false});
  assert.equal((await post('invalid JSON')).status, 400);
  assert.equal((await post(JSON.stringify({question: 'x'.repeat(5000)}))).status, 400);
  assert.equal((await post(JSON.stringify({question: 'x'.repeat(601)}))).status, 400);
  assert.equal((await post(JSON.stringify({question: example.question}), {'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await post(JSON.stringify({question: example.question}), {'Content-Type': 'text/plain'})).status, 415);
  assert.equal((await post(JSON.stringify({question: example.question}))).status, 503);
  const available = createAnswerHandler(async (stage, _, data) =>
    stage === 'draft' ? draftFor(example, data.passages) : {approved: true});
  const response = await available(new Request(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({question: example.question})}));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'answered');
});

test('provider is opt-in and sends secrets only to the configured server API', async () => {
  assert.equal(createProvider({}), undefined);
  assert.equal(createProvider({VERCEL: '1', EU_AI_ACT_OLLAMA_MODEL: 'test'}), undefined);
  const complete = createProvider({EU_AI_ACT_OPENAI_KEY: 'test-key', EU_AI_ACT_OPENAI_MODEL: 'test-model'}, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(JSON.parse(options.body).response_format.json_schema.strict, true);
    return Response.json({choices: [{message: {content: '{"approved":true}'}}]});
  });
  assert.deepEqual(await complete('review', 'instruction', {claims: []}, {}), {approved: true});
});
