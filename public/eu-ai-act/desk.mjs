import {createDesk} from './search.mjs';

const byId = id => document.getElementById(id);
const form = byId('question-form');
const question = byId('question');
const status = byId('status');
const answer = byId('answer');
const kind = byId('kind');
const provision = byId('provision');
const examples = [...document.querySelectorAll('.examples button')];

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

function renderEvidence(item, doc, showContext = true) {
  const section = element('section', '', 'evidence');
  section.append(element('h3', [item.label, item.title].filter(Boolean).join(' · ')));
  section.append(element('p', item.quote));
  section.append(sourceLink('Open this provision on EUR-Lex', item.url));
  if (showContext && item.quote !== doc.blocks.join('\n\n') && doc.blocks.length > 1) {
    const detail = element('details');
    detail.append(element('summary', 'Read the full provision'));
    detail.append(element('p', doc.blocks.join('\n\n')));
    section.append(detail);
  }
  answer.append(section);
}

try {
  const response = await fetch('./corpus.json');
  if (!response.ok) throw new Error('Corpus response failed');
  const corpus = await response.json();
  const desk = createDesk(corpus);
  byId('edition').textContent = corpus.version + ' · ' + corpus.documents.length + ' provisions';
  byId('official-source').href = corpus.currentSource;
  status.textContent = 'Ask a question above or select a provision to read.';
  byId('ask').disabled = false;
  for (const button of examples) {
    button.disabled = false;
    button.addEventListener('click', () => {
      question.value = button.textContent;
      form.requestSubmit();
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    provision.value = '';
    const result = desk.ask(question.value);
    answer.replaceChildren();
    status.textContent = result.reason || {
      lookup: 'Requested source',
      evidence: 'Relevant provisions. Read each excerpt and its surrounding context.',
      matches: 'Possible matches. Review the official wording before drawing a conclusion.',
    }[result.kind];
    if (result.summary) answer.append(element('p', result.summary));
    for (const item of result.evidence) renderEvidence(item, desk.documents.get(item.id));
    if (result.kind === 'version') answer.append(sourceLink('Check for current versions on EUR-Lex', 'https://eur-lex.europa.eu/eli/reg/2024/1689'));
    byId('answer-title').focus();
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
    status.textContent = 'Browsing the source edition.';
    answer.replaceChildren();
    renderEvidence({...doc, quote: doc.blocks.join('\n\n')}, doc, false);
    byId('answer-title').focus();
  });
  populate();
} catch {
  status.textContent = 'The source collection could not be loaded. You can still open the official text on EUR-Lex.';
}
