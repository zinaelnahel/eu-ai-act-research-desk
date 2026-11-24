const repository = 'zinaelnahel/eu-ai-act-research-desk';
const runsUrl = 'https://api.github.com/repos/' + repository +
  '/actions/workflows/starter-smoke.yml/runs?branch=main&status=completed&per_page=10';
const runTitle = 'Ask AI starters and semantic boundaries';

export function createSmokeStatusHandler(fetchRuns = fetch) {
  return async request => {
    if (request.method !== 'GET') return new Response(null, {status: 405, headers: {Allow: 'GET'}});
    try {
      const response = await fetchRuns(runsUrl, {
        headers: {Accept: 'application/vnd.github+json'},
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('GitHub Actions unavailable');
      const {workflow_runs: runs} = await response.json();
      const run = runs.find(item => item.display_title === runTitle);
      const date = run?.run_started_at ?? run?.created_at;
      if (run && (!Number.isSafeInteger(run.id) || !Number.isFinite(Date.parse(date)) || !run.conclusion)) {
        throw new Error('Invalid workflow run');
      }
      return Response.json({latest: run ? {
        date, conclusion: run.conclusion, url: 'https://github.com/' + repository + '/actions/runs/' + run.id,
      } : null}, {headers: {'Cache-Control': 'public, max-age=0, s-maxage=900'}});
    } catch {
      return Response.json({error: 'Hosted smoke status unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
  };
}

export default {fetch: createSmokeStatusHandler()};
