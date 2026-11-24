export function resolveFollowUp(question, previous) {
  const text = question.trim();
  if (!/^(?:and\s+|what about\b|how about\b|(?:does|do|would|will|is|are) (?:it|that|they|those|this)\b|(?:what|which) (?:is|are|was) (?:the |its |their )?(?:exceptions?|limits?)\b|what['’]s the exception\b)/i.test(text)) {
    return {question: text};
  }
  if (previous?.ids.length !== 1) return {clarify: true};
  const [id] = previous.ids;
  const emotion = id === 'art_5' && /infer.{0,32}emotions|emotion recognition/i.test(previous.question);
  if (emotion &&
      /\b(?:schools?|education|pupils?|students?)\b/i.test(text)) {
    return {question: 'Could a school use AI to infer pupils’ emotions?', reference: 'Article 5'};
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
