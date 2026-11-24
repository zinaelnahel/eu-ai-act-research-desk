import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {answerRag, verifiedContext} from './rag.mjs';
import {createProvider} from './rag-provider.mjs';
import {desk} from './evaluate.mjs';

export const cases = JSON.parse(readFileSync(new URL('./rag-cases.json', import.meta.url), 'utf8'));

export function scoreRag(fixture, result) {
  const {status, claims, retrievedIds, metrics} = result;
  const sourceIds = [...new Set(claims.map(claim => claim.sourceId))];
  const text = claims.map(claim => claim.text).join(' ');
  const missing = (fixture.phrases || []).filter(pattern => !new RegExp(pattern, 'i').test(text));
  const passages = new Map(verifiedContext(desk.ask(fixture.question)).map(item => [item.id, item]));
  const invalidCitations = claims.filter(claim => {
    const passage = passages.get(claim.sourceId);
    return !passage || passage.url !== claim.url || passage.label !== claim.label || passage.quote !== claim.quote;
  }).length;
  if (fixture.id === 'chatbot-disclosure' && /criminal.offen|law.enforcement/i.test(text) &&
      !(/safeguard/i.test(text) && /public.{0,60}report/i.test(text))) {
    missing.push('safeguards and public reporting limitation when discussing criminal-offence systems');
  }
  const passed = fixture.source
    ? status === 'answered' && sourceIds.includes(fixture.source) && missing.length === 0 && invalidCitations === 0 &&
      sourceIds.every(id => id === fixture.source && retrievedIds.includes(id)) && metrics.modelCalls === 2
    : status === 'abstained' && claims.length === 0 && metrics.modelCalls === 0;
  return {case: fixture.id, expectedSource: fixture.source || null, status, sourceIds, missing, invalidCitations,
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

async function runHosted() {
  const url = 'https://eu-ai-act-research-desk.vercel.app/api/answer';
  const ready = await fetch(url, {signal: AbortSignal.timeout(10_000)});
  if (!ready.ok || !(await ready.json()).available) throw new Error('Hosted provider unavailable.');
  const results = [];
  for (const fixture of cases) {
    const response = await fetch(url, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({question: fixture.question}), signal: AbortSignal.timeout(58_000),
    });
    const body = await response.json();
    const row = response.ok ? {...scoreRag(fixture, body), generatedClaims: body.claims.map(claim => claim.text)}
      : {case: fixture.id, passed: fixture.id === 'empty' && response.status === 400};
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
  const results = hosted ? await runHosted() : await runLive(complete);
  const report = {mode: hosted ? 'production-http' : 'local-ollama', model: hosted ? undefined : process.env.EU_AI_ACT_OLLAMA_MODEL,
    passed: results.filter(row => row.passed).length, total: results.length, results};
  const output = process.argv[hosted ? 3 : 2];
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} RAG scenarios passed.`);
  if (report.passed !== report.total) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
