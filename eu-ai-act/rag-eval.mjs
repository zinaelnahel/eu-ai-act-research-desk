import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {answerRag, scoreLegalClaims, verifiedContext} from './rag.mjs';
import {createProvider} from './rag-provider.mjs';
import {desk} from './evaluate.mjs';

export const cases = JSON.parse(readFileSync(new URL('./rag-cases.json', import.meta.url), 'utf8'));
export const feedbackCases = JSON.parse(readFileSync(new URL('./feedback-cases.json', import.meta.url), 'utf8'));
export const retrievalFeedbackCases = JSON.parse(readFileSync(new URL('./retrieval-feedback-cases.json', import.meta.url), 'utf8'));
export const boundaryFeedbackCases = JSON.parse(readFileSync(new URL('./boundary-feedback-cases.json', import.meta.url), 'utf8'));
export const starterCases = [
  {...cases.find(item => item.id === 'workplace-exception'), question: 'Can my employer use AI to tell how I’m feeling?'},
  {
    ...cases.find(item => item.id === 'chatbot-disclosure'), answerMode: 'reviewed',
    question: 'When does a chatbot have to tell me it’s AI?',
    sourcePhrases: {art_50: [
      'disclosure obligation does not apply to systems authorised by law',
      'subject to appropriate safeguards for the rights and freedoms of third parties',
      'disclosure is still required if the system is available for the public to report a criminal offence',
    ]},
  },
  {...feedbackCases.find(item => item.id === 'adverse-explanation'), question: 'Can I ask for an explanation of an AI-assisted decision?'},
];
const semanticFixtureIds = new Set([
  'workplace-exception', 'school-exception', 'chatbot-disclosure', 'deepfake', 'deployer-logs',
  'incident-death', 'incident-infrastructure', 'incident-incomplete', 'adverse-explanation',
  'distributor-trademark', 'fria-update', 'request-source-code', 'gpai-transition-cutoff',
  'distributor-substantial-modification', 'distributor-intended-purpose',
]);
const chatbot = cases.find(item => item.id === 'chatbot-disclosure');
export const semanticCases = [
  ...[...cases, ...feedbackCases, ...retrievalFeedbackCases, ...boundaryFeedbackCases]
    .filter(fixture => semanticFixtureIds.has(fixture.id) || fixture.answerMode === 'source-rule'),
  {
    ...chatbot, id: 'chatbot-disclosure-safeguards',
    question: 'When does a chatbot have to tell me it is AI, and what safeguards and public reporting limits apply to the criminal-offence exception?',
    sourcePhrases: {art_50: ['criminal.offen|law.enforcement', 'safeguard', 'third.part', 'public.{0,60}report|report.{0,60}public']},
    drafts: {...chatbot.drafts, art_50: chatbot.drafts.art_50 +
      ' Legally authorised criminal-offence systems are exempt subject to safeguards for third parties and only if they are not available for public reporting.'},
  },
];

export function scoreRag(fixture, result) {
  const {status, claims, retrievedIds, metrics} = result;
  const sourceIds = [...new Set(claims.map(claim => claim.sourceId))];
  const text = claims.map(claim => claim.text).join(' ');
  const missing = (fixture.phrases || []).filter(pattern => !new RegExp(pattern, 'i').test(text));
  const contradictions = (fixture.forbidden || []).filter(pattern => new RegExp(pattern, 'i').test(text));
  const required = fixture.sources || (fixture.source ? [fixture.source] : []);
  const allowed = new Set([...required, ...Object.keys(fixture.optionalSources || {})]);
  const methodPassed = fixture.answerMode
    ? result.answerMode === fixture.answerMode && metrics.modelCalls === 0
    : [2, 3, 4].includes(metrics.modelCalls);
  for (const [source, patterns] of Object.entries(fixture.sourcePhrases || {})) {
    const citedText = claims.filter(claim => claim.sourceId === source).map(claim => claim.text).join(' ');
    missing.push(...patterns.filter(pattern => !new RegExp(pattern, 'i').test(citedText)));
  }
  for (const [paragraph, patterns] of Object.entries(fixture.paragraphPhrases || {})) {
    const citedText = claims.filter(claim => claim.quote.startsWith(paragraph + '. ')).map(claim => claim.text).join(' ');
    missing.push(...patterns.filter(pattern => !new RegExp(pattern, 'i').test(citedText)));
  }
  const passages = verifiedContext(desk.ask(fixture.question));
  const invalidCitations = claims.filter(claim => {
    return !passages.some(passage => passage.sourceId === claim.sourceId && passage.url === claim.url &&
      passage.label === claim.label && passage.quote === claim.quote);
  }).length;
  if (fixture.id === 'chatbot-disclosure' && !claims.some(claim =>
    /^5\./.test(claim.quote) && /first interaction/i.test(claim.text) && /accessib/i.test(claim.text))) {
    missing.push('first interaction and accessibility cited to Article 50(5)');
  }
  const legalViolations = status === 'answered' && result.answerMode !== 'source-rule'
    ? scoreLegalClaims(claims, passages) : [];
  const passed = required.length
    ? status === 'answered' && required.every(id => sourceIds.includes(id)) &&
      missing.length === 0 && contradictions.length === 0 && invalidCitations === 0 && legalViolations.length === 0 &&
      sourceIds.every(id => allowed.has(id) && retrievedIds.includes(id)) && methodPassed
    : status === 'abstained' && claims.length === 0 && metrics.modelCalls === 0;
  return {case: fixture.id, expectedSources: required, status, answerMode: result.answerMode, reason: result.reason, sourceIds, missing, contradictions, invalidCitations, legalViolations,
    passed, latencyMs: metrics.latencyMs, modelCalls: metrics.modelCalls, attempts: metrics.attempts};
}

