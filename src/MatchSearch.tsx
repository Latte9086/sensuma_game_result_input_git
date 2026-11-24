import { useEffect, useId, useState } from 'react';
import type { BracketSide } from './constants/smashData';
import type { StartggMatch } from './types';

export async function reportApi<T>(url: string, request: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('通信エラー');
  return response.json() as Promise<T>;
}

interface SearchOptions {
  status: string;
  entrants?: { id: string; name: string }[];
  rounds?: { side: BracketSide; name: string }[];
  message?: string;
}

interface SearchChoice { id: string; name: string; label?: string }

function FilterField({
  label, text, selected, choices, required, onChange,
}: {
  label: string; text: string; selected: string; choices: SearchChoice[];
  required?: boolean; onChange: (text: string, selected?: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
  const visible = choices.filter((choice) => normalize(choice.name).includes(normalize(text)));
  const expanded = open && visible.length > 0;

  function selectChoice(choice: SearchChoice) {
    onChange(choice.name, choice.id);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="search-field">
      <label>{label}
        <input required={required} maxLength={80} value={text} autoComplete="off"
          role={choices.length ? "combobox" : undefined} aria-autocomplete={choices.length ? "list" : undefined}
          aria-expanded={choices.length ? expanded : undefined} aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && active >= 0 ? listId + "-" + active : undefined}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onBlur={() => { setOpen(false); setActive(-1); }}
          onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape' && expanded) {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && visible.length) {
              event.preventDefault();
              const next = event.key === 'ArrowDown' ? Math.min(active + 1, visible.length - 1)
                : active < 0 ? visible.length - 1 : Math.max(active - 1, 0);
              setOpen(true);
              setActive(next);
              requestAnimationFrame(() => document.getElementById(listId + "-" + next)?.scrollIntoView({ block: "nearest" }));
            } else if (event.key === 'Enter' && expanded && visible[active]) {
              event.preventDefault();
              selectChoice(visible[active]);
            }
          }} />
      </label>
      {expanded && <ul id={listId} className="search-suggestions" role="listbox" aria-label={label + "の候補"}>
        {visible.map((choice, index) => (
          <li id={listId + "-" + index} key={choice.id} role="option"
            aria-selected={active === index || (active < 0 && selected === choice.id)}
            onMouseDown={(event) => event.preventDefault()} onClick={() => selectChoice(choice)}>
            {choice.label ?? choice.name}
          </li>
        ))}
      </ul>}
    </div>
  );
}

