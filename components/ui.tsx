'use client';

import Link from 'next/link';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { groupTabLabel, iconPaths, navGroups, pageFromPath, type PageId } from '@/lib/nav';

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

export function Icon({ page, className }: { page: PageId; className?: string }) {
  return (
    <span className={cx('inline-flex size-4 shrink-0 items-center justify-center', className)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d={iconPaths[page]} />
      </svg>
    </span>
  );
}

type Variant = 'default' | 'primary' | 'text';
const buttonClass = (variant: Variant = 'default', className?: string) =>
  cx(
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-body font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
    variant === 'primary' && 'bg-ink px-3 text-canvas hover:bg-ink-2',
    variant === 'default' && 'border border-line bg-surface px-3 text-ink hover:bg-surface-2',
    variant === 'text' && 'px-1.5 text-muted hover:text-ink',
    className,
  );

export function Button({ variant, className, ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/** Semantic tones. Old names (blue/green/orange/gray) stay as aliases for existing call sites. */
export type Tone = 'info' | 'ok' | 'warn' | 'danger' | 'neutral' | 'accent' | 'blue' | 'green' | 'orange' | 'gray';
type BaseTone = 'info' | 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';
const alias: Record<Tone, BaseTone> = { info: 'info', ok: 'ok', warn: 'warn', danger: 'danger', neutral: 'neutral', accent: 'accent', blue: 'info', green: 'ok', orange: 'warn', gray: 'neutral' };

export const toneText: Record<Tone, string> = Object.fromEntries(
  Object.entries(alias).map(([k, v]) => [k, { info: 'text-info', ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', neutral: 'text-muted', accent: 'text-accent' }[v]]),
) as Record<Tone, string>;

/** One fixed color per status, everywhere: waiting = warn, in progress = info, done = ok, closed = neutral. */
const statusTone: Record<string, BaseTone> = {
  '승인 대기': 'warn', '출고 대기': 'warn', '재고 부족': 'warn', '확인 필요': 'warn', '재처리 대기': 'warn', '자재 대기': 'warn',
  '입고 확인 대기': 'warn', '정정 요청': 'warn',
  '승인 완료': 'ok', '입고 완료': 'ok', '출고 완료': 'ok', '이동 완료': 'ok', '완료': 'ok', '확보 완료': 'ok', '이동 출고 완료': 'ok',
  '사용 중': 'ok', '운영 중': 'ok', '재직 중': 'ok', '근무 중': 'ok', '정상': 'ok',
  '발주 완료': 'info', '부분 입고': 'info', '부분 출고': 'info', '생산 중': 'info', '이동 중': 'info', '외근': 'info',
  '반려': 'neutral', '취소': 'neutral', '휴가': 'neutral', '이전 버전': 'neutral', '대기 없음': 'neutral',
  '불량': 'danger',
  // Collaboration task steps and priorities.
  '계획': 'accent', '확정': 'ok', '미확정': 'warn',
  '작성': 'info', '주문 전환': 'ok', '거절': 'neutral', '기한 내': 'ok', '1~30일': 'warn', '31~60일': 'danger', '61일 이상': 'danger', '정산 완료': 'ok',
  '요청': 'accent', '진행': 'info', '피드백': 'warn', '보류': 'neutral', '긴급': 'danger', '높음': 'warn', '보통': 'neutral', '낮음': 'neutral',
  // 회계 · 자금 · 세무.
  '발행 대기': 'warn', '발행 완료': 'info', '전송 완료': 'ok', '수취 완료': 'ok', '미처리': 'warn', '처리 완료': 'ok',
  '보관': 'info', '미결제': 'warn', '결제 완료': 'ok', '부도': 'danger', '지급 완료': 'ok', '지급 대기': 'warn',
  '서명 요청': 'warn', '서명 완료': 'ok', '진행 중': 'ok', '만료 예정': 'warn', '만료': 'neutral', '시작 전': 'neutral',
  '신고 완료': 'ok', '미신고': 'warn', '보유': 'ok', '처분': 'neutral', '상각 완료': 'neutral', '미작성': 'warn', '미등록': 'warn',
};

export function toneFor(text: string): BaseTone | undefined {
  return statusTone[text];
}

export function Pill({ children, tone, className }: { children: string; tone?: Tone; className?: string }) {
  const status = toneFor(children);
  const t = tone ? alias[tone] : status ?? 'neutral';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-tiny font-medium whitespace-nowrap',
        t === 'info' && 'bg-info-soft text-info',
        t === 'ok' && 'bg-ok-soft text-ok',
        t === 'warn' && 'bg-warn-soft text-warn',
        t === 'danger' && 'bg-danger-soft text-danger',
        t === 'neutral' && 'bg-neutral-soft text-muted',
        t === 'accent' && 'bg-accent-soft text-accent',
        className,
      )}
    >
      {(status || tone) && t !== 'neutral' && <i className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** One cell of a metric bar. Render inside <Stats>, which draws the shared frame and dividers. */
export function Stat({ label, value, unit, foot, tone }: { label: string; value: ReactNode; unit: string; foot: string; tone?: Tone }) {
  return (
    <div className="min-w-0 p-4">
      <div className="truncate text-caption text-muted">{label}</div>
      <div className="mt-1 truncate text-[24px] leading-tight font-medium tracking-tight">
        {value}
        {unit && <small className="ml-1 text-body font-normal text-muted">{unit}</small>}
      </div>
      <div className={cx('mt-1 flex items-center gap-1.5 truncate text-tiny', tone ? toneText[tone] : 'text-subtle')}>
        {tone && <i className="size-1.5 shrink-0 rounded-full bg-current" />}
        {foot}
      </div>
    </div>
  );
}

export const Stats = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cx(
      'mb-6 grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface md:grid-cols-4',
      '[&>*]:border-line max-md:[&>*:nth-child(-n+2)]:border-b max-md:[&>*:nth-child(odd)]:border-r md:[&>*:not(:last-child)]:border-r',
      className,
    )}
  >
    {children}
  </div>
);

const allGroups = navGroups({ erp: true, hr: true, manufacturing: true, collab: true });

/** Reference-style header: module eyebrow + large title on the left, description and actions on the right. */
export function PageHead({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  const page = pageFromPath(usePathname());
  const group = allGroups.find(([, ids]) => ids.includes(page))?.[0];
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)] md:items-end">
      <div className="min-w-0">
        {group && <p className="mb-1.5 text-caption text-subtle">{groupTabLabel[group] ?? group}</p>}
        <h1 className="text-[30px] leading-tight font-normal tracking-tight text-balance">{title}</h1>
      </div>
      <div className="flex flex-col gap-3 md:items-end md:text-right">
        <p className="text-body leading-relaxed text-muted">{sub}</p>
        {action && <div className="flex flex-wrap gap-2 md:justify-end">{action}</div>}
      </div>
    </div>
  );
}

export const Subtitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cx('mt-2 text-body text-muted', className)}>{children}</p>
);

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <section className={cx('overflow-hidden rounded-card border border-line bg-surface', className)}>{children}</section>
);

