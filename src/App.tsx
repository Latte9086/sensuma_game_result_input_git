import { useEffect, useRef, useState } from 'react';
import { BRACKET_SIDES, FIGHTER_ITEMS, ROUNDS, STAGES, STAGE_ENGLISH_NAMES } from './constants/smashData';
import { FighterSelect } from './components/FighterSelect';
import type { GameResult, MatchDraft, Submission } from './types';

const fighterEnglishNames = new Map(FIGHTER_ITEMS.map(({ name, englishName }) => [name, englishName]));
const fighterJapaneseNames = new Map(FIGHTER_ITEMS.map(({ name, englishName }) => [englishName, name]));
const stageJapaneseNames = new Map(Object.entries(STAGE_ENGLISH_NAMES).map(([name, englishName]) => [englishName, name]));

const STORAGE_KEY = 'sensuma_result_v2';
const GAS_URL_KEY = 'sensuma_gas_webapp_url';
const defaultGasUrl = import.meta.env.VITE_GAS_URL || '';

const game = (number: number, previous?: GameResult): GameResult => ({
  gameNumber: number,
  p1Fighter: previous?.p1Fighter ?? '',
  p2Fighter: previous?.p2Fighter ?? '',
  stage: '',
  winner: null,
});

const emptyDraft = (): MatchDraft => ({
  bracketSide: '',
  round: '',
  player1: '',
  player2: '',
  bestOf: 5,
  games: [game(1)],
});

