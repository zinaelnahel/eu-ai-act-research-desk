import {cases, scoreAnswer} from '../evaluate.mjs';

const fixtures = new Map(cases.map(item => [item.name, item]));

export default function assertEvidence(output, context) {
  const fixture = fixtures.get(context.vars.caseName);
  if (!fixture) throw new Error('Missing benchmark label');
  const result = scoreAnswer(fixture, JSON.parse(output));
  return {
    pass: result.passed,
    score: Number(result.passed),
    reason: result.passed ? 'Citation contract met' : JSON.stringify(result),
  };
}
