import {readFileSync, writeFileSync} from 'node:fs';
import {desk, scoreAnswer} from './evaluate.mjs';

const cases = JSON.parse(readFileSync(new URL('./challenge-cases.json', import.meta.url), 'utf8'));
const rows = cases.map(fixture => {
  const response = desk.ask(fixture.question);
  return {...scoreAnswer(fixture, response),
    passages: response.evidence.map(({label, quote, url}) => ({label, quote, url}))};
});
const result = {
  provenance: 'Author-labeled challenge cases, independent review pending',
  passed: rows.filter(row => row.passed).length,
  total: rows.length,
  results: rows,
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(`Challenge coverage: ${result.passed}/${result.total} passed`);
for (const row of rows) console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.name} — ${row.actual}`);
if (process.argv.includes('--gate') && result.passed !== result.total) process.exitCode = 1;
