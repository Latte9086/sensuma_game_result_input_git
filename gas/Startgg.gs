/**
 * start.gg reporting. API credentials stay in script properties.
 * Searches use the imported spreadsheet data.
 */
const SET_COLUMNS = ['対戦ID', 'フェーズ', 'プール', 'ラウンド', '選手1', '選手2', '台', '状態', '対戦データ'];
const HISTORY_COLUMNS = [
  '報告ID', '受付順', '受付時刻', '対戦ID', '出場者ID', '状態', '試行回数',
  '開始時刻', '更新時刻', '詳細', '変更前', '報告内容', '反映後',
  '変更前スコア', '報告スコア', '反映後スコア', '選手1', '選手2', '報告の勝者', 'QRの台',
];
const ATTEMPT_COLUMNS = ['時刻', '報告ID', '対戦ID', '状態', '詳細'];
const BACKUP_COLUMNS = ['記録時刻', '変更前後', '訂正対象ID', '対戦ID', '対戦結果'];
const SET_FIELDS = `
  id state round fullRoundText bestOf winnerId displayScore completedAt
  phaseGroup { displayIdentifier phase { name } }
  station { number }
  slots { entrant { id name } standing { stats { score { value } } } }
`;
const GAME_FIELDS = `
  games {
    orderNum winnerId entrant1Score entrant2Score
    stage { id name }
    selections { entrant { id } character { id name } }
  }
`;
const REPORT_STATES = {
  queued: '反映待ち', working: '反映中', applied: '反映済み', failed: '要対応', blocked: '報告不可',
};

