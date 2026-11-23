const STOP = new Set('a an and are as at be by can could do does for from had has have how i if in into is it its may me must of on or our shall should so than that the their them these this those to under use was we were what when where which who why will with would you your regulation act eu ai system systems'.split(' '));
const ROMAN = ['','i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv'];
const TOPICS = [
  [/\b(fines?|penalt(?:y|ies)|sanctions?)\b.*\b(gpai|general[ -]purpose.{0,12}models?)\b|\b(gpai|general[ -]purpose.{0,12}models?)\b.*\b(fines?|penalt(?:y|ies)|sanctions?)\b/i, [['art_101', /fines/i]]],
  [/\b(emotions?|moods?|feelings)\b.*\b(work|workplace|workers?|schools?|employees?|education)\b|\b(work|workplace|workers?|schools?|employees?|education)\b.*\b(emotions?|moods?|feelings)\b/i, [['art_5', /\(f\).*?infer emotions/is], ['art_50', /emotion recognition/i]]],
  [/\b(chatbots?|interact(?:ing|ion)?)\b.*\b(disclos\w*|inform\w*|tell|notic\w*|transparen\w*|label\w*)\b|\b(disclos\w*|inform\w*|tell|notic\w*|transparen\w*|label\w*)\b.*\b(chatbots?|interact(?:ing|ion)?)\b/i, [['art_50', /interact directly/i]]],
  [/\b(deep[ -]?fakes?|synthetic media)\b/i, [['art_50', /deep fake/i], ['art_3', /deep fake/i]]],
  [/\b(literacy|train(?:ing)? staff|employees?.{0,35}training)\b/i, [['art_4', /literacy/i], ['art_3', /literacy/i]]],
  [/\b(gpai|general[ -]purpose.{0,12}models?)\b.*\b(obligation\w*|provider\w*|duties|copyright|open[ -]source)\b|\b(obligation\w*|provider\w*|duties|copyright|open[ -]source)\b.*\b(gpai|general[ -]purpose.{0,12}models?)\b/i, [['art_53', /providers of general-purpose/i], ['art_55', /systemic risk/i]]],
  [/\b(hir(?:e|ing)|recruit(?:ment|ing)?|job applicants?|screen(?:ing)? candidates?)\b/i, [['anx_III', /recruitment or selection/i], ['art_6', /Annex III/i]]],
  [/\b(fines?|penalt(?:y|ies)|sanctions?)\b/i, [['art_99', /administrative fines/i], ['art_101', /fines/i]]],
  [/\b(sandboxes?|sandbox)\b/i, [['art_57', /sandbox/i], ['art_58', /sandbox/i]]],
  [/\b(report\w*|notifi\w*)\b.*\bserious incidents?\b|\bserious incidents?\b.*\b(report\w*|notifi\w*)\b/i, [['art_73', /report/i]]],
  [/\bfundamental rights impact assessment\b|\bfria\b/i, [['art_27', /assessment/i]]],
  [/\b(human oversight|human supervision|human intervention)\b/i, [['art_14', /human oversight/i]]],
  [/\b(complain|complaints?|file a complaint)\b/i, [['art_85', /complaint/i]]],
  [/\b(explanation|explain)\b.*\bdecision\b|\bdecision\b.*\bexplanation\b/i, [['art_86', /explanation/i]]],
  [/\bimporters?\b/i, [['art_23', /importers/i]]],
  [/\bdistributors?\b/i, [['art_24', /distributors/i]]],
  [/\bregister\b.*\bhigh[ -]risk\b|\bregistration\b.*\bhigh[ -]risk\b|\bhigh[ -]risk\b.*\b(register|registration)\b/i, [['art_49', /register/i], ['art_71', /database/i]]],
  [/\b(standards?|harmoni[sz]ed)\b.*\bpresumption\b|\bpresumption\b.*\bstandards?\b/i, [['art_40', /presumed/i]]],
  [/\bnotified bodies\b.*\b(designat\w*|application)\b|\b(designat\w*|application)\b.*\bnotified bodies\b/i, [['art_30', /notifying authority/i], ['art_31', /notified body/i]]],
];
const CURRENT = /\b(as of today|currently in force|latest (?:version|amendments?)|changed since .{0,10}2026)\b/i;
const TIMING = /\b(application dates?|when (?:does|will|did) (?:the )?(?:eu ai act|ai act|act|regulation|rules?) (?:start|apply|enter)|(?:start|become) applicable|transition(?:al)? dates?)\b/i;
const NOTES = {
  art_4: 'Providers and deployers must take measures to support AI literacy. The measures should reflect staff experience, training, and the context of use. Article 4(1) does not require them to guarantee a specific level of literacy for each person.',
  art_53: 'Article 53 sets documentation, downstream information, copyright policy, and training-content summary obligations. The open-source exception covers some documentation duties and does not apply to models with systemic risk. Article 55 adds duties for systemic-risk models.',
  art_85: 'A person or organisation with grounds to believe the Act was infringed may complain to the relevant market surveillance authority. Article 85 preserves other administrative or judicial remedies.',
  art_113: 'The general application date is 2 August 2026, with earlier or later dates for specific provisions. Article 111 contains separate transitional rules for certain existing systems and models.',
};

