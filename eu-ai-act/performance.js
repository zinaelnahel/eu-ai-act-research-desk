import http from 'k6/http';
import {check} from 'k6';

// Loopback only. This checks static delivery in the test runner.
const origin = 'http://127.0.0.1:8184';

export const options = {
  scenarios: {static_delivery: {executor: 'shared-iterations', vus: 4, iterations: 48, maxDuration: '20s'}},
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    http_req_duration: ['p(95)<250'],
  },
};

export default function () {
  const [desk, corpus, report] = http.batch([
    ['GET', origin + '/index.html', null, {tags: {asset: 'desk'}}],
    ['GET', origin + '/corpus.json', null, {tags: {asset: 'corpus'}}],
    ['GET', origin + '/evaluation.json', null, {tags: {asset: 'report'}}],
  ]);
  check(desk, {'research desk HTML loads': response => response.status === 200 && response.body.includes('id="question-form"')});
  check(corpus, {'corpus loads with all 360 entries': response => response.status === 200 && response.json('documents').length === 360});
  check(report, {'benchmark JSON is complete': response => response.status === 200 && response.json('results').length === response.json('total')});
}

export function handleSummary(result) {
  const metrics = result.metrics;
  const summary = [
    'EU AI Act static delivery smoke check',
    `Requests: ${metrics.http_reqs.values.count}`,
    `Checks passed: ${metrics.checks.values.passes}`,
    `Failed request rate: ${metrics.http_req_failed.values.rate}`,
    `p95 HTTP duration: ${metrics.http_req_duration.values['p(95)'].toFixed(2)} ms`,
    '',
  ].join('\n');
  return {stdout: summary, 'quality-results/k6-summary.txt': summary,
    'quality-results/k6-results.json': JSON.stringify(result, null, 2)};
}
