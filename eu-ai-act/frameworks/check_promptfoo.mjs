import {readFileSync} from 'node:fs';
import {cases} from '../evaluate.mjs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const results = report.results?.results;
if (!Array.isArray(results) || results.length !== cases.length) {
  throw new Error('Promptfoo did not evaluate the whole labeled dataset');
}

const passed = results.filter(item => item.success === true).length;
console.log(`Promptfoo: ${passed}/${cases.length} labeled cases passed.`);
if (passed !== cases.length) process.exitCode = 1;