function stem(word) {
  return word.length > 5 ? word.replace(/(?:ing|ed|es|s)$/, '') : word.replace(/(?<=\w{3})s$/, '');
}
function terms(text) {
  return [...new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length > 1 && !STOP.has(word)).map(stem))];
}
function intersect(query, index) {
  return query.filter(word => index.has(word));
}
function snippet(doc, pattern) {
  const blocks = doc.blocks;
  if (!pattern || blocks.length === 1) return blocks[0];
  return blocks.find(block => pattern.test(block)) || blocks[0];
}
function narrowQuote(id, text) {
  if (id !== 'art_5') return text;
  return text.match(/\(f\) the placing on the market.*?medical or safety reasons;/i)?.[0] || text;
}
function explicitReferences(question) {
  return [...question.matchAll(/\b(articles?|art\.|annex(?:es)?|(?:amendment )?recitals?)\s+([0-9]{1,3}[a-z]?|[ivx]{1,5})\b((?:\s*(?:,|and)\s*(?:[0-9]{1,3}[a-z]?|[ivx]{1,5})\b)*)/gi)]
    .flatMap(([, type, first, tail]) => [first, ...(tail.match(/\b(?:[0-9]{1,3}[a-z]?|[ivx]{1,5})\b/gi) || [])].map(reference => {
      const lower = reference.toLowerCase();
      if (/^annex/i.test(type)) return 'anx_' + (ROMAN[Number(lower)] || lower).toUpperCase();
      if (/^amendment/i.test(type)) return 'amend_rct_' + lower;
      return (/^r/i.test(type) ? 'rct_' : 'art_') + lower;
    }));
}
function citation(doc, text) {
  return {id: doc.id, label: doc.label, title: doc.title, url: doc.url, quote: text};
}
export function createDesk(corpus) {
  const documents = new Map(corpus.documents.map(doc => [doc.id, doc]));
  const entries = corpus.documents.map(doc => ({
    doc,
    title: new Set(terms(doc.title)),
    blocks: doc.blocks.map(text => ({text, terms: new Set(terms(text))})),
  }));
  const frequency = new Map();
  for (const entry of entries) {
    for (const word of new Set(entry.blocks.flatMap(block => [...block.terms]))) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }
  const weight = word => Math.log(1 + entries.length / (1 + (frequency.get(word) || 0)));
  const score = words => words.reduce((total, word) => total + weight(word), 0);

  function ask(raw) {
    const question = raw.trim().slice(0, 600);
    if (!question) return {kind: 'abstain', reason: 'Enter a question about the Act.', evidence: []};
    const words = terms(question);
    const ids = [...new Set(explicitReferences(question))];
    if (CURRENT.test(question)) {
      return {kind: 'version', reason: 'This desk uses a dated edition and cannot verify changes after 27 July 2026. Check the current regulation on EUR-Lex.', evidence: []};
    }
    if (ids.length) {
      const resolved = ids.map(id => documents.get(id)).filter(Boolean);
      if (resolved.length !== ids.length) {
        return {kind: 'abstain', reason: 'A cited provision is outside this edition. Check the consolidated regulation for added or renumbered provisions.', evidence: []};
      }
      const context = words.filter(word => !/^(?:\d|[ivx]+$|article$|annex$|recital$|amendment$|say$|mean$|requir$|compar$)/.test(word));
      return {kind: 'lookup', evidence: resolved.map(doc => {
        if (doc.id === 'art_113') return citation(doc, doc.blocks.join('\n\n'));
        const paragraph = question.match(/\b(?:article|art\.)\s+\d+[a-z]?\s*\((\d+[a-z]?)\)/i)?.[1];
        const exact = paragraph && doc.blocks.find(block => block.startsWith(paragraph + '.'));
        if (resolved.length === 1 && exact) return citation(doc, exact);
        const ranked = doc.blocks.map(text => [text, score(intersect(context, new Set(terms(text))))]);
        ranked.sort((a, b) => b[1] - a[1]);
        return citation(doc, ranked[0][1] > 0 ? ranked[0][0] : doc.blocks.join('\n\n'));
      })};
    }
    if (TIMING.test(question)) {
      const dates = documents.get('art_113');
      const transitions = documents.get('art_111');
      return {kind: 'evidence', summary: NOTES.art_113, evidence: [
        citation(dates, dates.blocks.join('\n\n')),
        citation(transitions, transitions.blocks.join('\n\n')),
      ]};
    }
    const matched = TOPICS.find(([pattern]) => pattern.test(question));
    if (matched) {
      const evidence = matched[1].map(([id, pattern]) => {
        const doc = documents.get(id);
        const text = id === 'art_53' ? doc.blocks.slice(0, 2).join('\n\n') : snippet(doc, pattern);
        return citation(doc, narrowQuote(id, text));
      });
      const primary = evidence[0];
      let summary = NOTES[primary.id];
      if (primary.id === 'art_5') {
        summary = 'The Act prohibits AI used to infer emotions in workplaces and educational institutions, with an exception for uses intended for medical or safety reasons. Article 50 separately addresses informing people exposed to an emotion recognition system.';
      }
      if (primary.id === 'art_50' && /interact directly/i.test(primary.quote)) {
        summary = 'Providers of AI intended to interact directly with people generally must inform them that they are interacting with AI, unless that is obvious in context. Article 50(1) also specifies an exception for certain law-enforcement systems.';
      }
      return {kind: 'evidence', summary, evidence};
    }
    const ranked = entries.map(({doc, title, blocks}) => {
      const titleScore = score(intersect(words, title)) * 1.55;
      const best = blocks.map(block => {
        const matchedWords = intersect(words, block.terms);
        return {text: block.text, hits: matchedWords.length,
                score: score(matchedWords) / (0.9 + 0.18 * Math.log1p(block.terms.size))};
      }).sort((a, b) => b.score - a.score)[0];
      return {doc, best, score: (titleScore + best.score) * (doc.kind === 'recital' ? 0.76 : 1)};
    }).sort((a, b) => b.score - a.score);
    const top = ranked[0];
    if (top.best.hits < 2 || top.score < 4) {
      return {kind: 'abstain', reason: 'I did not find enough matching evidence. Try naming a specific practice, obligation, or article.', evidence: []};
    }
    const evidence = ranked.filter(row => row.best.hits >= 2 && row.score >= top.score * 0.66).slice(0, 3)
      .map(({doc, best}) => citation(doc, ['art_113', 'art_111'].includes(doc.id) ? doc.blocks.join('\n\n') : best.text));
    return {kind: 'matches', evidence};
  }

  return {ask, documents};
}
