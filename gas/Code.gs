/**
 * Google Apps Script (GAS) 側 受け取り用スクリプト
 *
 * 【新仕様】
 * 1. "Matches" シート: 1マッチ（セット）単位で1行記録。A列にstart.gg反映用チェックボックスを自動挿入。
 * 2. "Games" シート  : 1ゲーム（各試合）単位で1行記録。A列に確認用チェックボックスを自動挿入。
 *
 * 【導入手順】
 * 1. Google スプレッドシートの「拡張機能」>「Apps Script」を開く
 * 2. このコードを貼り付けて保存
 * 3. 「デプロイ」>「新しいデプロイ」> 種類「ウェブアプリ」を選択
 *    - 次のユーザーとして実行: 「自分」
 *    - アクセスできるユーザー: 「全員」
 * 4. 新しく発行されたウェブアプリURL（またはデプロイID）を環境変数やアプリ側に設定
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 日時フォーマット (JST: YYYY/MM/DD HH:mm:ss)
    var timestampStr = Utilities.formatDate(
      new Date(),
      'Asia/Tokyo',
      'yyyy/MM/dd HH:mm:ss'
    );

    // ==========================================
    // 1. Matches シート (1マッチ = 1行)
    // ==========================================
    var matchSheet = ss.getSheetByName('Matches');
    if (!matchSheet) {
      matchSheet = ss.insertSheet('Matches', 0);
      matchSheet.appendRow([
        '反映済',
        '受信時刻',
        'サイド',
        'ラウンド',
        'Player 1',
        'スコア',
        'Player 2',
        'セット勝者',
        'ゲーム数',
        '詳細内訳',
      ]);
      // ヘッダーデザイン装飾
      var mHeader = matchSheet.getRange(1, 1, 1, 10);
      mHeader.setBackground('#111827');
      mHeader.setFontColor('#ffffff');
      mHeader.setFontWeight('bold');
      matchSheet.setFrozenRows(1);
    }

    var matchWinnerName =
      payload.matchWinner === 'P1'
        ? payload.player1
        : payload.matchWinner === 'P2'
        ? payload.player2
        : 'DRAW';

    var games = payload.games || [];

    // ゲーム内訳の要約 (例: "G1:P1, G2:P2, G3:P1")
    var summaryParts = games.map(function (g) {
      return 'G' + g.gameNumber + ':' + (g.winner || '-');
    });
    var gamesSummary = summaryParts.join(', ');

    var scoreDisplay = payload.p1Score + ' - ' + payload.p2Score;

    // Matchesに行を追加
    var matchLastRow = matchSheet.getLastRow() + 1;
    matchSheet.appendRow([
      false, // A列: チェックボックスの初期値(false)
      timestampStr,
      payload.bracketSide,
      payload.round,
      payload.player1,
      scoreDisplay,
      payload.player2,
      matchWinnerName,
      games.length,
      gamesSummary,
    ]);

    // A列をチェックボックス化
    matchSheet.getRange(matchLastRow, 1).insertCheckboxes();

    // ==========================================
    // 2. Games シート (1ゲーム = 1行)
    // ==========================================
    var gameSheet = ss.getSheetByName('Games');
    if (!gameSheet) {
      gameSheet = ss.insertSheet('Games', 1);
      gameSheet.appendRow([
        '確認済',
        '受信時刻',
        'サイド',
        'ラウンド',
        'Player 1',
        'Player 2',
        'Game番号',
        'P1ファイター',
        'P2ファイター',
        'ステージ',
        'Game勝者(側)',
        'Game勝者名',
      ]);
      // ヘッダーデザイン装飾
      var gHeader = gameSheet.getRange(1, 1, 1, 12);
      gHeader.setBackground('#1f2937');
      gHeader.setFontColor('#ffffff');
      gHeader.setFontWeight('bold');
      gameSheet.setFrozenRows(1);
    }

    var startRow = gameSheet.getLastRow() + 1;

    games.forEach(function (g) {
      var gameWinnerName =
        g.winner === 'P1'
          ? payload.player1
          : g.winner === 'P2'
          ? payload.player2
          : '';

      gameSheet.appendRow([
        false, // A列: チェックボックスの初期値(false)
        timestampStr,
        payload.bracketSide,
        payload.round,
        payload.player1,
        payload.player2,
        g.gameNumber,
        g.p1Fighter,
        g.p2Fighter,
        g.stage,
        g.winner,
        gameWinnerName,
      ]);
    });

    // 追加した全ゲーム分の行のA列をチェックボックス化
    var endRow = gameSheet.getLastRow();
    if (endRow >= startRow) {
      gameSheet.getRange(startRow, 1, endRow - startRow + 1, 1).insertCheckboxes();
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        matchesSaved: 1,
        gamesSaved: games.length,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
