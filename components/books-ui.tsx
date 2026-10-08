'use client';

import type { ReactNode } from 'react';
import { advanceSign, type Contract, type Fund } from '@/lib/books';
import { useAction } from './form-kit';
import { Button, Pill, cx } from './ui';

/** <option>s for funds, grouped by kind. `kinds` limits which kinds are offered. */
export function FundOptions({ funds, kinds = ['계좌', '현금', '카드'] }: { funds: Fund[]; kinds?: Fund['kind'][] }) {
  return (
    <>
      {kinds.map(k => {
        const list = funds.filter(f => f.kind === k);
        return list.length ? (
          <optgroup key={k} label={k}>
            {list.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </>
  );
}

export const Options = ({ values }: { values: readonly string[] }) => <>{values.map(v => <option key={v} value={v}>{v}</option>)}</>;

/** Compact labelled control for page toolbars (period pickers and the like). */
export function ToolbarField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-body', className)}>
      <span className="shrink-0 text-muted">{label}</span>
      {children}
    </label>
  );
}

export const bareSelect = 'min-w-0 bg-transparent outline-none';

/** Signed money with color: inflow green, outflow default. */
export const Signed = ({ value, format }: { value: number; format: (n: number) => string }) => (
  <span className={value > 0 ? 'text-ok' : value < 0 ? 'text-ink' : 'text-subtle'}>{value > 0 ? '+' : value < 0 ? '−' : ''}{format(Math.abs(value))}</span>
);

/** Side panel box used next to tables. */
export const SideBox = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-card border border-line bg-surface p-4">
    <h2 className="mb-3 text-caption text-muted">{title}</h2>
    {children}
  </section>
);

export function KeyValues({ rows, empty = '내역이 없어요.' }: { rows: [ReactNode, ReactNode][]; empty?: string }) {
  if (!rows.length) return <p className="text-body text-subtle">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2 text-body">
      {rows.map(([k, v], i) => (
        <li key={i} className="flex items-center justify-between gap-2">
          <span className="truncate text-muted">{k}</span>
          <strong className="shrink-0 font-medium">{v}</strong>
        </li>
      ))}
    </ul>
  );
}

export const CheckField = ({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) => (
  <label className="my-3 flex items-center gap-2 text-caption font-medium text-ink-2">
    <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-accent" />
    {label}
  </label>
);

/** E-sign status with the next step as a button. Shared with 전자근로계약. */
export function SignCell({ c }: { c: Contract }) {
  const act = useAction();
  return (
    <span className="flex items-center gap-1.5">
      <Pill>{c.sign}</Pill>
      {c.sign === '작성' && c.side !== '근로' && !c.approvedBy && <span className={c.rejectedAt ? 'text-tiny text-danger' : 'text-tiny text-warn'}>{c.rejectedAt ? `결재 반려 · ${c.rejectedAt}` : '결재 대기'}</span>}
      {c.sign === '작성' && (c.side === '근로' || c.approvedBy) && <Button variant="text" onClick={() => act(d => advanceSign(d, c.id), `${c.partner}에게 전자서명 링크를 보냈어요.`)}>서명 요청</Button>}
      {c.sign === '서명 요청' && <Button variant="text" onClick={() => act(d => advanceSign(d, c.id), '상대방 서명을 받아 계약을 체결했어요.')}>서명 완료 처리</Button>}
      {c.signedAt && <span className="text-tiny text-subtle">{c.signedAt}</span>}
    </span>
  );
}
