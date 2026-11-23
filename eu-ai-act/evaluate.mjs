import {readFileSync, writeFileSync} from 'node:fs';
import {createDesk} from '../public/eu-ai-act/search.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
export const corpus = read('../public/eu-ai-act/corpus.json');
export const cases = read('./cases.json');
export const desk = createDesk(corpus);

export function scoreAnswer({name, question, sources, optionalSources = {}, phrases, kind}, answer, documents = desk.documents) {
    const retrieved = answer.evidence.map(item => item.id);
    const allowed = new Set([...sources, ...Object.keys(optionalSources)]);
    const seen = new Set();
    const unexpected = [];
    const duplicates = [];
    for (const id of retrieved) {
      if (!allowed.has(id)) unexpected.push(id);
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    const relevant = [...seen].filter(id => allowed.has(id)).length;
    const precision = retrieved.length ? relevant / retrieved.length : null;
    const citationQuality = answer.evidence.every(item => {
      const doc = documents.get(item.id);
      return doc && doc.url === item.url && item.quote?.trim() && doc.blocks.join('\n\n').includes(item.quote);
    });
    const phraseQuality = phrases.every(phrase => answer.evidence.some(item =>
      sources.includes(item.id) && item.quote?.toLowerCase().includes(phrase.toLowerCase())));
    const expectedBehavior = kind
      ? answer.kind === kind && retrieved.length === 0
      : retrieved[0] === sources[0] && sources.every(id => retrieved.includes(id));
    return {name, question, expected: sources.join(', ') || kind, actual: retrieved.join(', ') || answer.kind,
      optionalSources, unexpected, duplicates, precision, relevant, returned: retrieved.length,
      citationQuality, phraseQuality, passed: expectedBehavior && citationQuality && phraseQuality &&
        unexpected.length === 0 && duplicates.length === 0};
}

export function runEvaluation() {
  const results = cases.map(item => scoreAnswer(item, desk.ask(item.question)));
  const returned = results.reduce((total, item) => total + item.returned, 0);
  return {
    edition: corpus.version,
    passed: results.filter(test => test.passed).length,
    total: results.length,
    precision: returned ? results.reduce((total, item) => total + item.relevant, 0) / returned : null,
    unexpected: results.reduce((total, item) => total + item.unexpected.length, 0),
    results,
  };
}

if (process.argv.includes('--write')) {
  const report = runEvaluation();
  writeFileSync(new URL('../public/eu-ai-act/evaluation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} labeled scenarios passed.`);
}
