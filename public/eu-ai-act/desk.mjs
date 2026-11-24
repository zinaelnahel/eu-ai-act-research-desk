import {createDesk} from './search.mjs';
import {resolveFollowUp} from './follow-up.mjs';

const byId = id => document.getElementById(id);
const form = byId('question-form');
const question = byId('question');
const status = byId('status');
const answer = byId('answer');
const history = byId('conversation-history');
const reset = byId('reset-conversation');
const ask = byId('ask');
const evidenceOnly = byId('evidence-only');
const kind = byId('kind');
const provision = byId('provision');
const examples = [...document.querySelectorAll('.examples button')];
let modelRequest;
let previous;
let activeQuestion;

fetch('/api/source-status', {signal: AbortSignal.timeout(9000)})
  .then(async response => {
    const notice = byId('source-check');
    if (response.status === 404) return;
    if (!response.ok) throw new Error('Source check unavailable');
    const {checkedAt, changes} = await response.json();
    const date = new Intl.DateTimeFormat('en-GB', {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(checkedAt));
    notice.textContent = `Sources checked ${date} (UTC). ` +
      (changes.length ? 'New source records are awaiting review. Answers use the edition shown above.' : 'No new records were found.');
    for (const change of changes) {
      const url = new URL('https://eur-lex.europa.eu/legal-content/EN/TXT/');
      url.searchParams.set('uri', 'CELEX:' + change.id);
      notice.append(' ', sourceLink(change.id, url.href));
    }
    notice.hidden = false;
  }).catch(() => {
    const notice = byId('source-check');
    notice.textContent = 'Source check unavailable. Answers use the edition shown above.';
    notice.hidden = false;
  });

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function sourceLink(text, url) {
  const link = element('a', text, 'source-link');
  link.href = url;
  return link;
}

function passageLabel(label, quote) {
  if (label === 'Article 25' && /^1\. .+\(a\).+otherwise allocated;$/s.test(quote)) return 'Article 25(1)(a)';
  const paragraph = /^(\d+)\.\s/.exec(quote)?.[1];
  return paragraph && /^Article /.test(label) ? `${label}(${paragraph})` : label;
}

function renderEvidence(item, doc, showContext = true) {
  const section = element('section', '', 'evidence');
  const label = showContext ? (item.clause ? `${item.label}(1)(${item.clause})` : passageLabel(item.label, item.quote)) : item.label;
  section.append(element('h3', [label, item.title].filter(Boolean).join(' · ')));
  section.append(element('p', item.focused || item.quote));
  for (const passage of item.supporting || []) {
    const paragraph = /^([0-9]+)\. /.exec(passage)?.[1];
    const label = paragraph ? `${item.label}(${paragraph})` : item.label;
    const suffix = item.id === 'art_50' ? ' · Timing' : '';
    section.append(element('h4', label + suffix), element('p', passage));
  }
  section.append(sourceLink(doc.kind === 'recital' ? 'Read the Official Journal recital' : 'Read the consolidated provision', item.url));
  if (showContext && item.quote !== doc.blocks.join('\n\n') && doc.blocks.length > 1) {
    const detail = element('details');
    detail.append(element('summary', 'Read the full provision'));
    detail.append(element('p', doc.blocks.join('\n\n')));
    section.append(detail);
  }
  answer.append(section);
}

function renderGenerated(claims, documents) {
  const section = element('section', '', 'generated-answer');
  section.append(element('h3', 'AI-generated research answer'));
  const list = element('ol');
  for (const claim of claims) {
    const item = element('li', claim.text + ' ');
    const label = claim.clause ? `${claim.label}(1)(${claim.clause})` : passageLabel(claim.label, claim.quote);
    item.append(sourceLink(label, claim.url));
    const details = element('details');
    details.append(element('summary', 'Read supporting quote'), element('p', claim.quote));
    const provision = documents.get(claim.sourceId);
    if (provision && provision.blocks.join('\n\n') !== claim.quote) {
      const context = element('details');
      context.append(element('summary', 'Read the surrounding provision'), element('p', provision.blocks.join('\n\n')));
      details.append(context);
    }
    item.append(details);
    list.append(item);
  }
  section.append(list);
  answer.querySelector('.asked-question').after(section);
}

async function requestGeneratedAnswer(text, documents) {
  const controller = new AbortController();
  modelRequest = controller;
  status.textContent = 'Preparing a cited answer. Retrieved evidence is shown below.';
  try {
    const response = await fetch('/api/answer', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({question: text}),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(52_000)]),
    });
    if (response.status === 429) {
      if (modelRequest === controller) status.textContent = 'Ask AI is receiving too many requests. Try again shortly or read the evidence below.';
      return;
    }
    if (!response.ok) throw new Error('Generation unavailable');
    const result = await response.json();
    if (modelRequest !== controller) return;
    if (result.status === 'answered' && result.claims.length) {
      renderGenerated(result.claims, documents);
      if (previous) {
        previous.ids = [...new Set(result.claims.map(claim => claim.sourceId).filter(id => documents.has(id)))];
      }
      status.textContent = 'Generated answer with supporting citations. Check the official wording before relying on it.';
    } else {
      status.textContent = 'A supported generated answer was unavailable. Review the retrieved evidence below.';
    }
  } catch {
    if (modelRequest === controller) status.textContent = 'Generation is temporarily unavailable. Review the retrieved evidence below.';
  } finally {
    if (modelRequest === controller) modelRequest = undefined;
  }
}

