'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { approvalEntries } from '@/components/approvals';
import { openSearch } from '@/components/command-palette';
import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { LogoMark } from '@/components/logo';
import { Icon, Pill, cx } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { receivables } from '@/lib/finance';
import { href, type PageId } from '@/lib/nav';
import { payslips } from '@/lib/payroll';
import { people } from '@/lib/seed';




/** 10,834,000 → ₩1,083만, 254,000,000 → ₩2.5억 */
const compactWon = (n: number) =>
  n >= 1e8 ? `₩${(n / 1e8).toFixed(1).replace(/\.0$/, '')}억` : n >= 1e4 ? `₩${Math.round(n / 1e4).toLocaleString()}만` : `₩${n.toLocaleString()}`;

/** Module mark: the module's line icon on a softly tinted tile of its color. */
function ModuleIcon({ page, color }: { page: PageId; color: string }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105"
      style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
    >
      <Icon page={page} className="size-[18px]" />
    </span>
  );
}

/** Card mark: a colored line icon, no background. */
function CardIcon({ color, d }: { color: string; d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-7" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const SectionHead =({ title, sub, to }: { title: string; sub: string; to?: string }) => (
  <div className="mb-3 flex items-end justify-between gap-3 px-1">
    <h2 className="text-[22px] font-normal tracking-tight">
      {title} <span className="text-subtle">{sub}</span>
    </h2>
    {to && <Link href={to} aria-label={`${title} 전체 보기`} className="text-subtle hover:text-ink">→</Link>}
  </div>
);

const modules: { page: PageId; name: string; desc: string; color: string }[] = [
  { page: 'purchase', name: '구매', desc: '요청부터 발주까지', color: 'var(--color-sw-cyan)' },
  { page: 'receipt', name: '입고', desc: '받은 수량만큼 재고 반영', color: 'var(--color-sw-green)' },
  { page: 'sales', name: '판매', desc: '주문과 출고', color: 'var(--color-sw-magenta)' },
  { page: 'inventory', name: '재고', desc: '품목별 보유량과 안전재고', color: 'var(--color-sw-orange)' },
  { page: 'returns', name: '반품', desc: '정상 복원과 불량 분리', color: 'var(--color-sw-pink)' },
  { page: 'adjustments', name: '실사', desc: '실제 수량 확인과 조정', color: 'var(--color-sw-forest)' },
  { page: 'attendance', name: '근태', desc: '출퇴근과 근무 상태', color: 'var(--color-sw-mint)' },
  { page: 'approval', name: '결재', desc: '구매 · 휴가 · 조정 승인', color: 'var(--color-sw-blue)' },
];

const liveTabs = ['재고', '구매', '판매', '인사'] as const;
type LiveTab = (typeof liveTabs)[number];

export default function HomePage() {
  const { state, companyInfo } = useErp();
  const openForm = useOpenForm();
  const [tab, setTab] = useState<LiveTab>('재고');
  const [active, setActive] = useState(0);

  const approvals = approvalEntries(state);
  const toReceive = state.orders.filter(o => ['발주 완료', '부분 입고'].includes(o.status));
  const toShip = state.sales.filter(s => ['출고 대기', '부분 출고'].includes(s.status));
  const lowStock = state.items.filter(i => i[4] < i[5]);
  const stockValue = state.items.reduce((s, i) => s + i[4] * i[6], 0);
  const working = people.filter(p => p[3] === '근무 중').length;

  const counts: Partial<Record<PageId, string>> = {
    purchase: `${state.orders.filter(o => !['입고 완료', '취소', '반려'].includes(o.status)).length} 진행`,
    receipt: `${toReceive.length} 대기`,
    sales: `${toShip.length} 대기`,
    inventory: `${lowStock.length} 부족`,
    returns: `${state.returns.length} 건`,
    adjustments: `${state.adjustments.filter(a => a.status === '승인 대기').length} 승인 대기`,
    attendance: `${working}/${people.length} 근무`,
    approval: `${approvals.length} 대기`,
  };

  const sumBy = <T,>(list: T[], key: (x: T) => string, value: (x: T) => number) =>
    [...list.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + value(x)), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const openOrders = state.orders.filter(o => !['취소', '반려'].includes(o.status));
  const slips = payslips(state);
  const unpaid = receivables(state).reduce((t, b) => t + b.balance, 0);

  const live: Record<LiveTab, { rows: { page: PageId; title: string; desc: string }[]; panel: ReactNode }> = {
    재고: {
      rows: [...state.items].sort((a, b) => a[4] / a[5] - b[4] / b[5]).slice(0, 4).map(i => ({ page: 'inventory', title: i[1], desc: `${i[3]} · 보유 ${i[4]} / 안전 ${i[5]} ${F.unit(i)}${i[4] < i[5] ? ' · 부족' : ''}` })),
      panel: (
        <DataPanel
          metrics={[['재고 평가액', compactWon(stockValue)], ['부족 품목', `${lowStock.length}개`, lowStock.length ? 'warn' : undefined], ['불량 보관', `${Object.values(state.quarantine).filter(n => n > 0).length}품목`]]}
          title="품목별 보유량"
          note="세로선 = 안전재고"
          bars={state.items.map(i => ({ label: i[1], value: i[4], max: Math.max(i[4], i[5] * 2), marker: i[5], text: `${i[4].toLocaleString()} / ${i[5].toLocaleString()} ${F.unit(i)}`, warn: i[4] < i[5] }))}
        />
      ),
    },
    구매: {
      rows: state.orders.slice(0, 4).map(o => ({ page: 'purchase', title: `${o.name} · ${o.status}`, desc: `${o.id} · ${o.vendor} · ${money(o.qty * o.price)}` })),
      panel: (
        <DataPanel
          metrics={[['진행 중 발주', compactWon(openOrders.filter(o => o.status !== '입고 완료').reduce((t, o) => t + o.qty * o.price, 0))], ['승인 대기', `${state.orders.filter(o => o.status === '승인 대기').length}건`, state.orders.some(o => o.status === '승인 대기') ? 'warn' : undefined], ['입고 대기', `${toReceive.length}건`]]}
          title="거래처별 발주 금액"
          note="취소 · 반려 제외"
          bars={sumBy(openOrders, o => o.vendor, o => o.qty * o.price).map(([label, value], _, all) => ({ label, value, max: all[0][1], text: compactWon(value) }))}
        />
      ),
    },
    판매: {
      rows: state.sales.length
        ? state.sales.slice(0, 4).map(s => ({ page: 'sales', title: `${s.name} · ${s.status}`, desc: `${s.id} · ${s.customer} · ${s.shipped}/${s.qty}` }))
        : [{ page: 'sales', title: '아직 판매 주문이 없어요', desc: '판매 · 출고에서 첫 주문을 등록해 보세요.' }],
      panel: (
        <DataPanel
          metrics={[['판매 주문 금액', compactWon(state.sales.reduce((t, x) => t + x.qty * x.price, 0))], ['출고 대기', `${toShip.length}건`, toShip.length ? 'warn' : undefined], ['미수금', compactWon(unpaid)]]}
          title="고객사별 주문 금액"
          note="출고율 함께 표시"
          bars={sumBy(state.sales, x => x.customer, x => x.qty * x.price).map(([label, value], _, all) => {
            const mine = state.sales.filter(x => x.customer === label);
            const rate = Math.round((mine.reduce((t, x) => t + x.shipped, 0) / mine.reduce((t, x) => t + x.qty, 0)) * 100);
            return { label, value, max: all[0][1], text: `${compactWon(value)} · 출고 ${rate}%` };
          })}
        />
      ),
    },
    인사: {
      rows: people.slice(0, 4).map(p => ({ page: 'people', title: `${p[0]} · ${p[3]}`, desc: `${p[1]} · ${p[2]} · 출근 ${p[4]}` })),
      panel: (
        <DataPanel
          metrics={[['오늘 근무', `${working} / ${people.length}명`], ['외근 · 휴가', `${people.filter(p => p[3] !== '근무 중').length}명`], ['이번 달 실지급', compactWon(slips.reduce((t, x) => t + x.net, 0))]]}
          title="구성원별 실지급액"
          note="이번 달 급여 계산 기준"
          bars={[...slips].sort((a, b) => b.net - a.net).map((x, _, all) => ({ label: x.name, value: x.net, max: all[0].net, text: compactWon(x.net) }))}
        />
      ),
    },
  };
  const current = live[tab];

  const todo: { label: string; to: string }[] = [
    ...approvals.slice(0, 3).map(a => ({ label: `${a.title} 승인`, to: href('approval') })),
    ...toReceive.slice(0, 2).map(o => ({ label: `${o.name} 입고 처리`, to: href('receipt') })),
    ...receivables(state).filter(b => b.overdueDays > 0).slice(0, 2).map(b => ({ label: `${b.partner} 연체 미수금 ${money(b.balance)} 확인`, to: href('receivables') })),
    ...state.collab.tasks
      .filter(t => t.assignee === '민서' && !['완료', '보류'].includes(t.status))
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 2)
      .map(t => ({ label: `업무 · ${t.title}`, to: '/projects/' + t.projectId })),
  ];

  return (
    <>
      <div className="mb-10 grid gap-6 md:grid-cols-[1fr_minmax(0,440px)] md:items-start">
        <h1 className="text-[34px] leading-[1.15] font-normal tracking-tight">
          <span className="flex items-center gap-2.5"><LogoMark className="size-7" />{companyInfo.name}</span>
          <span className="text-subtle">워크스페이스</span>
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-2 md:pt-2">
          구매부터 입고, 판매, 재고, 근태와 결재까지 한곳에서 처리하세요. 오늘 확인할 일은 <strong className="font-medium text-ink">{approvals.length + toReceive.length + toShip.length}건</strong>입니다.
        </p>
      </div>

      <div className="relative mb-3 overflow-hidden rounded-card bg-[linear-gradient(110deg,#0a8bd2,#17abe7_50%,#3ac6f3)] px-5 py-4 text-white">
        {/* Soft drifting glows, flowing wave lines and an occasional light sheen. */}
        <span aria-hidden className="absolute -top-16 right-[12%] size-56 animate-drift rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.45),transparent_65%)] blur-2xl" />
        <span aria-hidden className="absolute -bottom-20 left-[30%] size-60 animate-drift-slow rounded-full bg-[radial-gradient(circle,rgb(10_80_190/0.45),transparent_65%)] blur-2xl" />
        <svg aria-hidden viewBox="0 0 600 80" preserveAspectRatio="none" className="absolute inset-y-0 right-0 h-full w-2/3 text-white/20">
          <path d="M0 62C90 62 120 18 220 22S380 70 470 46 560 10 600 14" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M0 74C110 70 150 36 250 40S400 78 490 58 570 28 600 30" fill="none" stroke="currentColor" strokeWidth="1" opacity=".7" />
          <path d="M0 48C80 52 130 6 230 8S370 54 460 32 560 0 600 2" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".5" />
        </svg>
        <span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-[linear-gradient(100deg,transparent,rgb(255_255_255/0.22),transparent)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px]">
            {approvals.length ? (
              <>결재 대기 {approvals.length}건 <span className="text-white/75">구매 요청과 휴가 신청을 확인하고 하루를 시작하세요</span></>
            ) : (
              <>새 기능 · 빠른 검색 <span className="text-white/75">Ctrl K로 메뉴, 발주 번호, 품목을 바로 찾아보세요</span></>
            )}
          </p>
          {approvals.length ? (
            <Link href={href('approval')} className="rounded-md bg-white px-3.5 py-1.5 text-body font-medium text-[#141414] hover:bg-white/90">결재함 열기</Link>
          ) : (
            <button type="button" onClick={openSearch} className="rounded-md bg-white px-3.5 py-1.5 text-body font-medium text-[#141414] hover:bg-white/90">검색 열기</button>
          )}
        </div>
      </div>

      <div className="mb-14 grid gap-3 md:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-6">
          {/* Clipboard with a check: things waiting for you. */}
          <CardIcon color="var(--color-sw-cyan)" d="M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15M8.5 14l2.5 2.5 4.5-5" />
          <h2 className="mt-5 text-[17px] font-normal">오늘 할 일</h2>
          <p className="text-[15px] text-muted">처리를 기다리는 업무를 먼저 확인하세요</p>
          <ul className="mt-5 flex flex-col gap-1.5 text-[15px]">
            {todo.length ? todo.map(t => <li key={t.label}><Link href={t.to} className="text-accent hover:underline">{t.label}</Link></li>) : <li className="text-subtle">모두 처리했어요</li>}
          </ul>
        </section>
        <section className="rounded-card border border-line bg-surface p-6">
          {/* Lightning bolt: start something in one click. */}
          <CardIcon color="var(--color-sw-orange)" d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />
          <h2 className="mt-5 text-[17px] font-normal">빠른 시작</h2>
          <p className="text-[15px] text-muted">자주 하는 업무를 바로 시작하세요</p>
          <ul className="mt-5 flex flex-col gap-1.5 text-[15px] text-sw-orange">
            <li><button type="button" onClick={() => openForm('purchase')} className="hover:underline">구매 요청 등록</button></li>
            <li><button type="button" onClick={() => openForm('sale')} className="hover:underline">판매 주문 등록</button></li>
            <li><button type="button" onClick={() => openForm('leave')} className="hover:underline">휴가 신청</button></li>
          </ul>
        </section>
      </div>

      <section className="mb-14">
        <SectionHead title="업무 모듈" sub="매일 쓰는 기본 단위" to={href('settings')} />
        <div className="grid grid-cols-1 overflow-hidden rounded-card border border-line bg-line gap-px sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(m => (
            <Link key={m.page} href={href(m.page)} className="group bg-surface p-5 hover:bg-surface-2/60">
              <span className="flex items-start justify-between gap-2">
                <ModuleIcon page={m.page} color={m.color} />
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-tiny text-muted group-hover:text-ink-2">{counts[m.page]}</span>
              </span>
              <span className="mt-3 block text-[15px] text-ink">{m.name}</span>
              <span className="mt-0.5 block text-caption text-muted">{m.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <SectionHead title="지금 우리 회사는" sub="실시간 현황 한눈에" to={href('reports')} />
        <div className="rounded-card border border-line bg-surface">
          <div className="flex flex-wrap gap-1 border-b border-line p-2">
            {liveTabs.map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => { setTab(t); setActive(0); }}
                className={cx('h-8 rounded-md border px-3.5 text-body', tab === t ? 'border-line bg-surface text-ink shadow-card' : 'border-transparent text-muted hover:text-ink')}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <ul className="flex flex-col gap-1">
              {current.rows.map((r, i) => (
                <li key={r.title + i}>
                  <Link
                    href={href(r.page)}
                    onMouseEnter={() => setActive(i)}
                    className={cx('flex gap-4 rounded-md px-4 py-4', active === i ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
                  >
                    <Icon page={r.page} className="mt-0.5 size-5 text-ink-2" />
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink">{r.title}</span>
                      <span className="block text-body leading-relaxed text-muted">{r.desc}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {current.panel}
          </div>
        </div>
      </section>

      <section className="mb-14 px-1">
        <h2 className="mb-6 text-[22px] font-normal tracking-tight">바로가기</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {([
            ['자주 보는 화면', [['inventory', '재고 현황'], ['movements', '입출고 이력'], ['documents', '문서 관리']]],
            ['도움이 필요하면', [['approvalSettings', '승인 절차 안내'], ['permissions', '권한 확인'], ['integrations', '외부 연동 상태']]],
            ['워크스페이스', [['settings', '회사 · 모듈 설정'], ['organization', '조직도'], ['reports', '리포트']]],
          ] as [string, [PageId, string][]][]).map(([title, links]) => (
            <div key={title}>
              <h3 className="mb-3 text-caption text-subtle">{title}</h3>
              <ul className="flex flex-col gap-3 text-[15px]">
                {links.map(([page, label]) => (
                  <li key={page}>
                    <Link href={href(page)} className="flex items-center gap-2.5 text-ink hover:text-accent">
                      <Icon page={page} className="text-ink-2" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

interface Bar { label: string; value: number; max: number; text: string; marker?: number; warn?: boolean }

/** Right-hand panel: three headline numbers and a horizontal bar chart, all from live workspace data. */
function DataPanel({ metrics, title, note, bars }: { metrics: [string, string, 'warn'?][]; title: string; note?: string; bars: Bar[] }) {
  return (
    <div className="flex min-h-[340px] flex-col rounded-md border border-line bg-surface-2/50 p-5">
      <dl className="grid grid-cols-3 gap-3 border-b border-line pb-4">
        {metrics.map(([k, v, tone]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-tiny text-muted">{k}</dt>
            <dd className={cx('mt-0.5 truncate text-[20px] font-medium tracking-tight', tone === 'warn' && 'text-warn')}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-caption font-medium text-ink-2">{title}</h3>
        {note && <span className="text-tiny text-subtle">{note}</span>}
      </div>
      {bars.length ? (
        <ul className="flex flex-col gap-2.5">
          {bars.slice(0, 7).map(b => (
            <li key={b.label} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-caption">
              <span className="truncate text-ink-2" title={b.label}>{b.label}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${b.label} ${b.text}`}>
                <span className={cx('absolute inset-y-0 left-0 rounded-full', b.warn ? 'bg-warn' : 'bg-accent')} style={{ width: `${b.max ? Math.min(100, (b.value / b.max) * 100) : 0}%` }} />
                {b.marker !== undefined && b.max > 0 && <span className="absolute inset-y-[-2px] w-0.5 bg-ink-2/60" style={{ left: `${Math.min(100, (b.marker / b.max) * 100)}%` }} />}
              </span>
              <span className={cx('text-right whitespace-nowrap tabular-nums', b.warn ? 'text-warn' : 'text-muted')}>{b.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-auto text-center text-body text-subtle">아직 표시할 데이터가 없어요.</p>
      )}
    </div>
  );
}