export async function runLive(complete, fixtures = cases) {
  const results = [];
  for (const fixture of fixtures) {
    const result = await answerRag(fixture.question, {complete});
    const row = scoreRag(fixture, result);
    results.push({...row, generatedClaims: result.claims.map(claim => claim.text)});
    console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.case} ${row.status} ${row.latencyMs}ms`);
  }
  return results;
}

async function runHosted(fixtures, {includeClaims = true} = {}) {
  const url = 'https://eu-ai-act-research-desk.vercel.app/api/answer';
  try {
    const ready = await fetch(url, {signal: AbortSignal.timeout(10_000)});
    if (!ready.ok || !(await ready.json()).available) throw new Error('Hosted provider unavailable.');
  } catch {
    console.error('Hosted provider readiness check failed.');
    return fixtures.map(fixture => ({case: fixture.id, reason: 'provider-unavailable', passed: false}));
  }
  const results = [];
  for (const fixture of fixtures) {
    let row;
    try {
      const response = await fetch(url, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question: fixture.question}), signal: AbortSignal.timeout(58_000),
      });
      const body = response.ok ? await response.json() : null;
      row = response.ok ? scoreRag(fixture, body)
        : {case: fixture.id, reason: 'http-' + response.status, passed: fixture.id === 'empty' && response.status === 400};
      if (response.ok && includeClaims) row.generatedClaims = body.claims.map(claim => claim.text);
      row.http = response.status;
    } catch (error) {
      row = {case: fixture.id, reason: error.name === 'TimeoutError' ? 'request-timeout' : 'invalid-or-unavailable-response', passed: false};
    }
    results.push(row);
    console.log(row.passed ? 'PASS' : 'FAIL', row.case, row.http ?? '', row.status ?? row.reason ?? '');
  }
  return results;
}

export function safeguardsOutcomes(results) {
  const counts = {firstAttemptPasses: 0, retryRecoveries: 0, finalFallbacks: 0, scoringFailures: 0, requestFailures: 0, missingDiagnostics: 0};
  for (const row of results) {
    if (!row.status) counts.requestFailures++;
    else if (row.status !== 'answered') counts.finalFallbacks++;
    else if (!row.passed) counts.scoringFailures++;
    else if (row.attempts?.at(-1)?.outcome !== 'approved') counts.missingDiagnostics++;
    else if (row.attempts.length > 1) counts.retryRecoveries++;
    else counts.firstAttemptPasses++;
  }
  return counts;
}

async function main() {
  const hosted = process.argv[2] === '--hosted';
  const complete = createProvider();
  if (!hosted && (!complete || !process.env.EU_AI_ACT_OLLAMA_MODEL || process.env.VERCEL)) {
    throw new Error('Start Ollama and set EU_AI_ACT_OLLAMA_MODEL before running the local evaluation.');
  }
  const safeguardsProbe = process.argv.includes('--safeguards-probe');
  const safeguardsFixture = semanticCases.find(fixture => fixture.id === 'chatbot-disclosure-safeguards');
  const fixtures = safeguardsProbe ? Array(3).fill(safeguardsFixture)
    : process.argv.includes('--weekly-smoke') ? [...starterCases, ...semanticCases.filter(fixture =>
    !starterCases.some(starter => starter.id === fixture.id))]
    : process.argv.includes('--boundary-feedback') ? [...retrievalFeedbackCases.slice(0, 1), ...boundaryFeedbackCases]
    : process.argv.includes('--retrieval-feedback') ? retrievalFeedbackCases
    : process.argv.includes('--feedback') ? feedbackCases
    : process.argv.includes('--starters') ? starterCases : cases;
  const results = hosted ? await runHosted(fixtures, {includeClaims: !safeguardsProbe}) : await runLive(complete, fixtures);
  const report = {mode: hosted ? 'production-http' : 'local-ollama', checkedAt: new Date().toISOString(),
    model: hosted ? undefined : process.env.EU_AI_ACT_OLLAMA_MODEL,
    passed: results.filter(row => row.passed).length, total: results.length, results};
  if (safeguardsProbe) {
    report.results = results.map(({generatedClaims, ...row}, index) => ({trial: index + 1, ...row}));
    report.outcomes = safeguardsOutcomes(results);
    console.log(JSON.stringify(report.outcomes));
  }
  const output = process.argv[hosted ? 3 : 2];
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} RAG scenarios passed.`);
  if (report.passed !== report.total || report.outcomes?.missingDiagnostics) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
