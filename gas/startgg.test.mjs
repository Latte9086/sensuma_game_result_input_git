import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = ['Code.gs', 'Startgg.gs'].map((name) => readFileSync(new URL(name, import.meta.url), 'utf8')).join('\n');
const players = [{ id: '11', name: 'Ａlice' }, { id: '22', name: 'Bob' }];
const base = {
  id: '40', state: 1, round: -2, fullRoundText: 'Losers Round 2', bestOf: 3,
  slots: players.map((entrant) => ({ entrant })), event: { id: '20' },
};
const games = ['P1', 'P1'].map((winner, i) => ({
  gameNumber: i + 1, winner, p1Fighter: 'Mario', p2Fighter: 'Kirby', stage: 'Battlefield',
}));
const catalog = {
  characters: [{ id: 1, name: 'Mario' }, { id: 2, name: 'Kirby' }],
  stages: [{ id: 3, name: 'Battlefield' }],
};
const config = { slug: '20', enabled: true, blocked: [], rounds: {} };
const report = {
  setId: '40', eventId: '20', eventSlug: '20', entrantIds: ['11', '22'],
  player1: 'Ａlice', player2: 'Bob', bracketSide: 'Losers', round: 'Losers Round 2', bestOf: 3, games,
};
const plain = (value) => JSON.parse(JSON.stringify(value));

function engine(overrides = {}) {
  const context = createContext({ console, ...overrides });
  runInContext(source, context);
  return context;
}

test('search accepts either name order and narrows by side and round', () => {
  const api = engine();
  const match = api.setSummary(base, config);
  const other = { ...match, id: '41', side: 'Winners', round: 'Winners Round 1' };
  assert.deepEqual(plain(api.findCandidates([match, other], 'bob', 'Alice', 'Losers', 'round 2')), [plain(match)]);
  assert.equal(api.findCandidates([match], 'Bob', '').length, 0);
  assert.match(api.setSummary({ ...base, slots: [base.slots[0], null] }, config).unavailable, /未|確定/);
  assert.match(api.setSummary({ ...base, state: 3, winnerId: '11', displayScore: 'Bob DQ' }, config).unavailable, /報告できません/);
  assert.match(api.reportUnavailable(match, { ...config, blocked: ['40'] }), /進行本部/);
});

test('writes the correct mutation, captures before and checks game data afterward', () => {
  const api = engine();
  const entry = { id: randomUUID(), values: Array(13) };
  entry.values[11] = JSON.stringify(report);
  const inputs = plain(api.startggGameInputs(report, catalog));
  const confirmed = {
    ...base, state: 3, winnerId: 11,
    games: inputs.map((game) => ({
      orderNum: game.gameNum, winnerId: game.winnerId, stage: { id: game.stageId },
      selections: game.selections.map((info) => ({ entrant: { id: info.entrantId }, character: { id: info.characterId } })),
    })),
  };
  api.startggCatalog = () => catalog;
  api.startggConfig = () => config;
  api.withReportLock = (execute) => execute();
  api.historyEntry = () => ({ values: [], row: 2 });
  const before = [];
  api.appendAttempt = () => {};
  const spreadsheet = { getSheetByName: () => ({
    getRange: (_, col) => ({ setValue: (value) => { if (col === 11) before.push(JSON.parse(value)); } }),
  }) };

  for (const [current, operation] of [[base, 'reportBracketSet'], [{ ...base, state: 3, winnerId: 11 }, 'updateBracketSet']]) {
    let reads = 0;
    api.startggReadSet = () => reads++ ? confirmed : current;
    api.startggQuery = (_, query, variables) => {
      assert.match(query, new RegExp(operation + '\\('));
      assert.deepEqual(plain(variables), { setId: '40', winnerId: '11', gameData: inputs });
      return { [operation]: { id: 40 } };
    };
    assert.equal(api.processStartggReport(config, spreadsheet, entry).state, 'applied');
  }
  assert.equal(before[0].winnerId, '');
  assert.equal(before[1].winnerId, '11');
  api.startggReadSet = () => ({ ...base, state: 3, winnerId: 22 });
  api.startggQuery = () => assert.fail('Winner change must never mutate the bracket');
  assert.match(api.processStartggReport(config, spreadsheet, entry).detail, /進行本部/);
  api.startggReadSet = () => confirmed;
  assert.equal(api.processStartggReport(config, spreadsheet, entry).state, 'applied');
});

