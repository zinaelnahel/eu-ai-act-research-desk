import {modules, totalQuestions} from './learn-data.mjs';
import {recordAttempt, restoreProgress, storageKey, summarize} from './learn-progress.mjs';

const get = id => document.getElementById(id);
const quiz = get('quiz');
const storageNote = get('storage-note');
const start = get('start');
let saved = {};
let current;
let corpusRequest;

function node(tag, text, attributes = {}) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function button(text, handler, secondary = false) {
  const control = node('button', text, {type: 'button'});
  if (secondary) control.className = 'secondary';
  control.addEventListener('click', handler);
  return control;
}

try {
  saved = restoreProgress(JSON.parse(localStorage.getItem(storageKey)));
} catch {
  storageNote.textContent = 'Progress is available for this visit.';
}

function save(next) {
  saved = next;
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    storageNote.textContent = 'Progress is available for this visit.';
  }
}

function updateMap() {
  const {completed, mastered, points, level} = summarize(saved);
  get('level').textContent = 'Level ' + level;
  get('points').textContent = points.toLocaleString('en') + ' XP';
  get('progress').value = completed;
  get('progress').max = modules.length;
  get('stats').textContent = `${completed} of ${modules.length} topics practised · ${mastered} mastered`;
  get('map-detail').textContent = `${modules.length} topics · ${totalQuestions} scenarios · 100 XP per correct answer in your best attempt`;
  start.textContent = completed === 0 ? 'Start learning' : (completed < modules.length ? 'Continue learning' : 'Review topics');
  get('cards').replaceChildren(...modules.map(topic => {
    const result = saved[topic.id];
    const masteredTopic = result?.best === topic.questions.length;
    const card = node('article', '', {class: 'topic' + (masteredTopic ? ' mastered' : '')});
    const action = button(result ? 'Replay topic' : 'Start topic', () => open(topic));
    action.setAttribute('aria-label', `${action.textContent}: ${topic.title}`);
    card.append(node('p', topic.chapters, {class: 'chapter'}), node('h3', topic.title),
      node('p', topic.summary, {class: 'topic-description'}),
      node('p', result ? `Best: ${result.best}/${topic.questions.length}${masteredTopic ? ' · Mastered' : ''}`
        : `${topic.questions.length} scenarios`, {class: 'result'}), action);
    return card;
  }));
}

async function addSources(container, ids) {
  try {
    corpusRequest ||= fetch('./corpus.json').then(response => {
      if (!response.ok) throw new Error('Source collection unavailable');
      return response.json();
    }).then(corpus => new Map(corpus.documents.map(doc => [doc.id, doc])));
    const sources = await corpusRequest;
    for (const id of ids) {
      const item = sources.get(id);
      if (item) container.append(node('a', 'Read ' + item.label, {href: item.url, target: '_blank', rel: 'noopener noreferrer'}));
    }
  } catch {
    corpusRequest = undefined;
    container.append(node('a', 'Read the official text', {href: 'https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng'}));
  }
}

function closeQuiz() {
  current = undefined;
  quiz.hidden = true;
  quiz.replaceChildren();
  get('map-title').focus();
}

function open(topic) {
  current = {topic, answers: []};
  quiz.hidden = false;
  showQuestion();
}

function showQuestion() {
  const {topic, answers} = current;
  const item = topic.questions[answers.length];
  const title = node('h2', topic.title, {id: 'quiz-title', tabindex: '-1'});
  const form = node('form', '', {class: 'quiz-form'});
  const field = node('fieldset');
  field.append(node('legend', item.prompt));
  const labels = item.choices.map((choice, index) => {
    const label = node('label', '', {class: 'choice'});
    label.append(node('input', '', {type: 'radio', name: 'choice', value: index, required: ''}), node('span', choice));
    field.append(label);
    return label;
  });
  const actions = node('div', '', {class: 'learn-actions'});
  const check = node('button', 'Check answer', {type: 'submit'});
  actions.append(check, button('Back to chapter map', closeQuiz, true));
  form.append(field, actions);
  quiz.replaceChildren(node('p', `Question ${answers.length + 1} of ${topic.questions.length}`, {class: 'kicker'}), title, form);
  title.focus();

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (field.disabled) return;
    const selection = Number(new FormData(form).get('choice'));
    answers.push(selection);
    field.disabled = true;
    labels[item.correct].classList.add('correct');
    if (selection !== item.correct) labels[selection].classList.add('incorrect');
    const feedback = node('div', '', {class: 'feedback'});
    const feedbackTitle = node('h3', selection === item.correct ? 'Correct' : 'Take another look', {tabindex: '-1'});
    feedback.append(feedbackTitle);
    if (selection !== item.correct) feedback.append(node('p', 'Correct answer: ' + item.choices[item.correct]));
    feedback.append(node('p', item.why));
    void addSources(feedback, item.sources);
    check.remove();
    form.insertBefore(feedback, actions);
    const last = answers.length === topic.questions.length;
    actions.prepend(button(last ? 'See results' : 'Next question', last ? showResults : showQuestion));
    feedbackTitle.focus();
  });
}

function showResults() {
  const {topic, answers} = current;
  const previous = saved[topic.id]?.best || 0;
  const result = recordAttempt(saved, topic, answers);
  if (!topic.mixed) save(result.progress);
  updateMap();
  const title = node('h2', result.score === answers.length ? 'Perfect round' : 'Round complete', {id: 'quiz-title', tabindex: '-1'});
  const actions = node('div', '', {class: 'learn-actions'});
  const next = modules[modules.indexOf(topic) + 1];
  if (!topic.mixed && next) actions.append(button('Next topic', () => open(next)));
  actions.append(button('Play again', () => topic.mixed ? mixed() : open(topic)), button('Back to chapter map', closeQuiz, true));
  const detail = topic.mixed ? 'Mixed challenges are practice rounds.' : `+${Math.max(0, result.score - previous) * 100} XP · Best score ${result.progress[topic.id].best}/${answers.length}`;
  quiz.replaceChildren(node('p', topic.title, {class: 'kicker'}), title,
    node('p', `${result.score} of ${answers.length} correct`), node('p', detail), actions);
  const missed = topic.questions.filter((item, index) => answers[index] !== item.correct);
  if (missed.length) {
    const review = node('details');
    review.append(node('summary', 'Review missed questions'));
    for (const item of missed) {
      const explanation = node('div', '', {class: 'feedback'});
      explanation.append(node('h3', item.prompt), node('p', item.why));
      void addSources(explanation, item.sources);
      review.append(explanation);
    }
    quiz.insertBefore(review, actions);
  }
  title.focus();
}

function mixed() {
  const shuffled = [...modules];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const questions = shuffled.slice(0, 8).map(topic => topic.questions[Math.floor(Math.random() * topic.questions.length)]);
  open({id: 'mixed', title: 'Mixed challenge', mixed: true, questions});
}

start.addEventListener('click', () => {
  const next = modules.find(topic => !saved[topic.id]);
  if (next) open(next);
  else get('map-title').focus();
});
get('challenge').addEventListener('click', mixed);
updateMap();
