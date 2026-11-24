import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {answerRag} from './rag.mjs';
import {createProvider} from './rag-provider.mjs';

export const cases = JSON.parse(readFileSync(new URL('./rag-cases.json', import.meta.url), 'utf8'));

export function scoreRag(fixture, result) {
  const {status, claims, retrievedIds, metrics} = result;
  const sourceIds = [...new Set(claims.map(claim => claim.sourceId))];
  const text = claims.map(claim => claim.text).join(' ');
  const missing = (fixture.phrases || []).filter(pattern => !new RegExp(pattern, 'i').test(text));
  const passed = fixture.source
    ? status === 'answered' && sourceIds.includes(fixture.source) && missing.length === 0 &&
      sourceIds.every(id => id === fixture.source && retrievedIds.includes(id)) && metrics.modelCalls === 2
    : status === 'abstained' && claims.length === 0 && metrics.modelCalls === 0;
  return {case: fixture.id, expectedSource: fixture.source || null, status, sourceIds, missing,
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

async function main() {
  const complete = createProvider();
  if (!complete || !process.env.EU_AI_ACT_OLLAMA_MODEL || process.env.VERCEL) {
    throw new Error('Start Ollama and set EU_AI_ACT_OLLAMA_MODEL before running the local evaluation.');
  }
  const results = await runLive(complete);
  const report = {mode: 'local-ollama', model: process.env.EU_AI_ACT_OLLAMA_MODEL,
    passed: results.filter(row => row.passed).length, total: results.length, results};
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} RAG scenarios passed.`);
  if (report.passed !== report.total) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
