import {pathToFileURL} from 'node:url';

const endpoint = 'https://publications.europa.eu/webapi/rdf/sparql';
const ontology = 'http://publications.europa.eu/ontology/cdm#';
const baseline = {
  consolidation: ['02024R1689-20240712', '02024R1689-20260727'],
  amendment: ['32026R1744'],
  corrigendum: ['32024R1689R(01)', '32024R1689R(02)', '32024R1689R(03)', '32024R1689R(04)'],
};
const query = `
PREFIX cdm: <${ontology}>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?kind ?id WHERE {
  ?base cdm:resource_legal_id_celex "32024R1689"^^xsd:string .
  VALUES (?relation ?kind) {
    (cdm:act_consolidated_based_on_resource_legal "consolidation")
    (cdm:resource_legal_amends_resource_legal "amendment")
    (cdm:resource_legal_corrects_resource_legal "corrigendum")
  }
  ?related ?relation ?base ; cdm:resource_legal_id_celex ?id .
}
`;

export function compareSources(data, checkedAt) {
  const rows = data?.results?.bindings;
  if (!Array.isArray(rows)) throw new Error('Invalid CELLAR metadata response.');
  const found = Object.fromEntries(Object.keys(baseline).map(kind => [kind, new Set()]));
  for (const row of rows) {
    const kind = row.kind?.value;
    const id = row.id?.value;
    if (!Object.hasOwn(found, kind) || typeof id !== 'string' || !/^[0-9][A-Z0-9()\-]{7,30}$/.test(id)) {
      throw new Error('Unexpected CELLAR relation.');
    }
    if (kind !== 'consolidation' || /^02024R1689-\d{8}$/.test(id)) found[kind].add(id);
  }
  for (const [kind, ids] of Object.entries(baseline)) {
    if (!ids.every(id => found[kind].has(id))) throw new Error('CELLAR metadata is missing a known record.');
  }
  const changes = Object.entries(found).flatMap(([kind, ids]) => [...ids].sort()
    .filter(id => !baseline[kind].includes(id))
    .map(id => ({kind, id, url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=${encodeURIComponent('CELEX:' + id)}`})));
  return {checkedAt, changes};
}

export async function checkSources(request = fetch) {
  const url = new URL(endpoint);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'application/sparql-results+json');
  const response = await request(url, {signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`CELLAR returned HTTP ${response.status}.`);
  return compareSources(await response.json(), new Date().toISOString());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await checkSources(), null, 2));
}