interface SavedState {
  draft: MatchDraft;
  pending?: Submission;
  receipt?: Submission;
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadState(): SavedState {
  try {
    const saved = readStorage(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as SavedState;
  } catch {
    // A damaged local draft can be replaced with a blank form.
  }
  return { draft: emptyDraft() };
}

function scores(games: GameResult[]) {
  return [
    games.filter(({ winner }) => winner === 'P1').length,
    games.filter(({ winner }) => winner === 'P2').length,
  ];
}

function validate(draft: MatchDraft) {
  if (!draft.bracketSide || !draft.round) return 'トーナメントのサイドとラウンドを選んでください。';
  if (!draft.player1.trim() || !draft.player2.trim()) return '対戦者２人の名前を入力してください。';
  if (draft.games.length > draft.bestOf) return `ゲーム数を ${draft.bestOf} 以下にしてください。`;
  for (const entry of draft.games) {
    if (!entry.p1Fighter || !entry.p2Fighter || !entry.stage || !entry.winner) {
      return `ゲーム ${entry.gameNumber} のファイター、ステージ、勝者を選んでください。`;
    }
  }
  const target = (draft.bestOf + 1) / 2;
  const final = scores(draft.games);
  if (Math.max(...final) !== target || Math.max(...scores(draft.games.slice(0, -1))) >= target) {
    return `どちらかが ${target} 勝して終了した結果を入力してください。`;
  }
  return '';
}

function ResultSummary({ draft }: { draft: MatchDraft }) {
  const [p1, p2] = scores(draft.games);
  const winner = p1 > p2 ? draft.player1 : draft.player2;
  return (
    <>
      <p className="muted">{draft.bracketSide} {draft.round} · BO{draft.bestOf}</p>
      <p className="result">{draft.player1} <span>{p1}–{p2}</span> {draft.player2}</p>
      <p><strong>{winner} 勝利</strong></p>
    </>
  );
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [gasUrl, setGasUrl] = useState(() => readStorage(GAS_URL_KEY) ?? defaultGasUrl);
  const [screen, setScreen] = useState<'edit' | 'review' | 'receipt'>(() =>
    state.pending ? 'review' : state.receipt && !state.draft.correctionOf ? 'receipt' : 'edit',
  );
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const sendingRef = useRef(false);
  const verifiedDestination = useRef('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { draft, pending, receipt } = state;
  const [p1, p2] = scores(draft.games);
  const clinched = Math.max(p1, p2) >= (draft.bestOf + 1) / 2;
  const names = [draft.player1.trim() || '選手１', draft.player2.trim() || '選手２'];

  function persist(next: SavedState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }

  useEffect(() => {
    persist(state);
  }, [state]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

  function update(patch: Partial<MatchDraft>) {
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
    setError('');
  }

  function updateGame(index: number, patch: Partial<GameResult>) {
    update({ games: draft.games.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
  }

  async function send() {
    if (sendingRef.current) return;
    const rawUrl = gasUrl.trim();
    const targetUrl = /^[\w-]+$/.test(rawUrl)
      ? `https://script.google.com/macros/s/${rawUrl}/exec`
      : rawUrl;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(targetUrl)) {
      setError('設定で GAS のデプロイ URL（/exec）を確認してください。');
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError('');
    let submission = pending;
    try {
      if (verifiedDestination.current !== targetUrl) {
        const check = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
        const service = check.ok ? await check.json().catch(() => null) : null;
        if (service?.service !== 'sensuma-results' || service.version !== 2) {
          setError('送信先が新しい GAS に対応していません。スタッフに確認してください。');
          return;
        }
        verifiedDestination.current = targetUrl;
      }
      submission ??= {
        ...draft,
        player1: draft.player1.trim(),
        player2: draft.player2.trim(),
        games: draft.games.map((entry) => ({
          ...entry,
          p1Fighter: fighterEnglishNames.get(entry.p1Fighter) ?? entry.p1Fighter,
          p2Fighter: fighterEnglishNames.get(entry.p2Fighter) ?? entry.p2Fighter,
          stage: STAGE_ENGLISH_NAMES[entry.stage] ?? entry.stage,
        })),
        reportId: crypto.randomUUID(),
        correctionKey: draft.correctionOf && receipt ? receipt.correctionKey : crypto.randomUUID(),
      };
      const queued = { ...state, pending: submission };
      setState(queued);
      persist(queued);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(submission),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('通信エラー');
      const result = await response.json();
      if (result.status === 'rejected' && result.reportId === submission.reportId) {
        setState({ ...state, pending: undefined });
        setScreen('edit');
        setError(result.message || '報告内容を確認してください。');
        return;
      }
      if (result.status !== 'ok' || result.reportId !== submission.reportId) {
        throw new Error('保存未確認');
      }
      const saved = { draft: emptyDraft(), receipt: submission };
      setState(saved);
      persist(saved);
      setScreen('receipt');
    } catch {
      setError(submission
        ? '保存を確認できませんでした。同じ内容で再試行できます。'
        : '送信を開始できませんでした。通信状況と送信先設定を確認してください。');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="brand">千スマ</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {screen === 'receipt' ? '送信完了' : screen === 'review' ? '送信内容の確認' : draft.correctionOf ? '報告の訂正' : '対戦結果の報告'}
          </h1>
        </div>
        <details className="settings">
          <summary>送信先設定</summary>
          <label>GAS デプロイ URL
            <input type="text" value={gasUrl} disabled={sending} spellCheck={false} onChange={(event) => {
              const url = event.target.value;
              setGasUrl(url);
              try { localStorage.setItem(GAS_URL_KEY, url); } catch { setStorageAvailable(false); }
            }} />
          </label>
        </details>
      </header>

      {!storageAvailable && <p className="notice">このブラウザでは、ページを閉じると入力や報告控えが失われます。</p>}
      {screen === 'edit' && (
        <form onSubmit={(event) => {
          event.preventDefault();
          const problem = validate(draft);
          if (problem) setError(problem);
          else {
            setError('');
            setScreen('review');
          }
        }}>
          {draft.correctionOf && <p className="notice">訂正はスタッフ確認待ちとして送信されます。</p>}
          <section className="card">
            <h2>対戦情報</h2>
            <fieldset>
              <legend>トーナメント</legend>
              <div className="choices">
                {BRACKET_SIDES.map((side) => (
                  <button type="button" key={side} aria-pressed={draft.bracketSide === side} onClick={() => update({ bracketSide: side })}>{side}</button>
                ))}
              </div>
            </fieldset>
            <div className="fields">
              <label>ラウンド
                <select value={draft.round} onChange={(event) => update({ round: event.target.value })}>
                  <option value="">選択してください</option>
                  {ROUNDS.map((round) => <option key={round}>{round}</option>)}
                </select>
              </label>
              <label>対戦形式
                <select value={draft.bestOf} onChange={(event) => update({ bestOf: event.target.value === '5' ? 5 : 3 })}>
                  <option value="3">BO3（2本先取）</option>
                  <option value="5">BO5（3本先取）</option>
                </select>
              </label>
            </div>
            <div className="fields">
              <label>選手１<input value={draft.player1} maxLength={80} onChange={(event) => update({ player1: event.target.value })} /></label>
              <label>選手２<input value={draft.player2} maxLength={80} onChange={(event) => update({ player2: event.target.value })} /></label>
            </div>
          </section>

          <div className="section-heading"><h2>ゲーム結果</h2><strong aria-label={`セットスコア ${p1} 対 ${p2}`}>{p1}–{p2}</strong></div>
          {draft.games.map((entry, index) => (
            <section className="card" key={entry.gameNumber}>
              <div className="section-heading">
                <h3>ゲーム {entry.gameNumber}</h3>
                {index > 0 && index === draft.games.length - 1 && (
                  <button type="button" className="text-button" onClick={() => update({ games: draft.games.slice(0, -1) })}>削除</button>
                )}
              </div>
              <fieldset>
                <legend>勝者</legend>
                <div className="choices">
                  {(['P1', 'P2'] as const).map((side, i) => (
                    <button type="button" key={side} aria-pressed={entry.winner === side} onClick={() => updateGame(index, { winner: side })}>{names[i]}</button>
                  ))}
                </div>
              </fieldset>
              <label>ステージ
                <select value={entry.stage} onChange={(event) => updateGame(index, { stage: event.target.value })}>
                  <option value="">選択してください</option>
                  {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
              </label>
              <div className="fields">
                <FighterSelect label={`${names[0]}のファイター`} value={entry.p1Fighter} onChange={(value) => updateGame(index, { p1Fighter: value })} />
                <FighterSelect label={`${names[1]}のファイター`} value={entry.p2Fighter} onChange={(value) => updateGame(index, { p2Fighter: value })} />
              </div>
            </section>
          ))}
          {!clinched && draft.games.length < draft.bestOf && (
            <button className="wide" type="button" onClick={() => update({ games: [...draft.games, game(draft.games.length + 1, draft.games[draft.games.length - 1])] })}>＋ ゲームを追加</button>
          )}
          {error && <p role="alert" className="notice">{error}</p>}
          <button type="submit" className="primary wide">送信内容を確認</button>
          {draft.correctionOf && <button type="button" className="wide" onClick={() => {
            setState({ draft: emptyDraft(), receipt });
            setError('');
            setScreen('receipt');
          }}>訂正を取り消す</button>}
        </form>
      )}

      {screen === 'review' && (
        <section className="card">
          {(pending ?? draft).correctionOf && <p className="notice">訂正として送信します。</p>}
          <ResultSummary draft={pending ?? draft} />
          <details>
            <summary>ゲームの内訳</summary>
            <ol className="game-review">
              {draft.games.map((entry) => (
                <li key={entry.gameNumber}>
                  <strong>{entry.stage} · {names[entry.winner === 'P1' ? 0 : 1]} 勝利</strong>
                  <span>{names[0]}：{entry.p1Fighter} ／ {names[1]}：{entry.p2Fighter}</span>
                </li>
              ))}
            </ol>
          </details>
          {error && <p role="alert" className="notice">{error}</p>}
          <button className="primary wide" type="button" disabled={sending} onClick={send}>
            {sending ? '送信中…' : pending ? '同じ内容で再試行' : '結果を送信'}
          </button>
          {!pending && <button type="button" className="wide" disabled={sending} onClick={() => { setError(''); setScreen('edit'); }}>入力に戻る</button>}
        </section>
      )}

      {screen === 'receipt' && receipt && (
        <section className="card">
          <p className="notice">{receipt.correctionOf ? '訂正を受け付けました。スタッフの確認をお待ちください。' : '結果を受け付けました。'}</p>
          <ResultSummary draft={receipt} />
          <p className="report-id">報告ID <code>{receipt.reportId}</code></p>
          <button type="button" className="wide" onClick={() => {
            const { reportId, correctionKey: _key, ...previous } = receipt;
            const games = previous.games.map((entry) => ({
              ...entry,
              p1Fighter: fighterJapaneseNames.get(entry.p1Fighter) ?? entry.p1Fighter,
              p2Fighter: fighterJapaneseNames.get(entry.p2Fighter) ?? entry.p2Fighter,
              stage: stageJapaneseNames.get(entry.stage) ?? entry.stage,
            }));
            setState({ ...state, draft: { ...previous, games, correctionOf: reportId } });
            setScreen('edit');
          }}>この報告を訂正</button>
          <button type="button" className="primary wide" onClick={() => {
            setState({ draft: emptyDraft() });
            setScreen('edit');
          }}>新しい対戦を報告</button>
        </section>
      )}
    </main>
  );
}