function startggConfig() {
  const properties = PropertiesService.getScriptProperties();
  const slug = (properties.getProperty('STARTGG_EVENT_SLUG') || '')
    .trim().replace(/^https:\/\/(?:www\.)?start\.gg\//, '').split(/[?#]/)[0]
    .replace(/\/(?:overview|brackets)(?:\/.*)?$/, '').replace(/\/$/, '');
  return {
    properties, slug, token: properties.getProperty('STARTGG_API_TOKEN'),
    enabled: properties.getProperty('STARTGG_REPORTING_ENABLED') === 'true',
    blocked: (properties.getProperty('STARTGG_BLOCKED_SET_IDS') || '').split(/[\s,]+/),
    rounds: JSON.parse(properties.getProperty('STARTGG_BEST_OF_BY_ROUND') || '{}'),
  };
}

function withReportLock(work, wait = 10000) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(wait)) throw new Error('処理が混み合っています。少し待って再試行してください。');
  try {
    const result = work();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function grid(spreadsheet, name, headers) {
  return prepareSheet(spreadsheet, name, headers, headers.length);
}

function rows(sheet, width, start = 1) {
  const count = sheet ? sheet.getLastRow() - 1 : 0;
  return count > 0 ? sheet.getRange(2, start, count, width).getValues() : [];
}

function startggQuery(config, query, variables) {
  if (!config.token || !/^(?:\d+|tournament\/[^/]+\/event\/[^/]+)$/.test(config.slug)) {
    throw new Error('start.gg のイベントと API トークンを設定してください。');
  }
  withReportLock(() => {
    const now = Date.now();
    const timestamps = JSON.parse(config.properties.getProperty('STARTGG_REQUEST_TIMES') || '[]')
      .filter((time) => now - time < 60000);
    if (timestamps.length >= 60) {
      const error = new Error('start.gg の呼び出し枠が空くまで待機します。');
      error.deferred = true;
      throw error;
    }
    timestamps.push(now);
    config.properties.setProperty('STARTGG_REQUEST_TIMES', JSON.stringify(timestamps));
  });
  const response = UrlFetchApp.fetch('https://api.start.gg/gql/alpha', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + config.token },
    payload: JSON.stringify({ query, variables }),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const data = JSON.parse(response.getContentText());
  if (status !== 200 || data.errors?.length || !data.data) {
    const detail = String(data.errors?.[0]?.message || data.message || '').slice(0, 300);
    const error = new Error('start.gg HTTP ' + status + (detail ? ' / ' + detail : ''));
    error.retryable = status === 429 || status >= 500 || /rate.limit/i.test(detail);
    error.deferred = /rate.limit/i.test(detail) || status === 429;
    throw error;
  }
  return data.data;
}

function setSummary(set, config) {
  const round = set.fullRoundText || String(set.round);
  const phase = set.phaseGroup?.phase?.name || '';
  const override = config.rounds[phase + '/' + round] ?? config.rounds[round];
  const bestOf = override ?? ([3, 5].includes(set.bestOf) ? set.bestOf : 5);
  if (![3, 5].includes(bestOf)) throw new Error('BO3 または BO5 を設定してください。');
  const players = (set.slots || []).map((slot) => slot?.entrant
    ? { id: String(slot.entrant.id), name: slot.entrant.name } : null);
  const id = String(set.id);
  const winnerId = set.winnerId == null ? '' : String(set.winnerId);
  const completed = set.state === 3 || Boolean(set.completedAt || winnerId);
  const isDq = (set.slots || []).some((slot) => slot?.standing?.stats?.score?.value < 0) ||
    /\bDQ\b/i.test(set.displayScore || '');
  let unavailable = '';
  if (!/^\d+$/.test(id) || players.length !== 2 || players.some((player) => !player)) {
    unavailable = '対戦相手・対戦枠がまだ確定していません。';
  } else if (isDq || ![1, 2, 3, 4, 6, 7].includes(set.state) || (completed && !winnerId)) {
    unavailable = 'この対戦は選手から報告できません。';
  }
  return {
    id, round, phase, pool: set.phaseGroup?.displayIdentifier || '', players, bestOf,
    side: set.round < 0 ? 'Losers' : 'Winners',
    station: set.station?.number ?? null, winnerId, completed, score: set.displayScore || '', unavailable,
  };
}

function reportUnavailable(set, config) {
  if (!config.enabled) return '現在、選手からの結果報告を停止しています。';
  if (config.blocked.includes(set.id)) return 'この対戦の結果は進行本部に報告してください。';
  return set.unavailable;
}

function startggSync() {
  const config = startggConfig();
  const sets = [];
  const ids = new Set();
  let eventId;
  const byId = /^\d+$/.test(config.slug);
  const selector = byId ? 'id' : 'slug';
  const selectorType = byId ? 'ID' : 'String';
  for (let page = 1, pages = 1; page <= pages; page++) {
    const { event } = startggQuery(config, `query ImportSets($event: ${selectorType}!, $page: Int!) {
      event(${selector}: $event) {
        id videogame { id }
        sets(page: $page, perPage: 30, sortType: STANDARD, filters: {showByes: false}) {
          pageInfo { totalPages }
          nodes { ${SET_FIELDS} }
        }
      }
    }`, { event: config.slug, page });
    if (!event?.sets || String(event.videogame?.id) !== '1386') {
      throw new Error('スマブラSP のイベントを取得できません。イベント URL を確認してください。');
    }
    eventId = String(event.id);
    pages = event.sets.pageInfo.totalPages;
    for (const set of event.sets.nodes) {
      if (!set || ids.has(String(set.id))) continue;
      ids.add(String(set.id));
      sets.push(setSummary(set, config));
    }
  }
  const spreadsheet = resultSpreadsheet();
  withReportLock(() => {
    if (startggConfig().slug !== config.slug) return;
    const sheet = grid(spreadsheet, '対戦取込', SET_COLUMNS);
    const oldLength = Math.max(0, sheet.getLastRow() - 1);
    const updated = sets.map((set) => [
      set.id, safeCell(set.phase), safeCell(set.pool), safeCell(set.round),
      safeCell(set.players[0]?.name || ''), safeCell(set.players[1]?.name || ''),
      set.station ?? '', set.score ? safeCell(set.score) : '', JSON.stringify(set),
    ]);
    if (updated.length) sheet.getRange(2, 1, updated.length, SET_COLUMNS.length).setValues(updated);
    if (oldLength > updated.length) {
      sheet.getRange(2 + updated.length, 1, oldLength - updated.length, SET_COLUMNS.length).clearContent();
    }
    config.properties.setProperty('STARTGG_IMPORTED_SLUG', config.slug);
    config.properties.setProperty('STARTGG_IMPORTED_EVENT_ID', eventId);
    config.properties.setProperty('STARTGG_SYNC_TIME', String(Date.now()));
  });
}

function normalizeLookup(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function findCandidates(sets, first, second, side, round, { firstId, secondId, exactRound } = {}) {
  const p1 = normalizeLookup(first);
  const p2 = normalizeLookup(second);
  const roundText = normalizeLookup(round);
  if (!p1 || !p2) return [];
  return sets.filter((set) => {
    const [a, b] = set.players;
    const matchesFirst = (player) => firstId ? player?.id === firstId : normalizeLookup(player?.name).includes(p1);
    const matchesSecond = (player) => secondId ? player?.id === secondId : normalizeLookup(player?.name).includes(p2);
    const matchesRound = !roundText || (exactRound ? set.round === round : normalizeLookup(set.round).includes(roundText));
    return (!side || set.side === side) && matchesRound &&
      ((matchesFirst(a) && matchesSecond(b)) || (matchesFirst(b) && matchesSecond(a)));
  });
}

function cachedSets(spreadsheet, config) {
  if (config.properties.getProperty('STARTGG_IMPORTED_SLUG') !== config.slug) return [];
  return rows(spreadsheet.getSheetByName('対戦取込'), 1, SET_COLUMNS.length).map(([value]) => JSON.parse(value));
}

function startggSearchOptions() {
  const config = startggConfig();
  if (!config.slug || config.properties.getProperty('STARTGG_IMPORTED_SLUG') !== config.slug) {
    return { status: 'error', message: '対戦データを準備中です。進行本部に確認してください。' };
  }
  return { status: 'ok', ...buildSearchOptions(cachedSets(resultSpreadsheet(), config)) };
}

function buildSearchOptions(sets) {
  const entrants = new Map();
  const rounds = new Map();
  for (const set of sets) {
    for (const player of set.players) {
      if (player) entrants.set(player.id, player);
    }
    rounds.set(set.side + '/' + set.round, { side: set.side, name: set.round });
  }
  return { entrants: Array.from(entrants.values()), rounds: Array.from(rounds.values()) };
}

function matchesSelectedEntrants(set, ids, round) {
  const [first, second] = set.players.map((player) => player?.id);
  return (!round || set.round === round) &&
    ((first === ids[0] && second === ids[1]) || (first === ids[1] && second === ids[0]));
}

function searchStartggMatches(payload) {
  const ids = payload.entrantIds;
  const selected = Array.isArray(ids) && ids.length === 2 && ids[0] !== ids[1] &&
    ids.every((id) => typeof id === 'string' && /^\d+$/.test(id));
  if ((ids !== undefined ? !selected : !isText(payload.first, 80) || !isText(payload.second, 80)) ||
      (payload.side && !['Winners', 'Losers'].includes(payload.side)) ||
      (payload.round && !isText(payload.round, 80))) {
    return { status: 'error', message: '選手名やラウンドを確認してください。' };
  }
  const config = startggConfig();
  const spreadsheet = resultSpreadsheet();
  if (!config.slug || config.properties.getProperty('STARTGG_IMPORTED_SLUG') !== config.slug) {
    return { status: 'error', message: '対戦データを準備中です。進行本部に確認してください。' };
  }
  const sets = cachedSets(spreadsheet, config);
  const matches = selected
    ? sets.filter((set) => (!payload.side || set.side === payload.side) && matchesSelectedEntrants(set, ids, payload.round))
    : findCandidates(sets, payload.first, payload.second, payload.side, payload.round, payload);
  return {
    status: 'ok', total: matches.length,
    matches: matches.slice(0, 30).map((match) => ({ ...match, unavailable: reportUnavailable(match, config) })),
  };
}


function intakeStartggReport(payload) {
  if (!validId(payload.reportId) || !/^\d+$/.test(payload.setId || '') ||
      !Array.isArray(payload.entrantIds) || payload.entrantIds.length !== 2 ||
      !payload.entrantIds.every((id) => typeof id === 'string' && /^\d+$/.test(id))) {
    return { status: 'rejected', message: '対戦情報を確認してください。' };
  }
  const games = Array.isArray(payload.games) ? payload.games.map((game) => game && ({
    gameNumber: game.gameNumber, p1Fighter: game.p1Fighter, p2Fighter: game.p2Fighter,
    stage: game.stage, winner: game.winner,
  })) : null;
  const config = startggConfig();
  const spreadsheet = resultSpreadsheet();
  return withReportLock(() => {
    const journal = grid(spreadsheet, '報告履歴', HISTORY_COLUMNS);
    const previous = historyEntry(journal, payload.reportId);
    if (previous) {
      const original = JSON.parse(previous.values[11]);
      if (original.setId === payload.setId &&
          original.entrantIds.join() === payload.entrantIds.join() &&
          JSON.stringify(original.games) === JSON.stringify(games)) return receiptStatus(previous.values);
      return { status: 'rejected', message: '報告IDが重複しています。' };
    }

    const match = cachedSets(spreadsheet, config).find(({ id }) => id === payload.setId);
    if (!match || match.players.map((player) => player?.id).join() !== payload.entrantIds.join()) {
      return { status: 'rejected', message: '対戦情報が変わりました。対戦を検索し直してください。' };
    }
    const unavailable = reportUnavailable(match, config);
    if (unavailable) return { status: 'rejected', message: unavailable };
    const report = {
      setId: match.id, entrantIds: payload.entrantIds,
      eventId: config.properties.getProperty('STARTGG_IMPORTED_EVENT_ID'),
      eventSlug: config.slug, qrStation: Number.isInteger(payload.station) && payload.station > 0 && payload.station <= 25 ? payload.station : null,
      player1: match.players[0].name, player2: match.players[1].name,
      bracketSide: match.side, round: match.round, bestOf: match.bestOf,
      games,
    };
    const problem = validate({ ...report, reportId: payload.reportId, correctionKey: payload.reportId });
    if (problem) return { status: 'rejected', message: problem };

    const time = new Date();
    const sequence = Number(config.properties.getProperty('STARTGG_REPORT_SEQ') || '0') + 1;
    config.properties.setProperty('STARTGG_REPORT_SEQ', String(sequence));
    writeStartggGames(spreadsheet, payload.reportId, report, time);
    const firstWins = games.filter((game) => game.winner === 'P1').length;
    const secondWins = games.length - firstWins;
    journal.appendRow([
      payload.reportId, sequence, time, report.setId, '', REPORT_STATES.queued, 0,
      '', time, '', '', JSON.stringify(report), '',
      '', firstWins + '–' + secondWins, '', safeCell(report.player1), safeCell(report.player2),
      safeCell(firstWins > secondWins ? report.player1 : report.player2), report.qrStation ?? '',
    ]);
    return { status: 'ok', state: 'queued' };
  });
}

function writeStartggGames(spreadsheet, reportId, report, time) {
  const games = prepareSheet(spreadsheet, 'Games', GAME_HEADERS, 12);
  const existing = reportRows(games, 13, reportId);
  if (existing.length) {
    games.getRangeList(existing.map((row) => 'A' + row + ':M' + row)).clearContent();
  }
  const start = games.getLastRow() + 1;
  const detail = report.games.map((game) => [
    false, time, report.bracketSide, safeCell(report.round), safeCell(report.player1), safeCell(report.player2),
    game.gameNumber, safeCell(game.p1Fighter), safeCell(game.p2Fighter), safeCell(game.stage), game.winner,
    safeCell(game.winner === 'P1' ? report.player1 : report.player2), reportId,
  ]);
  games.getRange(start, 1, detail.length, GAME_HEADERS.length).setValues(detail);
  games.getRange(start, 1, detail.length, 1).insertCheckboxes();
}

function historyEntry(sheet, reportId) {
  if (!sheet) return null;
  const [row] = reportRows(sheet, 1, reportId);
  if (!row) return null;
  const values = sheet.getRange(row, 1, 1, HISTORY_COLUMNS.length).getValues()[0];
  return { row, values, id: String(values[0]), setId: String(values[3]) };
}

function receiptStatus(values) {
  const state = Object.keys(REPORT_STATES).find((key) => REPORT_STATES[key] === values[5]);
  const message = state === 'blocked' ? values[9] : '';
  return { status: 'ok', state, message };
}

function startggReceipt(reportId, kick) {
  if (!validId(reportId)) return { status: 'error' };
  const sheet = resultSpreadsheet().getSheetByName('報告履歴');
  let entry = historyEntry(sheet, reportId);
  if (entry && kick === true && entry.values[5] === REPORT_STATES.queued && entry.values[6] === 0) {
    runStartggQueue(3, 8000);
    entry = historyEntry(sheet, reportId);
  }
  return entry ? receiptStatus(entry.values) : { status: 'error' };
}

function nameKey(value) {
  return normalizeLookup(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
}

function startggCatalog(config) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('startgg-ultimate-catalog-v1');
  if (cached) return JSON.parse(cached);
  const { videogame } = startggQuery(config, `query UltimateCatalog {
    videogame(id: 1386) { characters { id name } stages { id name } }
  }`, {});
  if (!videogame?.characters?.length || !videogame?.stages?.length) {
    throw new Error('start.gg のファイター・ステージ一覧を取得できません。');
  }
  cache.put('startgg-ultimate-catalog-v1', JSON.stringify(videogame), 21600);
  return videogame;
}

function catalogId(items, name, alternate) {
  const key = nameKey(name);
  const matches = items.filter((item) => nameKey(item.name) === key);
  if (matches.length === 1) return String(matches[0].id);
  if (matches.length === 0 && alternate) return catalogId(items, alternate);
  throw new Error('start.gg の ID を特定できません / ' + name);
}

function startggGameInputs(report, catalog) {
  const [firstId, secondId] = report.entrantIds;
  const aliases = {
    'Simon Belmont': 'Simon', 'Rosalina': 'Rosalina & Luma', 'Pyra & Mythra': 'Pyra/Mythra',
    'Steve': 'Steve / Alex', 'Olimar': 'Olimar / Alph', 'Byleth': 'Byleth (Male)',
  };
  return report.games.map((game) => ({
    winnerId: game.winner === 'P1' ? firstId : secondId,
    gameNum: game.gameNumber,
    stageId: catalogId(catalog.stages, game.stage),
    selections: [
      { entrantId: firstId, characterId: catalogId(catalog.characters, game.p1Fighter, aliases[game.p1Fighter]) },
      { entrantId: secondId, characterId: catalogId(catalog.characters, game.p2Fighter, aliases[game.p2Fighter]) },
    ],
  }));
}

function startggReadSet(config, setId) {
  const { set } = startggQuery(config, `query ResultSet($id: ID!) {
    set(id: $id) { ${SET_FIELDS} event { id } ${GAME_FIELDS} }
  }`, { id: setId });
  if (!set) throw new Error('start.gg の対戦が見つかりません。');
  return set;
}

function resultSnapshot(set, config) {
  const { id, phase, pool, round, station, bestOf, players, winnerId, score, completed } = setSummary(set, config);
  return { id, phase, pool, round, station, bestOf, players, winnerId, score, completed, games: set.games || [] };
}

function gamesMatch(set, expected) {
  return set.games?.length === expected.length && expected.every((input) => {
    const game = set.games.find((entry) => entry.orderNum === input.gameNum);
    return game && String(game.winnerId) === input.winnerId && String(game.stage?.id) === input.stageId &&
      input.selections.every((selection) => game.selections?.some((actual) =>
        String(actual.entrant?.id) === selection.entrantId && String(actual.character?.id) === selection.characterId));
  });
}

function processStartggReport(config, spreadsheet, entry) {
  const report = JSON.parse(entry.values[11]);
  if (report.eventSlug !== config.slug) return { state: 'blocked', detail: '対象イベントが変更されました。' };
  const set = startggReadSet(config, report.setId);
  const details = setSummary(set, config);
  const unavailable = reportUnavailable(details, config);
  if (unavailable) return { state: 'blocked', detail: unavailable };
  if (String(set.event?.id) !== report.eventId || details.players.map((player) => player.id).join() !== report.entrantIds.join() ||
      details.bestOf !== report.bestOf) {
    return { state: 'blocked', detail: '対戦情報が変わりました。対戦を検索し直してください。' };
  }
  const winCount = report.games.filter((game) => game.winner === 'P1').length;
  const winnerId = report.entrantIds[winCount > report.games.length / 2 ? 0 : 1];
  if (details.completed && details.winnerId !== winnerId) {
    return { state: 'blocked', detail: '勝者の訂正は進行本部へお越しください。' };
  }
  const games = startggGameInputs(report, startggCatalog(config));
  const before = resultSnapshot(set, config);
  withReportLock(() => {
    const journal = spreadsheet.getSheetByName('報告履歴');
    const current = historyEntry(journal, entry.id);
    if (!current.values[10]) {
      journal.getRange(current.row, 11).setValue(JSON.stringify(before));
      journal.getRange(current.row, 14).setValue(safeCell(before.score));
    }
    // Record the immediate pre-write state even when a previous attempt timed out.
    appendAttempt(spreadsheet, entry, '反映前', JSON.stringify(before));
  });

  if (!details.completed || !gamesMatch(set, games)) {
    if (!startggConfig().enabled || startggConfig().blocked.includes(report.setId)) {
      return { state: 'blocked', detail: '進行本部が結果報告を停止しました。' };
    }
    const operation = details.completed ? 'updateBracketSet' : 'reportBracketSet';
    const data = startggQuery(config, `mutation SubmitResult($setId: ID!, $winnerId: ID!, $gameData: [BracketSetGameDataInput]) {
      ${operation}(setId: $setId, winnerId: $winnerId, gameData: $gameData) { id state }
    }`, { setId: report.setId, winnerId, gameData: games });
    if (!data[operation]) throw new Error('start.gg の更新結果を受け取れませんでした。');
  }
  const confirmed = startggReadSet(config, report.setId);
  if (String(confirmed.winnerId) !== winnerId || !gamesMatch(confirmed, games)) {
    const error = new Error('start.gg の読み戻し結果が報告と一致しません。');
    error.retryable = true;
    throw error;
  }
  return { state: 'applied', after: resultSnapshot(confirmed, config), match: setSummary(confirmed, config) };
}

function appendAttempt(spreadsheet, entry, state, detail) {
  grid(spreadsheet, '反映試行', ATTEMPT_COLUMNS).appendRow([
    new Date(), entry.id, entry.setId, state, safeCell(detail || ''),
  ]);
}

function claimStartggReport(spreadsheet) {
  return withReportLock(() => {
    const journal = spreadsheet.getSheetByName('報告履歴');
    const [next] = rows(journal, HISTORY_COLUMNS.length)
      .filter((row) => [REPORT_STATES.queued, REPORT_STATES.working].includes(row[5]))
      .sort((a, b) => a[1] - b[1]);
    if (!next) return null;
    const entry = historyEntry(journal, String(next[0]));
    entry.values[6]++;
    journal.getRange(entry.row, 6, 1, 4).setValues([[
      REPORT_STATES.working, entry.values[6], new Date(), new Date(),
    ]]);
    appendAttempt(spreadsheet, entry, '反映開始');
    return entry;
  });
}

function finishStartggReport(spreadsheet, entry, outcome) {
  withReportLock(() => {
    const journal = spreadsheet.getSheetByName('報告履歴');
    const current = historyEntry(journal, entry.id);
    appendAttempt(spreadsheet, entry, REPORT_STATES[outcome.state], outcome.detail);
    if (outcome.after) {
      journal.getRange(current.row, 13).setValue(JSON.stringify(outcome.after));
      journal.getRange(current.row, 16).setValue(safeCell(outcome.after.score));
    }
    journal.getRange(current.row, 9, 1, 2).setValues([[new Date(), safeCell(outcome.detail || '')]]);
    journal.getRange(current.row, 6).setValue(REPORT_STATES[outcome.state]);
    if (outcome.match) {
      const sheet = spreadsheet.getSheetByName('対戦取込');
      const [row] = reportRows(sheet, 1, outcome.match.id);
      if (row) sheet.getRange(row, 8, 1, 2).setValues([[safeCell(outcome.match.score), JSON.stringify(outcome.match)]]);
    }
  });
}

function runStartggQueue(maxReports = 20, limitMs = 45000) {
  const config = startggConfig();
  if (!config.slug || !config.token) return false;
  const owner = Utilities.getUuid();
  const acquired = withReportLock(() => {
    const lease = JSON.parse(config.properties.getProperty('STARTGG_QUEUE_LEASE') || 'null');
    if (lease && lease.expires > Date.now()) return false;
    config.properties.setProperty('STARTGG_QUEUE_LEASE', JSON.stringify({ owner, expires: Date.now() + 420000 }));
    return true;
  }, 3000);
  if (!acquired) return false;

  try {
    const spreadsheet = resultSpreadsheet();
    const deadline = Date.now() + limitMs;
    for (let i = 0; i < maxReports && Date.now() < deadline; i++) {
      const entry = claimStartggReport(spreadsheet);
      if (!entry) return true;
      let outcome;
      try {
        outcome = processStartggReport(startggConfig(), spreadsheet, entry);
      } catch (error) {
        const retry = error.deferred || (error.retryable !== false && entry.values[6] < 3);
        outcome = { state: retry ? 'queued' : 'failed', detail: String(error.message || error).slice(0, 500) };
      }
      finishStartggReport(spreadsheet, entry, outcome);
      if (outcome.state === 'queued') return false;
    }
    return false;
  } finally {
    withReportLock(() => {
      const lease = JSON.parse(config.properties.getProperty('STARTGG_QUEUE_LEASE') || 'null');
      if (lease?.owner === owner) config.properties.deleteProperty('STARTGG_QUEUE_LEASE');
    });
  }
}

function startggMinuteJob() {
  const config = startggConfig();
  if (!config.slug || !config.token) return;
  if (runStartggQueue() && Date.now() - Number(config.properties.getProperty('STARTGG_SYNC_TIME') || '0') >= 120000) {
    startggSync();
  }
}

function installStartggMinuteJob() {
  const config = startggConfig();
  if (!config.slug || !config.token) throw new Error('先に start.gg の設定を行ってください。');
  const installed = ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === 'startggMinuteJob');
  if (!installed) ScriptApp.newTrigger('startggMinuteJob').timeBased().everyMinutes(1).create();
  SpreadsheetApp.getUi().alert('結果反映・対戦同期の定期処理を有効にしました。');
}


function saveStartggCorrectionSnapshot() {
  const ui = SpreadsheetApp.getUi();
  const input = ui.prompt('start.gg 結果の控え', '訂正対象の対戦 ID と、前または後を入力（例 123456 前）', ui.ButtonSet.OK_CANCEL);
  if (input.getSelectedButton() !== ui.Button.OK) return;
  const parsed = /^(\d+)\s+(前|後)$/.exec(input.getResponseText().trim());
  if (!parsed) throw new Error('対戦 ID と 前 または 後 を入力してください。');
  const [, id, timing] = parsed;
  const config = startggConfig();
  const spreadsheet = resultSpreadsheet();
  const expectedEvent = config.properties.getProperty('STARTGG_IMPORTED_EVENT_ID');
  const set = startggReadSet(config, id);
  if (String(set.event?.id) !== expectedEvent || config.properties.getProperty('STARTGG_IMPORTED_SLUG') !== config.slug) {
    throw new Error('テストまたは本番の設定済みイベント内の対戦 ID を指定してください。');
  }
  let affectedIds;
  if (timing === '前') {
    const { set: impact } = startggQuery(config, `query AffectedSets($id: ID!) {
      set(id: $id) { resetAffectedData { affectedSetCount affectedSets { id } } }
    }`, { id });
    const affected = impact?.resetAffectedData;
    if (!affected || affected.affectedSetCount !== (affected.affectedSets || []).length) {
      throw new Error('影響する対戦をすべて取得できません。start.gg で影響範囲を確認してください。');
    }
    affectedIds = [...new Set((affected.affectedSets || []).map((entry) => String(entry.id)))];
  } else {
    const previous = rows(spreadsheet.getSheetByName('本部訂正履歴'), BACKUP_COLUMNS.length)
      .filter((row) => row[1] === '前' && String(row[2]) === id).reverse();
    const stamped = previous[0]?.[0]?.getTime();
    if (!stamped) throw new Error('変更前の控えを先に保存してください。');
    affectedIds = previous.filter((row) => row[0].getTime() === stamped).map((row) => String(row[3]));
  }
  const snapshots = [resultSnapshot(set, config)];
  for (const affectedId of affectedIds) {
    if (affectedId !== id) snapshots.push(resultSnapshot(startggReadSet(config, affectedId), config));
  }
  withReportLock(() => {
    const sheet = grid(spreadsheet, '本部訂正履歴', BACKUP_COLUMNS);
    const now = new Date();
    const values = snapshots.map((entry) => [now, timing, id, entry.id, JSON.stringify(entry)]);
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, BACKUP_COLUMNS.length).setValues(values);
  });
  ui.alert(snapshots.length + '件の対戦を本部訂正履歴に保存しました。');
}


function retrySelectedStartggReport() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  const ui = SpreadsheetApp.getUi();
  if (sheet.getName() !== '報告履歴' || row < 2) {
    ui.alert('報告履歴の「要対応」の行を選んでください。');
    return;
  }
  const message = withReportLock(() => {
    const entry = sheet.getRange(row, 1, 1, HISTORY_COLUMNS.length).getValues()[0];
    if (entry[5] !== REPORT_STATES.failed) return '「要対応」の行を選んでください。';
    const newer = rows(sheet, HISTORY_COLUMNS.length).some((values) =>
      values[1] > entry[1] && String(values[3]) === String(entry[3]) && values[5] !== REPORT_STATES.blocked);
    if (newer) return '同じ対戦に新しい報告があります。最新の報告の状態を確認してください。';
    appendAttempt(resultSpreadsheet(), { id: entry[0], setId: String(entry[3]) }, '本部が再試行を登録');
    sheet.getRange(row, 6, 1, 5).setValues([[REPORT_STATES.queued, 0, '', new Date(), '']]);
    return '反映を再試行します。';
  });
  ui.alert(message);
}
