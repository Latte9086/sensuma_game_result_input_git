/**
 * スプレッドシートに紐づく Apps Script。設定手順は README.md を参照。
 */
const MATCH_HEADERS = [
  '反映済', '受信時刻', 'サイド', 'ラウンド', 'Player 1', 'スコア',
  'Player 2', 'セット勝者', 'ゲーム数', '詳細内訳', '報告ID', '訂正元ID',
  '報告状況', 'BO', '訂正キーのハッシュ', '内容のハッシュ', 'ゲーム保存済', 'Discord',
];
const GAME_HEADERS = [
  '確認済', '受信時刻', 'サイド', 'ラウンド', 'Player 1', 'Player 2',
  'Game番号', 'P1ファイター', 'P2ファイター', 'ステージ', 'Game勝者(側)',
  'Game勝者名', '報告ID',
];
const COL = {
  reflected: 1, details: 10, id: 11, original: 12, status: 13,
  keyHash: 15, contentHash: 16, gamesSaved: 17, notification: 18,
};
const STATUS = {
  newReport: '受付済', pending: '訂正确認待ち', superseded: '訂正済',
  accepted: '訂正承認済', declined: '訂正却下',
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('千スマ')
    .addItem('このシートを保存先に設定', 'configureSpreadsheet')
    .addSeparator()
    .addItem('選択した訂正を承認', 'approveCorrection')
    .addItem('選択した訂正を却下', 'declineCorrection')
    .addToUi();
}

function configureSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('RESULT_SPREADSHEET_ID', spreadsheet.getId());
  SpreadsheetApp.getUi().alert('このスプレッドシートを結果の保存先に設定しました。');
}

function resultSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('RESULT_SPREADSHEET_ID');
  if (!id) throw new Error('結果の保存先が未設定です。');
  return SpreadsheetApp.openById(id);
}

function doGet() {
  return json({ service: 'sensuma-results', version: 2 });
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch {
    return json({ status: 'rejected', message: '報告形式が不正です。' });
  }

  const reportId = payload && payload.reportId;
  const problem = validate(payload);
  if (problem) return json({ status: 'rejected', reportId, message: problem });

  const lock = LockService.getScriptLock();
  let saved;
  try {
    lock.waitLock(10000);
    saved = saveReport(payload);
    SpreadsheetApp.flush();
  } catch (error) {
    console.error(String(error));
    return json({ status: 'error', reportId, message: 'シートへの保存を確認できませんでした。' });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }

  if (saved.message) return json({ status: 'rejected', reportId, message: saved.message });

  if (saved.notify) {
    try {
      const notification = notifyDiscord(payload, saved);
      updateNotification(reportId, notification);
    } catch (error) {
      console.error(String(error));
    }
  }
  return json({ status: 'ok', reportId });
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function isText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= maxLength && !/[\r\n]/.test(value);
}

function validate(payload) {
  if (!payload || !validId(payload.reportId) || !validId(payload.correctionKey) ||
      (payload.correctionOf !== undefined && !validId(payload.correctionOf))) {
    return '報告IDが不正です。';
  }
  if (!['Winners', 'Losers'].includes(payload.bracketSide) || !isText(payload.round, 80) ||
      !isText(payload.player1, 80) || !isText(payload.player2, 80)) {
    return 'サイド、ラウンド、選手名を確認してください。';
  }
  const games = payload.games;
  const target = (payload.bestOf + 1) / 2;
  if (![3, 5].includes(payload.bestOf) || !Array.isArray(games) ||
      games.length < target || games.length > payload.bestOf) {
    return '対戦形式とゲーム数を確認してください。';
  }
  const wins = { P1: 0, P2: 0 };
  for (const [index, entry] of games.entries()) {
    if (!entry || entry.gameNumber !== index + 1 || !['P1', 'P2'].includes(entry.winner) ||
        !isText(entry.p1Fighter, 80) || !isText(entry.p2Fighter, 80) || !isText(entry.stage, 80)) {
      return '各ゲームのファイター、ステージ、勝者を確認してください。';
    }
    if (++wins[entry.winner] === target && index !== games.length - 1) {
      return 'セットが決着した後のゲームが含まれています。';
    }
  }
  return Math.max(wins.P1, wins.P2) === target ? '' : '先取本数に達していません。';
}

function digest(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value));
}

