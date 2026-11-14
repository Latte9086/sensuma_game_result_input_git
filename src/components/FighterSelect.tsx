import { useEffect, useId, useRef, useState } from 'react';
import { FIGHTER_ITEMS } from '../constants/smashData';

interface FighterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, (letter) =>
    String.fromCharCode(letter.charCodeAt(0) - 0x60),
  );
}

const fighters = FIGHTER_ITEMS.map((fighter) => ({
  ...fighter,
  searchText: normalize(`${fighter.name} ${fighter.kana} ${fighter.id}`),
}));

export function FighterSelect({ label, value, onChange }: FighterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const matching = open ? fighters.filter((fighter) => fighter.searchText.includes(normalize(query.trim()))) : [];

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="fighter-picker" ref={root} onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }}>
      <label id={id + '-label'} htmlFor={id}>{label}</label>
      <button id={id} type="button" ref={trigger} aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`} onClick={() => {
          setQuery('');
          setOpen(!open);
        }}><span id={id + '-value'}>{value || '選択してください'}</span></button>
      {open && (
        <div className="fighter-search">
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="名前・かな・略称" aria-label={`${label}を検索`} />
          {matching.length === 0 ? <p>該当するファイターがいません。</p> : (
            <ul>
              {matching.map((fighter) => (
                <li key={fighter.id}>
                  <button type="button" aria-pressed={value === fighter.name} onClick={() => {
                    onChange(fighter.name);
                    close();
                  }}>{fighter.name}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