export function MatchSearch({
  url, onSelect, onBack,
}: {
  url: string;
  onSelect: (match: StartggMatch) => void;
  onBack?: () => void;
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [firstId, setFirstId] = useState('');
  const [secondId, setSecondId] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [side, setSide] = useState<BracketSide | ''>('');
  const [round, setRound] = useState('');
  const [matches, setMatches] = useState<StartggMatch[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<SearchOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [manualSearch, setManualSearch] = useState(false);

  function clearResults() {
    setMatches(null);
    setError('');
  }

  useEffect(() => {
    let active = true;
    setOptionsError('');
    reportApi<SearchOptions>(url, { action: 'options' }).then((result) => {
      if (!active) return;
      if (result.status === 'ok' && Array.isArray(result.entrants) && Array.isArray(result.rounds)) {
        setOptions(result);
      } else {
        setOptionsError(result.status === 'rejected'
          ? '送信先が選択肢の取得に対応していません。選手名を入力して検索できます。'
          : result.message || '選択肢を取得できませんでした。');
      }
    }).catch(() => {
      if (active) setOptionsError('対戦データに接続できませんでした。');
    });
    return () => { active = false; };
  }, [url, attempt]);

  const entrants = [...(options?.entrants ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  const nameCounts = new Map<string, number>();
  for (const entrant of entrants) nameCounts.set(entrant.name, (nameCounts.get(entrant.name) ?? 0) + 1);
  const entrantChoices = entrants.map(({ id, name }) => ({
    id, name, label: (nameCounts.get(name) ?? 0) > 1 ? name + '（ID ' + id + '）' : name,
  }));
  const roundNames = Array.from(new Set((options?.rounds ?? [])
    .filter((entry) => !side || entry.side === side).map((entry) => entry.name)))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  return (
    <section className="card">
      <h2>対戦を検索</h2>
      {onBack && <button type="button" onClick={onBack}>前の報告に戻る</button>}
      {!options && !manualSearch && (optionsError ? <>
        <p role="alert" className="notice">{optionsError}</p>
        <button type="button" className="wide" onClick={() => setAttempt((count) => count + 1)}>選択肢を再読み込み</button>
        <button type="button" className="wide" onClick={() => setManualSearch(true)}>選手名を入力して検索</button>
      </> : <p role="status">選手とラウンドを読み込み中…</p>)}
      {(options || manualSearch) && <form className="match-search" onChange={clearResults} onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setMatches(null);
        setError('');
        try {
          const result = await reportApi<{ status: string; matches: StartggMatch[]; total: number; message?: string }>(
            url, firstId && secondId && (!round || selectedRound)
              ? { action: 'search', entrantIds: [firstId, secondId], side, round }
              : { action: 'search', first: first.trim(), second: second.trim(), side, round: round.trim(),
                firstId, secondId, exactRound: Boolean(selectedRound) },
          );
          if (result.status !== 'ok' || !Array.isArray(result.matches)) {
            setError(result.message || '対戦一覧を取得できませんでした。進行本部に確認してください。');
          } else {
            const visibleMatches = result.matches.filter(({ players, round: matchRound }) => {
              const [a, b] = players.map((player) => player?.id);
              return (!selectedRound || matchRound === selectedRound) && (
                ((!firstId || firstId === a) && (!secondId || secondId === b)) ||
                ((!firstId || firstId === b) && (!secondId || secondId === a))
              );
            });
            setMatches(visibleMatches);
            setTotal(result.total === result.matches.length ? visibleMatches.length : result.total);
          }
        } catch {
          setError('対戦一覧に接続できませんでした。通信状況を確認して再試行してください。');
        } finally {
          setLoading(false);
        }
      }}>
        <fieldset className="fields match-filters" disabled={loading}>
          <FilterField label="選手１" text={first} selected={firstId} required
            choices={entrantChoices.filter(({ id }) => id !== secondId)}
            onChange={(text, id = '') => { setFirst(text); setFirstId(id); clearResults(); }} />
          <FilterField label="選手２" text={second} selected={secondId} required
            choices={entrantChoices.filter(({ id }) => id !== firstId)}
            onChange={(text, id = '') => { setSecond(text); setSecondId(id); clearResults(); }} />
          <label>サイド
            <select value={side} onChange={(event) => { setSide(event.target.value as BracketSide | ''); setRound(''); setSelectedRound(''); }}>
              <option value="">指定なし</option>
              <option value="Winners">Winners</option>
              <option value="Losers">Losers</option>
            </select>
          </label>
          <FilterField label="ラウンド" text={round} selected={selectedRound}
            choices={roundNames.map((name) => ({ id: name, name }))}
            onChange={(text, id = '') => { setRound(text); setSelectedRound(id); clearResults(); }} />
        </fieldset>
        <button type="submit" className="primary wide" disabled={loading || !first.trim() || !second.trim()}>{loading ? '検索中…' : '対戦を検索'}</button>
      </form>}
      {error && <p role="alert" className="notice">{error}</p>}
      {matches?.length === 0 && <p role="status">該当する対戦がありません。登録名やラウンドを確認してください。</p>}
      {matches && total > matches.length && <p role="status">候補が多いため、選手名かラウンドで絞り込んでください。</p>}
      {!!matches?.length && (
        <ul className="match-list" aria-label="対戦候補">
          {matches.map((match) => (
            <li key={match.id}>
              <p className="muted">{[match.phase, match.pool, match.round].filter(Boolean).join(' · ')}
                {match.station !== null && ' · 台 ' + match.station}</p>
              <strong>{match.players[0]?.name || '未確定'} vs {match.players[1]?.name || '未確定'}</strong>
              <p className="match-status">{match.completed ? '入力済み' : '未入力'} · {match.unavailable ? '報告不可' : match.completed ? '訂正可' : '報告可'}</p>
              {match.score && <p className="muted">{match.score}</p>}
              {match.unavailable
                ? <p className="muted">{match.unavailable}</p>
                : <button type="button" className="wide" onClick={() => onSelect(match)}>この対戦を選ぶ</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
