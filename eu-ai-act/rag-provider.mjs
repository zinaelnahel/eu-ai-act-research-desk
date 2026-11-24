const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/api/chat';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export function createProvider(env = process.env, request = fetch) {
  const localModel = env.EU_AI_ACT_OLLAMA_MODEL;
  const apiKey = env.EU_AI_ACT_OPENAI_KEY;
  const hostedModel = env.EU_AI_ACT_OPENAI_MODEL;
  const useLocal = Boolean(localModel && !env.VERCEL);
  if (!useLocal && !(apiKey && hostedModel)) return undefined;

  return async (stage, instructions, data, schema) => {
    const messages = [{role: 'system', content: instructions}, {role: 'user', content: JSON.stringify(data)}];
    const payload = useLocal ? {
      model: localModel, messages, stream: false, think: false, format: schema,
      options: {temperature: 0, num_predict: 700, num_ctx: 8192},
    } : {
      model: hostedModel, messages, max_completion_tokens: 900,
      response_format: {type: 'json_schema', json_schema: {name: 'research_desk_' + stage, strict: true, schema}},
    };
    const headers = {'Content-Type': 'application/json'};
    if (!useLocal) headers.Authorization = 'Bearer ' + apiKey;
    const response = await request(useLocal ? OLLAMA_ENDPOINT : OPENAI_ENDPOINT, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(useLocal ? 25_000 : 11_000),
    });
    if (!response.ok) throw new Error('Model request failed');
    const body = await response.json();
    const message = useLocal ? body.message : body.choices?.[0]?.message;
    return JSON.parse(message?.content);
  };
}
