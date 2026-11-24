import {isIP} from 'node:net';

// This bounds one warm function instance. A shared edge rule is needed across instances.
export function createAnswerLimit({now = Date.now, limit = 24, windowMs = 60_000} = {}) {
  let windowEnds = 0;
  const counts = new Map();
  return request => {
    const time = now();
    if (time >= windowEnds) {
      counts.clear();
      windowEnds = time + windowMs;
    }
    const ip = request.headers.get('x-vercel-forwarded-for');
    const key = isIP(ip ?? '') ? ip : '';
    const count = counts.get(key) ?? 0;
    const retryAfter = Math.ceil((windowEnds - time) / 1000);
    if (count >= limit || (!counts.has(key) && counts.size >= 4096)) return retryAfter;
    counts.set(key, count + 1);
    return 0;
  };
}