export function CardHead({ title, sub, children }: { title: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div>
        <h2 className="text-title font-medium">{title}</h2>
        {sub && <small className="mt-0.5 block text-caption text-muted">{sub}</small>}
      </div>
      {children}
    </div>
  );
}

export const Hint = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('mb-4 flex gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-caption text-muted', className)}>
    <span aria-hidden className="mt-px font-semibold text-subtle">i</span>
    <div>{children}</div>
  </div>
);

export const CellSub = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx('mt-0.5 block text-tiny text-subtle', className)}>{children}</span>
);

export const NameCell = ({ name, sub }: { name: ReactNode; sub?: ReactNode }) => (
  <>
    <strong className="font-semibold">{name}</strong>
    {sub !== undefined && <CellSub>{sub}</CellSub>}
  </>
);

/** Document number that opens its detail page. */
export const IdLink = ({ id, href }: { id: string; href: string }) => (
  <Link href={href} className="font-mono text-caption text-accent hover:underline">
    {id}
  </Link>
);

export const Dash = () => <span className="text-tiny text-subtle">—</span>;

const numericHeader = /금액|수량|단가|재고|누계|차이|합계|실적|재료비|평가액|일수|소요량/;

/** Saves the rendered table as CSV (UTF-8 with BOM so Excel reads Korean correctly). */
function downloadCsv(table: HTMLTableElement | null) {
  if (!table) return;
  const cell = (el: Element) => '"' + (el as HTMLElement).innerText.replace(/\s*\n\s*/g, ' ').trim().replace(/"/g, '""') + '"';
  const lines = [...table.rows].filter(r => r.cells.length > 1).map(r => [...r.cells].map(cell).join(','));
  const name = (document.querySelector('main h1')?.textContent?.trim() || 'tessel') + '_' + new Date().toLocaleDateString('sv-SE');
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name + '.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTable({ headers, rows, compact, foot = true }: { headers: ReactNode[]; rows: ReactNode[][]; compact?: boolean; foot?: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const right = headers.map(h => typeof h === 'string' && numericHeader.test(h));
  const long = rows.length > 12;
  return (
    <>
      <div className={cx('overflow-auto', long && 'max-h-[calc(100dvh-260px)]')}>
        <table ref={tableRef} className={cx('w-full border-collapse text-left', compact ? 'whitespace-normal' : 'whitespace-nowrap')}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={cx(
                    'sticky top-0 z-1 h-9 border-b border-line bg-surface-2 text-caption font-normal text-muted',
                    compact ? 'px-2.5' : 'px-4',
                    right[i] && 'text-right',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, i) => (
                <tr key={i} className="transition-colors hover:bg-surface-2/70 [&:last-child>td]:border-0">
                  {r.map((c, j) => (
                    <td key={j} className={cx('border-b border-line text-body text-ink-2', compact ? 'px-2.5 py-2.5' : 'px-4 py-2.5', right[j] && 'text-right')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length} className="px-4 py-12 text-center">
                  <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full border border-dashed border-line-strong text-subtle" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4.5"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></svg>
                  </span>
                  <strong className="block text-body font-medium text-ink-2">조건에 맞는 내역이 없어요</strong>
                  <span className="mt-0.5 block text-caption text-subtle">필터나 검색어를 바꿔 보세요.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {foot && (
        <div className="flex justify-between border-t border-line px-4 py-2.5 text-caption text-subtle">
          <span>총 {rows.length}건</span>
          <span className="flex items-center gap-3">
            샘플 데이터
            {rows.length > 0 && (
              <button type="button" onClick={() => downloadCsv(tableRef.current)} className="text-muted hover:text-ink print:hidden">
                CSV 내려받기
              </button>
            )}
          </span>
        </div>
      )}
    </>
  );
}

export const Toolbar = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col items-stretch gap-3 border-b border-line px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">{children}</div>
);

export function Tabs<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 self-start">
      {options.map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={cx(
            'h-8 rounded-md border px-3 text-body transition-colors',
            value === t ? 'border-line bg-surface text-ink shadow-card' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = '이름 또는 코드 검색' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block w-full sm:w-60">
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        className="h-8 w-full rounded-md border border-line bg-surface pr-3 pl-8 text-caption outline-none placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="목록 검색"
      />
    </label>
  );
}

/** Tab filter + text search shared by list pages. */
export function useListFilter() {
  const [filter, setFilter] = useState('전체');
  const [query, setQuery] = useState('');
  const matches = (...values: (string | number | undefined)[]) => values.join(' ').toLowerCase().includes(query.toLowerCase());
  return { filter, setFilter, query, setQuery, matches };
}

export function FilterToolbar({ tabs, list, placeholder }: { tabs: readonly string[]; list: ReturnType<typeof useListFilter>; placeholder?: string }) {
  return (
    <Toolbar>
      <Tabs options={tabs} value={list.filter} onChange={list.setFilter} />
      <SearchInput value={list.query} onChange={list.setQuery} placeholder={placeholder} />
    </Toolbar>
  );
}

export function PreviewTabs<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <Toolbar>
      <Tabs options={options} value={value} onChange={onChange} />
      <Pill tone="neutral" className="self-start sm:self-auto">화면 예시</Pill>
    </Toolbar>
  );
}

export const PreviewNotice = () => <Hint>화면 구성 예시입니다. 이 화면의 설정과 수치는 실제 서비스에 적용되지 않습니다.</Hint>;

export const DetailGrid = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('mt-4 mb-6 grid grid-cols-2 gap-x-4 gap-y-4', className)}>{children}</div>
);

export const DetailField = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <small className="mb-1 block text-caption text-muted">{label}</small>
    <strong className="text-body font-medium [overflow-wrap:anywhere]">{value}</strong>
  </div>
);

export const SectionTitle = ({ children }: { children: ReactNode }) => <h3 className="mt-6 mb-3 text-title font-medium">{children}</h3>;

export function MiniProgress({ ratio, className }: { ratio: number; className?: string }) {
  return (
    <div className={cx('h-1.5 w-16 overflow-hidden rounded-full bg-surface-2', className)}>
      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cx('grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-semibold text-accent', className)}>{name[0]}</span>;
}

export function SettingRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex items-center justify-between gap-4 border-b border-line py-4 last:border-0', className)}>{children}</div>;
}

export const Switch = (props: ComponentProps<'input'>) => <input type="checkbox" className="size-4 accent-accent" {...props} />;

export const Checkbox = (props: ComponentProps<'input'>) => <input type="checkbox" className="size-4 rounded accent-accent" {...props} />;