try {
  const response = await fetch('./corpus.json');
  if (!response.ok) throw new Error('Corpus response failed');
  const corpus = await response.json();
  const desk = createDesk(corpus);
  byId('edition').textContent = corpus.version + ' · ' + corpus.documents.length + ' provisions';
  byId('official-source').href = corpus.currentSource;
  status.textContent = 'Ask a question above or select a provision to read.';
  ask.disabled = false;
  evidenceOnly.disabled = false;
  reset.addEventListener('click', () => {
    modelRequest?.abort();
    modelRequest = previous = activeQuestion = undefined;
    answer.replaceChildren();
    history.replaceChildren();
    history.hidden = reset.hidden = true;
    question.value = '';
    provision.value = '';
    status.textContent = 'Ask a question above or select a provision to read.';
    question.focus();
  });
  for (const button of examples) {
    button.disabled = false;
    button.addEventListener('click', () => {
      question.value = button.textContent;
      form.requestSubmit();
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    modelRequest?.abort();
    modelRequest = undefined;
    provision.value = '';
    if (event.submitter !== evidenceOnly && /^(?:hi|hello|hey)(?:\s+there)?[!.,?]*$/i.test(question.value.trim())) {
      status.textContent = 'Hi! I can help you explore the EU AI Act. Ask about a rule, an obligation, or an exception, or try one of the example questions above.';
      byId('answer-title').focus();
      return;
    }
    const next = event.submitter === evidenceOnly ? {question: question.value} : resolveFollowUp(question.value, previous);
    if (next.clarify) {
      status.textContent = 'Which topic or provision do you mean? Name it in your question so I can find the right evidence.';
      byId('answer-title').focus();
      return;
    }
    if (activeQuestion && activeQuestion !== question.value.trim()) {
      const turn = element('details', '', 'evidence conversation-turn');
      turn.append(element('summary', activeQuestion), ...answer.childNodes);
      history.prepend(turn);
      if (history.children.length > 5) history.lastElementChild.remove();
      history.hidden = false;
    }
    answer.replaceChildren();
    activeQuestion = undefined;
    const result = desk.ask(next.question);
    status.textContent = result.reason || {
      lookup: 'Requested source',
      evidence: 'Relevant provisions. Read each excerpt and its surrounding context.',
      matches: 'Possible matches. Review the official wording before drawing a conclusion.',
    }[result.kind];
    if (result.summary) answer.append(element('p', result.summary));
    for (const item of result.evidence) renderEvidence(item, desk.documents.get(item.id));
    if (result.kind === 'version') answer.append(sourceLink('Check for current versions on EUR-Lex', 'https://eur-lex.europa.eu/eli/reg/2024/1689'));
    byId('answer-title').focus();
    if (event.submitter !== evidenceOnly && ['evidence', 'matches'].includes(result.kind)) {
      activeQuestion = question.value.trim();
      previous = {question: next.question, ids: result.evidence.map(item => item.id)};
      reset.hidden = false;
      const prompt = element('p', '', 'asked-question');
      prompt.append(element('strong', 'You asked: '), document.createTextNode(activeQuestion));
      answer.prepend(prompt);
      if (next.reference) prompt.append(element('span', ` · Following up on ${next.reference}`));
      void requestGeneratedAnswer(next.question, desk.documents);
    } else {
      previous = undefined;
    }
  });

  function populate() {
    provision.replaceChildren(new Option('Choose a provision', ''));
    for (const item of corpus.documents.filter(doc => doc.kind === kind.value)) {
      provision.add(new Option([item.label, item.title].filter(Boolean).join(' · '), item.id));
    }
    provision.disabled = false;
  }
  kind.addEventListener('change', populate);
  provision.addEventListener('change', () => {
    const doc = desk.documents.get(provision.value);
    if (!doc) return;
    modelRequest?.abort();
    modelRequest = undefined;
    status.textContent = 'Browsing the source edition.';
    previous = activeQuestion = undefined;
    answer.replaceChildren();
    renderEvidence({...doc, quote: doc.blocks.join('\n\n')}, doc, false);
    byId('answer-title').focus();
  });
  populate();
} catch {
  status.textContent = 'The source collection could not be loaded. You can still open the official text on EUR-Lex.';
}
