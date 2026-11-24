import assert from 'node:assert/strict';
import test from 'node:test';
import {checkSources, compareSources} from './source-monitor.mjs';

const records = [
  ['consolidation', '02024R1689-20240712'], ['consolidation', '02024R1689-20260727'],
  ['amendment', '32026R1744'],
  ...[1, 2, 3, 4].map(n => ['corrigendum', `32024R1689R(0${n})`]),
];
const response = rows => ({results: {bindings: rows.map(([kind, id]) =>
  ({kind: {value: kind}, id: {value: id}}))}});
const checkedAt = '2026-11-24T06:27:00.000Z';

test('reports newly connected official records once and excludes unrelated consolidations', () => {
  const extra = [['consolidation', '02024R1689-20270101'], ['corrigendum', '32024R1689R(05)']];
  const input = response([...records, ...extra, ...extra, ['consolidation', '02008R0300-20270101']]);
  const result = compareSources(input, checkedAt);
  assert.equal(result.checkedAt, checkedAt);
  assert.deepEqual(result.changes.map(({kind, id}) => [kind, id]), extra);
  assert.ok(result.changes.every(({url}) => new URL(url).hostname === 'eur-lex.europa.eu'));
  assert.deepEqual(compareSources(response(records), checkedAt).changes, []);
});

test('rejects incomplete or failed upstream checks instead of reporting no changes', async () => {
  assert.throws(() => compareSources(response(records.slice(1)), checkedAt), /missing a known record/);
  assert.throws(() => compareSources({}, checkedAt), /Invalid CELLAR/);
  await assert.rejects(checkSources(async () => new Response(null, {status: 503})), /HTTP 503/);
});
