/**
 * Google Apps Script (GAS) 側 受け取り & Discord通知スクリプト
 *
 * 【新機能】
 * 1. スプレッドシート ("Matches" と "Games" 両シート) への自動記録（バックアップ・集計用）
 * 2. 運営用 Discord チャンネルへの即時カード型（Embed）通知
 *
 * 【導入手順】
 * 1. Discord 側で Webhook URL を発行する（後述の手順を参照）
 * 2. 下記の DISCORD_WEBHOOK_URL に発行したURLを貼り付ける
 * 3. スプレッドシートの「拡張機能」>「Apps Script」にこのコードを貼り付けて保存
 * 4. 「デプロイ」>「デプロイを管理」から鉛筆アイコンを押して「新バージョン」でデプロイ
 */

// ▼▼▼ ここに発行した Discord の Webhook URL を貼り付けてください ▼▼▼
var DISCORD_WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 日時フォーマット (JST)
    var timestampStr = Utilities.formatDate(
      new Date(),
      'Asia/Tokyo',
      'yyyy/MM/dd HH:mm:ss'
    );

    var matchWinnerName =
      payload.matchWinner === 'P1'
        ? payload.player1
        : payload.matchWinner === 'P2'
        ? payload.player2
        : 'DRAW';

    var games = payload.games || [];
    var scoreDisplay = payload.p1Score + ' - ' + payload.p2Score;

    // ==========================================
    // 1. スプレッドシート保存: Matches シート
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
      var mHeader = matchSheet.getRange(1, 1, 1, 10);
      mHeader.setBackground('#111827');
      mHeader.setFontColor('#ffffff');
      mHeader.setFontWeight('bold');
      matchSheet.setFrozenRows(1);
    }

    var summaryParts = games.map(function (g) {
      return 'G' + g.gameNumber + ':' + (g.winner || '-');
    });
    var gamesSummary = summaryParts.join(', ');

    var matchLastRow = matchSheet.getLastRow() + 1;
    matchSheet.appendRow([
      false,
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
    matchSheet.getRange(matchLastRow, 1).insertCheckboxes();

    // ==========================================
    // 2. スプレッドシート保存: Games シート
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
        false,
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

    var endRow = gameSheet.getLastRow();
    if (endRow >= startRow) {
      gameSheet.getRange(startRow, 1, endRow - startRow + 1, 1).insertCheckboxes();
    }

    // ==========================================
    // 3. Discord へ Webhook 通知送信
    // ==========================================
    if (
      DISCORD_WEBHOOK_URL &&
      DISCORD_WEBHOOK_URL !== 'YOUR_DISCORD_WEBHOOK_URL_HERE'
    ) {
      sendDiscordNotification(payload, matchWinnerName, scoreDisplay, timestampStr);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'ok',
        matchesSaved: 1,
        gamesSaved: games.length,
        discordNotified: Boolean(DISCORD_WEBHOOK_URL),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Discord へのリッチ通知（Embed形式）生成・送信関数
 */
function sendDiscordNotification(payload, matchWinnerName, scoreDisplay, timestampStr) {
  var games = payload.games || [];

  // 各ゲームの内訳行を生成
  var gameDetails = games
    .map(function (g) {
      var wName =
        g.winner === 'P1'
          ? payload.player1
          : g.winner === 'P2'
          ? payload.player2
          : '-';
      return (
        '**Game ' +
        g.gameNumber +
        '**: [' +
        g.stage +
        '] ➔ 🏆 **' +
        wName +
        '** 勝\n' +
        '　└ P1: ' +
        (g.p1Fighter || '未選択') +
        ' vs P2: ' +
        (g.p2Fighter || '未選択')
      );
    })
    .join('\n\n');

  // Embedの色 (Winnersなら青系 #2563EB = 2450411, Losersなら赤系 #DC2626 = 14427686)
  var embedColor = payload.bracketSide === 'Winners' ? 2450411 : 14427686;

  var discordPayload = {
    username: '大会戦績通知Bot',
    embeds: [
      {
        title: '🏆 [' + payload.bracketSide + ' ' + payload.round + '] 試合結果',
        color: embedColor,
        fields: [
          {
            name: '⚔️ 対戦カード',
            value: '**' + payload.player1 + '** vs **' + payload.player2 + '**',
            inline: false,
          },
          {
            name: '📊 スコア結果',
            value: '【 **' + scoreDisplay + '** 】➔ 🏆 **' + matchWinnerName + '** の勝利！',
            inline: false,
          },
          {
            name: '📝 各ゲーム詳細',
            value: gameDetails || '詳細なし',
            inline: false,
          },
        ],
        footer: {
          text: '受信日時: ' + timestampStr + ' | start.gg反映後に ✅ をリアクション',
        },
      },
    ],
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(discordPayload),
    muteHttpExceptions: true,
  };

  UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
}
