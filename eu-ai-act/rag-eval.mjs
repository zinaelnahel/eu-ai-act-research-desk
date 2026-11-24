import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {answerRag, missingDisclosureSafeguards, verifiedContext} from './rag.mjs';
import {createProvider} from './rag-provider.mjs';
import {desk} from './evaluate.mjs';

export const cases = JSON.parse(readFileSync(new URL('./rag-cases.json', import.meta.url), 'utf8'));
export const feedbackCases = JSON.parse(readFileSync(new URL('./feedback-cases.json', import.meta.url), 'utf8'));
export const retrievalFeedbackCases = JSON.parse(readFileSync(new URL('./retrieval-feedback-cases.json', import.meta.url), 'utf8'));

export function scoreRag(fixture, result) {
  const {status, claims, retrievedIds, metrics} = result;
  const sourceIds = [...new Set(claims.map(claim => claim.sourceId))];
  const text = claims.map(claim => claim.text).join(' ');
  const missing = (fixture.phrases || []).filter(pattern => !new RegExp(pattern, 'i').test(text));
  const contradictions = (fixture.forbidden || []).filter(pattern => new RegExp(pattern, 'i').test(text));
  const required = fixture.sources || (fixture.source ? [fixture.source] : []);
  const allowed = new Set([...required, ...Object.keys(fixture.optionalSources || {})]);
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
  if (missingDisclosureSafeguards(claims)) {
    missing.push('safeguards and public reporting limitation when discussing criminal-offence systems');
  }
  const passed = required.length
    ? status === 'answered' && required.every(id => sourceIds.includes(id)) &&
      missing.length === 0 && contradictions.length === 0 && invalidCitations === 0 &&
      sourceIds.every(id => allowed.has(id) && retrievedIds.includes(id)) && [2, 3, 4].includes(metrics.modelCalls)
    : status === 'abstained' && claims.length === 0 && metrics.modelCalls === 0;
  return {case: fixture.id, expectedSources: required, status, reason: result.reason, sourceIds, missing, contradictions, invalidCitations,
    passed, latencyMs: metrics.latencyMs, modelCalls: metrics.modelCalls};
}

export async function runLive(complete) {
  const results = [];
  for (const fixture of cases) {
    const result = await answerRag(fixture.question, {complete});
    const row = scoreRag(fixture, result);
    results.push({...row, generatedClaims: result.claims.map(claim => claim.text)});
    console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.case} ${row.status} ${row.latencyMs}ms`);
  }
  return results;
}

async function runHosted(fixtures) {
  const url = 'https://eu-ai-act-research-desk.vercel.app/api/answer';
  const ready = await fetch(url, {signal: AbortSignal.timeout(10_000)});
  if (!ready.ok || !(await ready.json()).available) throw new Error('Hosted provider unavailable.');
  const results = [];
  for (const fixture of fixtures) {
    const response = await fetch(url, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({question: fixture.question}), signal: AbortSignal.timeout(58_000),
    });
    const body = response.ok ? await response.json() : null;
    const row = response.ok ? {...scoreRag(fixture, body), generatedClaims: body.claims.map(claim => claim.text)}
      : {case: fixture.id, reason: `http-${response.status}`, passed: fixture.id === 'empty' && response.status === 400};
    results.push({...row, http: response.status});
    console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.case} HTTP ${response.status} ${row.status ?? ''}`);
  }
  return results;
}

async function main() {
  const hosted = process.argv[2] === '--hosted';
  const complete = createProvider();
  if (!hosted && (!complete || !process.env.EU_AI_ACT_OLLAMA_MODEL || process.env.VERCEL)) {
    throw new Error('Start Ollama and set EU_AI_ACT_OLLAMA_MODEL before running the local evaluation.');
  }
  const starterIds = new Set(['workplace-exception', 'chatbot-disclosure', 'gpai-obligations']);
  const fixtures = process.argv.includes('--retrieval-feedback') ? retrievalFeedbackCases
    : process.argv.includes('--feedback') ? feedbackCases
    : process.argv.includes('--starters') ? cases.filter(item => starterIds.has(item.id)) : cases;
  const results = hosted ? await runHosted(fixtures) : await runLive(complete);
  const report = {mode: hosted ? 'production-http' : 'local-ollama', model: hosted ? undefined : process.env.EU_AI_ACT_OLLAMA_MODEL,
    passed: results.filter(row => row.passed).length, total: results.length, results};
  const output = process.argv[hosted ? 3 : 2];
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} RAG scenarios passed.`);
  if (report.passed !== report.total) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
