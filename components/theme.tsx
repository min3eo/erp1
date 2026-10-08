'use client';

import { useEffect, useState } from 'react';
import { cx } from './ui';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'tessel-theme';

/** Runs before hydration (inlined in <head>) so the first paint already has the right theme. */
export const themeBootScript = `try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');

  useEffect(() => {
    let saved: ThemePref = 'system';
    try {
      saved = (localStorage.getItem(KEY) as ThemePref) || 'system';
    } catch {}
    setPref(saved);
  }, []);

  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  const choose = (next: ThemePref) => {
    setPref(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };
  return { pref, choose };
}

const icons: Record<ThemePref, string> = {
  system: 'M3 5h18v11H3zM8 20h8M12 16v4',
  light: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  dark: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5',
};
const labels: Record<ThemePref, string> = { system: '시스템 설정', light: '라이트', dark: '다크' };

export function ThemeSwitch() {
  const { pref, choose } = useTheme();
  return (
    <div role="radiogroup" aria-label="화면 테마" className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
      {(Object.keys(icons) as ThemePref[]).map(p => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={pref === p}
          aria-label={labels[p]}
          title={labels[p]}
          onClick={() => choose(p)}
          className={cx('grid size-6 place-items-center rounded', pref === p ? 'bg-surface-2 text-ink' : 'text-subtle hover:text-muted')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
            <path d={icons[p]} />
          </svg>
        </button>
      ))}
    </div>
  );
}