function safeCell(value) {
  return /^[=+@-]/.test(value) ? "'" + value : value;
}

function prepareSheet(spreadsheet, name, headers, legacyLength) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#e0f2fe').setFontColor('#334155').setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, legacyLength + 1).isBlank()) {
    const added = headers.slice(legacyLength);
    sheet.getRange(1, legacyLength + 1, 1, added.length).setValues([added])
      .setBackground('#e0f2fe').setFontColor('#334155').setFontWeight('bold');
  }
  if (name === 'Matches' && !sheet.isColumnHiddenByUser(COL.keyHash)) {
    sheet.hideColumns(COL.keyHash, 3);
  }
  return sheet;
}

function reportRows(sheet, idColumn, reportId) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1)
    .createTextFinder(reportId).matchEntireCell(true).findAll().map(cell => cell.getRow());
}

function readOriginal(matches, payload, keyHash) {
  const [row] = reportRows(matches, COL.id, payload.correctionOf);
  if (!row) return { message: '元の報告が見つかりません。スタッフに報告IDを伝えてください。' };
  const values = matches.getRange(row, 1, 1, MATCH_HEADERS.length).getValues()[0];
  if (values[COL.keyHash - 1] !== keyHash || values[COL.gamesSaved - 1] !== true ||
      [STATUS.superseded, STATUS.declined].includes(values[COL.status - 1])) {
    return { message: 'この報告は訂正できません。スタッフに報告IDを伝えてください。' };
  }
  return { row, summary: values.slice(2, 8).join(' ｜ ') };
}

function saveReport(payload) {
  const spreadsheet = resultSpreadsheet();
  const matches = prepareSheet(spreadsheet, 'Matches', MATCH_HEADERS, 10);
  const games = prepareSheet(spreadsheet, 'Games', GAME_HEADERS, 12);
  const keyHash = digest(payload.correctionKey);
  const contentHash = digest(JSON.stringify(payload));
  let [row] = reportRows(matches, COL.id, payload.reportId);
  const prior = row ? matches.getRange(row, 1, 1, MATCH_HEADERS.length).getValues()[0] : null;

  if (prior && prior[COL.contentHash - 1] !== contentHash) {
    return { message: '同じ報告IDに異なる内容があります。スタッフに確認してください。' };
  }
  if (prior && prior[COL.gamesSaved - 1] === true) return { notify: false };

  const original = payload.correctionOf ? readOriginal(matches, payload, keyHash) : null;
  if (!prior && original && original.message) return original;

  const time = prior ? prior[1] : new Date();
  const p1 = payload.games.filter(entry => entry.winner === 'P1').length;
  const p2 = payload.games.length - p1;
  const winner = p1 > p2 ? payload.player1 : payload.player2;
  const score = p1 + '–' + p2;
  const names = [safeCell(payload.player1), safeCell(payload.player2)];
  if (!row) {
    row = matches.getLastRow() + 1;
    matches.getRange(row, 1, 1, MATCH_HEADERS.length).setValues([[
      false, time, payload.bracketSide, safeCell(payload.round), names[0], score, names[1],
      safeCell(winner), payload.games.length, '', payload.reportId, payload.correctionOf || '',
      '保存処理中', payload.bestOf,
      keyHash, contentHash, false, '処理中',
    ]]);
  }
  matches.getRange(row, COL.reflected).insertCheckboxes();

  // An interrupted write can leave detail rows behind. Rebuild only this report's rows.
  const existingRows = reportRows(games, 13, payload.reportId);
  if (existingRows.length) {
    games.getRangeList(existingRows.map(index => 'A' + index + ':M' + index)).clearContent();
  }
  const gameStart = games.getLastRow() + 1;
  const detail = payload.games.map(entry => [
    false, time, payload.bracketSide, safeCell(payload.round), names[0], names[1], entry.gameNumber,
    safeCell(entry.p1Fighter), safeCell(entry.p2Fighter), safeCell(entry.stage), entry.winner,
    names[entry.winner === 'P1' ? 0 : 1], payload.reportId,
  ]);
  games.getRange(gameStart, 1, detail.length, GAME_HEADERS.length).setValues(detail);
  games.getRange(gameStart, 1, detail.length, 1).insertCheckboxes();

  const link = spreadsheet.getUrl() + '#gid=' + games.getSheetId() +
    '&range=A' + gameStart + ':M' + (gameStart + detail.length - 1);
  matches.getRange(row, COL.details).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText('ゲーム内訳を開く').setLinkUrl(link).build()
  );
  SpreadsheetApp.flush();
  matches.getRange(row, COL.status, 1, 5).setValues([[
    payload.correctionOf ? STATUS.pending : STATUS.newReport, payload.bestOf, keyHash, contentHash, true,
  ]]);
  return {
    notify: true, winner, score,
    originalSummary: original ? original.summary : '',
    link: spreadsheet.getUrl() + '#gid=' + matches.getSheetId() + '&range=A' + row,
  };
}

