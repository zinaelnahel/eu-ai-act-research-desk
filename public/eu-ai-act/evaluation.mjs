const metrics = document.getElementById('metrics');
const hostedSmoke = document.getElementById('hosted-smoke');
fetch('/api/smoke-status', {signal: AbortSignal.timeout(6000)})
  .then(async response => {
    if (!response.ok) return;
    const {latest} = await response.json();
    if (!latest) {
      hostedSmoke.textContent = 'Weekly hosted smoke · awaiting first expanded run';
      return;
    }
    const date = new Intl.DateTimeFormat('en', {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(latest.date));
    const {conclusion} = latest;
    const outcome = conclusion === 'success' ? 'Passed' : conclusion === 'failure' ? 'Failed' : conclusion.replaceAll('_', ' ');
    hostedSmoke.href = latest.url;
    hostedSmoke.textContent = 'Weekly hosted smoke · ' + date + ' · ' + outcome;
  })
  .catch(() => {/* The workflow link remains available. */});
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
