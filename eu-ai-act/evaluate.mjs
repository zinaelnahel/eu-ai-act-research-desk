import {readFileSync, writeFileSync} from 'node:fs';
import {createDesk} from '../public/eu-ai-act/search.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
export const corpus = read('../public/eu-ai-act/corpus.json');
export const cases = read('./cases.json');
export const desk = createDesk(corpus);

export function runEvaluation() {
  const results = cases.map(({name, question, sources, phrases, kind}) => {
    const answer = desk.ask(question);
    const retrieved = answer.evidence.map(item => item.id);
    const citationQuality = answer.evidence.every(item => {
      const doc = desk.documents.get(item.id);
      return doc && doc.url === item.url && doc.blocks.join('\n\n').includes(item.quote);
    });
    const phraseQuality = phrases.every(phrase => answer.evidence.some(item =>
      item.quote.toLowerCase().includes(phrase.toLowerCase())));
    const expectedBehavior = kind
      ? answer.kind === kind && retrieved.length === 0
      : retrieved[0] === sources[0] && sources.every(id => retrieved.includes(id));
    return {name, question, expected: sources.join(', ') || kind, actual: retrieved.join(', ') || answer.kind,
      citationQuality, phraseQuality, passed: expectedBehavior && citationQuality && phraseQuality};
  });
  return {
    edition: corpus.version,
    passed: results.filter(test => test.passed).length,
    total: results.length,
    results,
  };
}

if (process.argv.includes('--write')) {
  const report = runEvaluation();
  writeFileSync(new URL('../public/eu-ai-act/evaluation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.passed}/${report.total} labeled scenarios passed.`);
}