function notifyDiscord(payload, saved) {
  const webhook = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK_URL');
  if (!webhook) return '未設定';

  const clean = text => text.replace(/[\\`*_{}\[\]()<>#+!|~]/g, '\\$&');
  const position = payload.bracketSide + ' ' + clean(payload.round);
  const result = clean(payload.player1) + ' ' + saved.score + ' ' + clean(payload.player2);
  const correction = payload.correctionOf ? '訂正确認待ち｜' : '';
  const description = '**' + result + '**\n' + clean(saved.winner) + ' 勝利' +
    (payload.correctionOf ? '\n訂正元ID: ' + payload.correctionOf : '') +
    (saved.originalSummary ? '\n訂正前: ' + clean(saved.originalSummary) : '');

  try {
    const response = UrlFetchApp.fetch(webhook, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        username: '千スマ 結果報告',
        allowed_mentions: { parse: [] },
        embeds: [{
          title: correction + position,
          description,
          color: 8231918,
          url: saved.link,
          footer: { text: '報告ID ' + payload.reportId },
        }],
      }),
    });
    const status = response.getResponseCode();
    return status >= 200 && status < 300 ? '通知済' : '通知失敗 (HTTP ' + status + ')';
  } catch {
    return '通知失敗';
  }
}

function updateNotification(reportId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = resultSpreadsheet().getSheetByName('Matches');
    const [row] = reportRows(sheet, COL.id, reportId);
    if (row) sheet.getRange(row, COL.notification).setValue(status);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function approveCorrection() {
  resolveSelectedCorrection(true);
}

function declineCorrection() {
  resolveSelectedCorrection(false);
}

function resolveSelectedCorrection(approve) {
  const ui = SpreadsheetApp.getUi();
  const matches = SpreadsheetApp.getActiveSheet();
  const row = matches.getActiveCell().getRow();
  if (matches.getName() !== 'Matches' || row < 2) {
    ui.alert('Matches シートで訂正の行を選んでください。');
    return;
  }
  const lock = LockService.getScriptLock();
  let message;
  try {
    lock.waitLock(10000);
    message = resolveCorrection(matches, row, approve);
    SpreadsheetApp.flush();
  } catch (error) {
    console.error(String(error));
    message = '更新を確認できませんでした。元の行と訂正行の状態を確認してください。';
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
  ui.alert(message);
}

function resolveCorrection(matches, row, approve) {
  const values = matches.getRange(row, 1, 1, MATCH_HEADERS.length).getValues()[0];
  if (values[COL.status - 1] !== STATUS.pending || values[COL.gamesSaved - 1] !== true) {
    return '保存済みで確認待ちの訂正を選んでください。';
  }

  if (!approve) {
    matches.getRange(row, COL.status).setValue(STATUS.declined);
    return '訂正を却下しました。';
  }

  const [originalRow] = reportRows(matches, COL.id, values[COL.original - 1]);
  if (!originalRow) return '元の報告が見つかりません。';
  const original = matches.getRange(originalRow, 1, 1, MATCH_HEADERS.length).getValues()[0];
  if (![STATUS.newReport, STATUS.accepted].includes(original[COL.status - 1])) {
    return '元の報告の状態を確認してください。訂正元が確認待ちの場合は先に処理してください。';
  }
  matches.getRange(originalRow, COL.status).setValue(STATUS.superseded);
  matches.getRange(row, COL.status).setValue(STATUS.accepted);
  return original[COL.reflected - 1] === true
    ? '訂正を承認しました。元の結果は反映済みです。訂正後の内容を start.gg に反映してください。'
    : '訂正を承認しました。訂正後の内容を start.gg に反映してください。';
}
