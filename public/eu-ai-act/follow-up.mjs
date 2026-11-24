import {gpaiPlacementDay} from './gpai-cutoff.mjs';

export function resolveFollowUp(question, previous) {
  const text = question.trim();
  if (!/^(?:and\s+|what about\b|how about\b|what if (?:it|that|the (?:incident|model)|(?:exactly )?on)\b|(?:does|do|would|will|is|are) (?:it|that|they|those|this)\b|(?:what|which) (?:is|are|was) (?:the |its |their )?(?:exceptions?|limits?)\b|what['’]s the exception\b)/i.test(text)) {
    return {question: text};
  }
  if (previous?.ids.length !== 1) return {clarify: true};
  const [id] = previous.ids;
  if (id === 'art_111') {
    const day = gpaiPlacementDay(text);
    if (day) return {question: `Does the transitional deadline apply to a GPAI model first placed on the market on ${day} August 2025?`, reference: 'Article 111(3)'};
  }
  if (id === 'art_85' && /\bcompensation\b/i.test(text)) {
    return {question: 'Is filing an AI Act complaint the same as seeking compensation?', reference: 'Article 85'};
  }
  if (id === 'art_73' && /\bcritical infrastructure\b/i.test(text)) {
    return {question: 'What is the reporting deadline if a serious incident disrupts critical infrastructure?', reference: 'Article 73'};
  }
  const emotion = id === 'art_5' && /infer.{0,32}emotions|emotion recognition/i.test(previous.question);
  if (emotion &&
      /\b(?:schools?|education|pupils?|students?)\b/i.test(text)) {
    return {question: 'Does the prohibition on AI emotion recognition also apply in schools?', reference: 'Article 5'};
  }
  if (/\bexceptions?\b/i.test(text)) {
    if (emotion) {
      const setting = /\bschools?\b/i.test(previous.question) ? 'schools' : 'the workplace';
      return {question: `What exceptions apply to emotion recognition in ${setting}?`, reference: 'Article 5'};
    }
    if (id === 'art_50' && /chatbot/i.test(previous.question)) {
      return {question: 'What are the exceptions to chatbot disclosure?', reference: 'Article 50'};
    }
  }
  return {clarify: true};
}