test('accepts a burst of 25 reports, retains order and deduplicates a retry', () => {
  const data = [];
  const properties = new Map();
  const api = engine();
  api.startggConfig = () => ({
    ...config,
    properties: { getProperty: (key) => key === 'STARTGG_IMPORTED_EVENT_ID' ? '20' : properties.get(key),
      setProperty: (key, value) => properties.set(key, value) },
  });
  api.withReportLock = (execute) => execute();
  api.resultSpreadsheet = () => ({ getSheetByName: () => ({}) });
  api.grid = () => ({ appendRow: (row) => data.push(row) });
  api.historyEntry = (_, id) => {
    const values = data.find((row) => row[0] === id);
    return values ? { values } : null;
  };
  api.cachedSets = () => Array.from({ length: 25 }, (_, index) =>
    api.setSummary({ ...base, id: String(40 + index) }, config));
  api.writeStartggGames = () => {};
  const submissions = Array.from({ length: 25 }, (_, index) => ({ reportId: randomUUID(), setId: String(40 + index),
    entrantIds: ['11', '22'], games }));
  for (const input of submissions) assert.equal(api.intakeStartggReport(input).state, 'queued');
  assert.equal(api.intakeStartggReport(submissions[0]).state, 'queued');
  assert.equal(api.intakeStartggReport({ ...submissions[0], setId: '41' }).status, 'rejected');
  assert.deepEqual(data.map((row) => row[1]), Array.from({ length: 25 }, (_, index) => index + 1));
  assert.ok(data.every((row) => row[4] === ''));
});

test('reopening an existing sheet with its full headers skips column migration', () => {
  const api = engine();
  const sheet = {
    getLastRow: () => 2,
    getRange: () => assert.fail('An existing sheet with a full schema needs no new column range'),
  };
  const spreadsheet = { getSheetByName: () => sheet };
  assert.equal(api.grid(spreadsheet, '対戦取込', ['対戦ID', '対戦データ']), sheet);
});

test('claims the oldest queued report using a numeric sheet width', () => {
  const api = engine();
  const received = [Array(20).fill(''), Array(20).fill('')];
  received[0][0] = 'newer';
  received[0][1] = 2;
  received[1][0] = 'oldest';
  received[1][1] = 1;
  for (const row of received) { row[5] = '反映待ち'; row[6] = 0; }
  api.withReportLock = (work) => work();
  api.historyEntry = (_, id) => ({ id, row: 3, values: received[1] });
  api.appendAttempt = () => {};
  const journal = {
    getLastRow: () => 3,
    getRange: (row, column, count, width) => {
      if (column === 1) {
        assert.equal(width, 20);
        return { getValues: () => received };
      }
      assert.deepEqual([row, column, count, width], [3, 6, 1, 4]);
      return { setValues: (values) => assert.equal(values[0][0], '反映中') };
    },
  };
  assert.equal(api.claimStartggReport({ getSheetByName: () => journal }).id, 'oldest');
});

test('builds selectable entries and rounds and searches by exact entrant IDs and round', () => {
  const api = engine();
  const match = api.setSummary(base, config);
  const alternate = { ...match, id: '41', round: 'Losers Round 20', players: [match.players[0], { id: '33', name: match.players[1].name }] };
  const options = plain(api.buildSearchOptions([match, alternate, match]));
  assert.deepEqual(options.entrants.map(({ id }) => id), ['11', '22', '33']);
  assert.deepEqual(options.rounds.map(({ name }) => name), ['Losers Round 2', 'Losers Round 20']);
  assert.ok(api.matchesSelectedEntrants(match, ['22', '11'], 'Losers Round 2'));
  assert.equal(api.matchesSelectedEntrants(alternate, ['22', '11'], ''), false);
  assert.equal(api.matchesSelectedEntrants(alternate, ['33', '11'], 'Losers Round 2'), false);
});

test('combines an exact entrant selection with a partial name and round', () => {
  const api = engine();
  const match = api.setSummary(base, config);
  const sameName = { ...match, id: '41', players: [{ ...match.players[0], id: '33' }, match.players[1]] };
  const found = api.findCandidates([sameName, match], 'Alice', 'bo', 'Losers', 'round', { firstId: '11' });
  assert.deepEqual(plain(found.map(({ id }) => id)), ['40']);
  assert.equal(api.findCandidates([match], 'Alice', 'bo', 'Losers', 'round', { exactRound: true }).length, 0);
});
