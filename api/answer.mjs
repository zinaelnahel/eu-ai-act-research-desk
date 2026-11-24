import {answerRag} from '../eu-ai-act/rag.mjs';
import {createProvider} from '../eu-ai-act/rag-provider.mjs';

const json = (value, status = 200) => Response.json(value, {
  status, headers: {'Cache-Control': 'no-store'},
});

async function readQuestion(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, {stream: true});
  }
  try {
    const data = JSON.parse(text + decoder.decode());
    return typeof data?.question === 'string' && data.question.trim() && data.question.length <= 600
      ? data.question.trim() : null;
  } catch {
    return null;
  }
}

export function createAnswerHandler(complete, run = answerRag) {
  return async request => {
    if (request.method === 'GET') return json({available: Boolean(complete)});
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405);
    if (request.headers.get('sec-fetch-site') === 'cross-site') return json({error: 'Same-site requests only'}, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return json({error: 'Send a JSON question'}, 415);
    }
    const question = await readQuestion(request);
    if (!question) return json({error: 'Enter a question of up to 600 characters'}, 400);
    if (!complete) return json({status: 'unavailable', claims: []}, 503);
    return json(await run(question, {complete}));
  };
}

const handle = createAnswerHandler(createProvider());
export default {fetch: handle};
