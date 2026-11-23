const metrics = document.getElementById('metrics');
try {
  const response = await fetch('./evaluation.json');
  if (!response.ok) throw new Error('Report unavailable');
  const report = await response.json();
  metrics.textContent = `${report.passed} of ${report.total} scenarios passed · ${report.edition}`;
  const table = document.getElementById('cases');
  for (const item of report.results) {
    const row = table.insertRow();
    for (const text of [item.question.trim() || '(Empty question)', item.expected, item.actual, item.passed ? 'Pass' : 'Fail']) {
      row.insertCell().textContent = text;
    }
  }
} catch {
  metrics.textContent = 'The report could not be loaded.';
}
