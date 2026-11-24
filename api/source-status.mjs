import {checkSources} from '../eu-ai-act/source-monitor.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return new Response(null, {status: 405, headers: {Allow: 'GET'}});
    try {
      return Response.json(await checkSources(), {
        headers: {'Cache-Control': 'public, max-age=0, s-maxage=3600'},
      });
    } catch {
      return Response.json({error: 'Source check unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
  },
};
