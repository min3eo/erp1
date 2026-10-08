import { cx } from './ui';

/** tessel mark: four tiles laid edge to edge, one lit — modules that fit together. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cx('size-5.5 shrink-0', className)}>
      <rect x="2" y="2" width="9" height="9" rx="2" fill="currentColor" />
      <rect x="13" y="2" width="9" height="9" rx="2" fill="var(--color-accent)" />
      <rect x="2" y="13" width="9" height="9" rx="2" fill="currentColor" />
      <rect x="13" y="13" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-ink">
      <LogoMark />
      {!compact && <span className="text-[19px] leading-none font-semibold tracking-[-0.03em]">tessel</span>}
    </span>
  );
}
