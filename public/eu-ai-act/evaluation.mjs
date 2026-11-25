const metrics = document.getElementById('metrics');
const hostedSmoke = document.getElementById('hosted-smoke');
async function smokeStatus(url) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(6000)});
    if (response.ok) return (await response.json()).latest;
  } catch {
    // Keep the workflow link available when the results cannot be loaded.
  }
  return null;
}

async function showHostedSmoke() {
  const [recorded, weekly] = await Promise.all([
    smokeStatus('./hosted-smoke.json'),
    smokeStatus('/api/smoke-status'),
  ]);
  const latest = [weekly, recorded].filter(run => Number.isFinite(Date.parse(run?.date)))
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))[0];
  if (!latest) return;
  const date = new Intl.DateTimeFormat('en', {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(latest.date));
  const weeklyRun = latest === weekly;
  const conclusion = latest.conclusion;
  const outcome = weeklyRun
    ? (conclusion === 'success' ? 'Passed' : conclusion === 'failure' ? 'Failed' : conclusion.replaceAll('_', ' '))
    : latest.passed + ' of ' + latest.total + ' passed';
  hostedSmoke.href = weeklyRun ? latest.url : './hosted-smoke.json';
  hostedSmoke.textContent = (weeklyRun ? 'Weekly hosted smoke' : 'Recorded hosted smoke') + ' · ' + date + ' · ' + outcome;
}

void showHostedSmoke();
const formatPrecision = value => value === null ? '—' : new Intl.NumberFormat('en', {style: 'percent', maximumFractionDigits: 1}).format(value);
try {
  const response = await fetch('./evaluation.json');
  if (!response.ok) throw new Error('Report unavailable');
  const report = await response.json();
  metrics.textContent = `${report.passed} of ${report.total} scenarios passed · ${report.edition}`;
  document.getElementById('precision').textContent = `${formatPrecision(report.precision)} provision precision · ${report.unexpected} unexpected results`;
  const table = document.getElementById('cases');
  for (const item of report.results) {
    const row = table.insertRow();
    const issues = [...item.unexpected.map(id => 'Unexpected ' + id), ...item.duplicates.map(id => 'Duplicate ' + id)];
    for (const text of [item.question.trim() || '(Empty question)', item.expected, item.actual, formatPrecision(item.precision),
      [item.passed ? 'Pass' : 'Fail', ...issues].join(' · ')]) {
      row.insertCell().textContent = text;
    }
    for (const [id, reason] of Object.entries(item.optionalSources)) {
      const note = document.createElement('small');
      note.textContent = `Optional ${id}. ${reason}`;
      row.cells[1].append(document.createElement('br'), note);
    }
  }
} catch {
  metrics.textContent = 'The report could not be loaded.';
}
