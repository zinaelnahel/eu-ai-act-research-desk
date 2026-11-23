import {modules} from './learn-data.mjs';

export const storageKey = 'eu-ai-act-learning-v1';

export function restoreProgress(value) {
  const incoming = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(modules.flatMap(topic => {
    const entry = incoming[topic.id];
    if (!entry || !Number.isInteger(entry.best) || entry.best < 0 ||
        entry.best > topic.questions.length || !Number.isInteger(entry.attempts) || entry.attempts < 1) return [];
    return [[topic.id, {best: entry.best, attempts: entry.attempts}]];
  }));
}

export function recordAttempt(progress, topic, answers) {
  if (answers.length !== topic.questions.length ||
      answers.some((answer, index) => !Number.isInteger(answer) || answer < 0 ||
        answer >= topic.questions[index].choices.length)) {
    throw new RangeError('A complete attempt must contain one valid answer per question.');
  }
  const score = answers.filter((answer, index) => answer === topic.questions[index].correct).length;
  const previous = progress[topic.id] || {best: 0, attempts: 0};
  return {
    score,
    progress: {...progress, [topic.id]: {best: Math.max(previous.best, score), attempts: previous.attempts + 1}},
  };
}

export function summarize(progress) {
  const results = Object.values(progress);
  const points = results.reduce((total, result) => total + 100 * result.best, 0);
  return {
    completed: results.length,
    mastered: modules.filter(topic => progress[topic.id]?.best === topic.questions.length).length,
    points,
    level: 1 + Math.floor(points / 500),
  };
}
