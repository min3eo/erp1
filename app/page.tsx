'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { approvalEntries } from '@/components/approvals';
import { openSearch } from '@/components/command-palette';
import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { LogoMark } from '@/components/logo';
import { Icon, cx } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { payables, receivables } from '@/lib/finance';
import { fundBalances, incomeSummary, journal, trialBalance } from '@/lib/accounting';
import { accountTypes, addMonths, lastDay } from '@/lib/books';
import { currentUser } from '@/lib/admin';
import { useRouter } from 'next/navigation';
import { daysLeft, taxCalendar } from '@/lib/tax-calendar';
import { href, type PageId } from '@/lib/nav';
import { payslips } from '@/lib/payroll';
import { staff } from '@/lib/hr';




/** 10,834,000 → ₩1,083만, 254,000,000 → ₩2.5억 */
const compactWon = (n: number) =>
  n >= 1e8 ? `₩${(n / 1e8).toFixed(1).replace(/\.0$/, '')}억` : n >= 1e4 ? `₩${Math.round(n / 1e4).toLocaleString()}만` : `₩${n.toLocaleString()}`;

/** Module mark: the line icon on a neutral tile; the brand color shows on hover. */
function ModuleIcon({ page }: { page: PageId }) {
  return (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 transition group-hover:bg-accent-soft group-hover:text-accent"
    >
      <Icon page={page} className="size-5" />
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
    <h2 className="text-[20px] font-semibold tracking-[-0.02em]">
      {title} <span className="text-subtle">{sub}</span>
    </h2>
    {to && <Link href={to} aria-label={`${title} 전체 보기`} className="text-subtle hover:text-ink">→</Link>}
  </div>
);

const modules: { page: PageId; name: string; desc: string }[] = [
  { page: 'sales', name: '판매 · 출고', desc: '주문부터 출고까지' },
  { page: 'purchase', name: '구매', desc: '요청 · 발주 · 입고' },
  { page: 'inventory', name: '재고', desc: '보유량 · 원가 · LOT' },
  { page: 'vouchers', name: '전표', desc: '입력 · 승인 · 증빙' },
  { page: 'taxInvoices', name: '세금계산서', desc: '발행 · 수취 · 수정' },
  { page: 'funds', name: '계좌 · 카드', desc: '입출금 처리 · 대사' },
  { page: 'payroll', name: '급여', desc: '계산 · 명세서 · 이체' },
  { page: 'taxCalendar', name: '세무 일정', desc: '신고 · 납부 기한' },
];

type TodoTag = '결재' | '기한' | '입고' | '출고' | '수금' | '업무';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

const liveTabs = ['재고', '구매', '판매', '자금', '인사'] as const;
type LiveTab = (typeof liveTabs)[number];

export default function HomePage() {
  const { state, companyInfo } = useErp();
  const openForm = useOpenForm();
  const router = useRouter();
  const [tab, setTab] = useState<LiveTab>('재고');
  const [active, setActive] = useState(0);

  const approvals = approvalEntries(state);
  const toReceive = state.orders.filter(o => ['발주 완료', '부분 입고'].includes(o.status));
  const toShip = state.sales.filter(s => ['출고 대기', '부분 출고'].includes(s.status));
  const lowStock = state.items.filter(i => i[4] < i[5]);
  const stockValue = state.items.reduce((s, i) => s + i[4] * i[6], 0);
  const people = staff(state);
  const working = people.filter(p => p[3] === '근무 중').length;

  // A badge only when there is something to do.
  const badge = (n: number, label: string) => (n ? `${n} ${label}` : '');
  const counts: Partial<Record<PageId, string>> = {
    sales: badge(toShip.length, '출고 대기'),
    purchase: badge(state.orders.filter(o => !['입고 완료', '취소', '반려'].includes(o.status)).length, '진행'),
    inventory: badge(lowStock.length, '부족'),
    vouchers: badge(state.books.vouchers.filter(v => !v.approvedBy && v.origin !== '결산').length, '미승인'),
    taxInvoices: badge(state.books.invoices.filter(i => i.status === '발행 대기').length, '발행 대기'),
    funds: badge(state.books.bankTx.filter(t => !(t.voucherId || t.paymentId || t.expenseId)).length, '미처리'),
    payroll: state.payrolls.some(r => r.month === F.date().slice(0, 7)) ? '이번 달 확정' : '확정 전',
    taxCalendar: '',
  };

  const sumBy = <T,>(list: T[], key: (x: T) => string, value: (x: T) => number) =>
    [...list.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + value(x)), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const openOrders = state.orders.filter(o => !['취소', '반려'].includes(o.status));
  const slips = payslips(state);
  const unpaid = receivables(state).reduce((t, b) => t + b.balance, 0);
  const entries = journal(state);
  const month = F.date().slice(0, 7);
  const monthPl = incomeSummary(trialBalance(entries.filter(e => e.date.startsWith(month)), accountTypes(state)));
  const funds = fundBalances(state, entries);
  const cash = funds.filter(f => f.fund.kind !== '카드').reduce((t, f) => t + f.balance, 0);
  const owe = payables(state).reduce((t, b) => t + b.balance, 0);

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
    자금: {
      rows: funds.slice(0, 4).map(f => ({ page: 'funds', title: `${f.fund.name} · ${money(f.balance)}`, desc: f.fund.kind === '카드' ? '이번 달 결제할 카드 대금' : `${f.fund.kind} · ${f.fund.number}` })),
      panel: (
        <DataPanel
          metrics={[['통장 · 현금', compactWon(cash)], [`${Number(month.slice(5))}월 영업이익`, compactWon(Math.abs(monthPl.operating)) + (monthPl.operating < 0 ? ' 손실' : ''), monthPl.operating < 0 ? 'warn' : undefined], ['받을 돈 − 줄 돈', compactWon(Math.abs(unpaid - owe)) + (unpaid < owe ? ' 부족' : '')]]}
          title="계좌 · 카드별 잔액"
          note="카드는 결제 전 사용액"
          bars={funds.map(f => ({ label: f.fund.name, value: Math.max(0, f.balance), max: Math.max(...funds.map(x => x.balance), 1), text: money(f.balance), warn: f.fund.kind === '카드' }))}
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

  const today = F.date();
  const me = currentUser(state);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '좋은 아침이에요' : hour < 17 ? '좋은 오후예요' : '오늘도 수고했어요';
  const d = new Date(today + 'T00:00:00');
  const prevMonth = addMonths(month, -1);
  const prevPl = incomeSummary(trialBalance(entries.filter(e => e.date.startsWith(prevMonth)), accountTypes(state)));
  const ar = receivables(state);
  const overdue = ar.filter(b => b.overdueDays > 0 && b.balance > 0);
  const deadlines = taxCalendar(state, today, new Date(Date.parse(today) + 45 * 86400000).toISOString().slice(0, 10), today).filter(x => !x.done);
  const dDay = (date: string) => { const n = daysLeft(date, today); return n < 0 ? `${-n}일 지남` : n === 0 ? '오늘' : `D-${n}`; };

  const todo: { tag: TodoTag; label: string; meta: string; to: string; urgent?: boolean }[] = [
    ...deadlines.filter(x => daysLeft(x.date, today) <= 14).slice(0, 2).map(x => ({ tag: '기한' as TodoTag, label: x.title, meta: `${x.date.slice(5).replace('-', '.')} · ${dDay(x.date)}`, to: href('taxCalendar'), urgent: daysLeft(x.date, today) <= 3 })),
    ...approvals.slice(0, 3).map(a => ({ tag: '결재' as TodoTag, label: a.title, meta: a.summary, to: href('approval') })),
    ...overdue.slice(0, 1).map(b => ({ tag: '수금' as TodoTag, label: `${b.partner} 미수금 확인`, meta: `${money(b.balance)} · ${b.overdueDays}일 연체`, to: href('receivables') })),
    ...toReceive.slice(0, 1).map(o => ({ tag: '입고' as TodoTag, label: `${o.name} 입고 처리`, meta: `${o.vendor} · 남은 ${o.qty - o.received}`, to: href('receipt') })),
    ...toShip.slice(0, 1).map(x => ({ tag: '출고' as TodoTag, label: `${x.name} 출고`, meta: `${x.customer} · 남은 ${x.qty - x.shipped}`, to: href('sales') })),
    ...state.collab.tasks
      .filter(t => t.assignee === me?.name && !['완료', '보류'].includes(t.status))
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 1)
      .map(t => ({ tag: '업무' as TodoTag, label: t.title, meta: `마감 ${t.due}`, to: '/projects/' + t.projectId })),
  ];
  const actions: { label: string; run: () => void; icon: PageId }[] = [
    { label: '판매 주문', run: () => openForm('sale'), icon: 'sales' },
    { label: '구매 요청', run: () => openForm('purchase'), icon: 'purchase' },
    { label: '전표 입력', run: () => router.push(href('vouchers')), icon: 'vouchers' },
    { label: '경비 청구', run: () => router.push(href('expenses')), icon: 'expenses' },
  ];
  const kpis: { label: string; value: string; foot: string; to: string; tone?: string }[] = [
    { label: '통장 · 현금', value: compactWon(cash), foot: `카드 미결제 ${compactWon(funds.filter(f => f.fund.kind === '카드').reduce((t, f) => t + f.balance, 0))}`, to: href('funds') },
    { label: `${Number(month.slice(5))}월 매출`, value: compactWon(monthPl.revenue), foot: prevPl.revenue ? `지난달 대비 ${monthPl.revenue >= prevPl.revenue ? '+' : ''}${Math.round(((monthPl.revenue - prevPl.revenue) / prevPl.revenue) * 100)}%` : '지난달 매출 없음', to: href('accounting'), tone: monthPl.revenue >= prevPl.revenue ? 'text-ok' : 'text-danger' },
    { label: '받을 돈', value: compactWon(unpaid), foot: overdue.length ? `연체 ${overdue.length}건 · ${compactWon(overdue.reduce((t, b) => t + b.balance, 0))}` : '연체 없음', to: href('receivables'), tone: overdue.length ? 'text-warn' : 'text-ok' },
    { label: '결재 대기', value: `${approvals.length}건`, foot: approvals.length ? [...new Set(approvals.map(a => a.kind))].slice(0, 3).join(' · ') : '모두 처리했어요', to: href('approval'), tone: approvals.length ? 'text-warn' : 'text-ok' },
  ];

  // Six-month trends for the hero tiles.
  const trendMonths = Array.from({ length: 6 }, (_, k) => addMonths(month, k - 5));
  const balanceAt = (accounts: string[], day: string) => entries.filter(e => e.date <= day).reduce((t, e) => t + e.lines.filter(l => accounts.includes(l.account)).reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const flowIn = (account: string, m: string) => entries.filter(e => e.date.startsWith(m)).reduce((t, e) => t + e.lines.filter(l => l.account === account).reduce((x, l) => x + l.credit - l.debit, 0), 0);
  const trends = {
    cash: trendMonths.map(m => balanceAt(['현금', '보통예금'], m === month ? today : lastDay(m))),
    sales: trendMonths.map(m => flowIn('매출', m)),
    ar: trendMonths.map(m => balanceAt(['외상매출금', '미수금'], m === month ? today : lastDay(m))),
  };
  const kindCount = [...approvals.reduce((m, a) => m.set(a.kind, (m.get(a.kind) ?? 0) + 1), new Map<string, number>())];

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#075f8f_0%,#0780bf_42%,#1aa8e2_100%)] p-6 text-white shadow-[0_12px_40px_-12px_rgb(7_96_143/0.55)] sm:p-8">
        {/* Soft light and a faint grid keep the brand panel from feeling flat. */}
        <span aria-hidden className="absolute -top-24 -right-16 size-80 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.32),transparent_65%)] blur-2xl" />
        <span aria-hidden className="absolute -bottom-28 left-[18%] size-80 rounded-full bg-[radial-gradient(circle,rgb(2_40_70/0.45),transparent_65%)] blur-2xl" />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.06)_1px,transparent_1px)] bg-size-[32px_32px] mask-[linear-gradient(to_bottom,black,transparent_75%)]" />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-caption text-white/75">
              <span className="grid size-5 place-items-center rounded-md bg-white/15"><LogoMark className="size-3.5" /></span>
              {companyInfo.name} · {d.getMonth() + 1}월 {d.getDate()}일 {weekdays[d.getDay()]}요일
            </p>
            <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.02em] sm:text-[34px] text-balance">{greeting}, <span className="whitespace-nowrap">{me?.name ?? ''}님</span></h1>
            <p className="mt-1.5 text-[15px] text-white/80">
              {todo.length ? <>오늘 먼저 볼 일이 <strong className="font-semibold text-white">{todo.length}건</strong> 있어요.</> : '오늘 처리할 일을 모두 끝냈어요.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map(a => (
              <button key={a.label} type="button" onClick={a.run} className="flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/12 px-3.5 text-body font-medium text-white backdrop-blur-sm transition hover:-translate-y-px hover:bg-white/20">
                <Icon page={a.icon} className="size-4" />
                {a.label}
              </button>
            ))}
            <button type="button" onClick={openSearch} className="hidden h-10 items-center gap-2 rounded-xl bg-white px-3.5 sm:flex text-body font-medium text-[#075f8f] transition hover:bg-white/90">
              검색 <kbd className="rounded bg-[#075f8f]/10 px-1.5 text-tiny">Ctrl K</kbd>
            </button>
          </div>
        </div>

        <div className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, n) => (
            <Link key={k.label} href={k.to} className="group flex min-h-33 flex-col rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm transition hover:bg-white/16">
              <span className="flex items-center justify-between text-caption text-white/75">{k.label}<span className="opacity-0 transition group-hover:opacity-100">→</span></span>
              <strong className="mt-1.5 block text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{k.value}</strong>
              <span className="mt-0.5 block truncate text-tiny text-white/80">{k.foot}</span>
              <span className="mt-auto pt-3">
                {n < 3 ? <Sparkline values={[trends.cash, trends.sales, trends.ar][n]} /> : (
                  <span className="flex flex-wrap gap-1">
                    {kindCount.length ? kindCount.map(([kind, c]) => <span key={kind} className="rounded-md bg-white/15 px-1.5 py-0.5 text-micro whitespace-nowrap text-white/90">{kind} {c}</span>) : <span className="text-micro text-white/70">대기 없음</span>}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.08)]">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">오늘 할 일 <span className="rounded-full bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent">{todo.length}</span></h2>
            <Link href={href('approval')} className="rounded-md px-2 py-1 text-caption text-muted hover:bg-surface-2 hover:text-ink">결재함 열기 →</Link>
          </div>
          {todo.length ? (
            <ul className="flex flex-col">
              {todo.slice(0, 7).map(t => (
                <li key={t.tag + t.label}>
                  <Link href={t.to} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-tiny">
                        <span className={cx('font-semibold', t.urgent ? 'text-danger' : 'text-ink-2')}>{t.tag}</span>
                        <span className="truncate text-subtle">{t.meta}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[15px] font-medium text-ink">{t.label}</span>
                    </span>
                    <span className="text-subtle transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-12 text-center text-body text-subtle">모두 처리했어요. 좋은 하루 보내세요.</p>
          )}
          {todo.length > 7 && <p className="px-4 pt-1 pb-3 text-caption text-subtle">외 {todo.length - 7}건 · 결재함과 각 화면에서 확인하세요</p>}
        </section>

        <div className="flex flex-col gap-4 lg:[&>section:last-child]:flex-1">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.08)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold tracking-tight">세무 일정</h2>
              <Link href={href('taxCalendar')} className="rounded-md px-2 py-1 text-caption text-muted hover:bg-surface-2 hover:text-ink">전체 →</Link>
            </div>
            {deadlines.length ? (
              <ol className="relative ml-1 flex flex-col gap-4 border-l border-line pl-5">
                {deadlines.slice(0, 4).map(x => {
                  const n = daysLeft(x.date, today);
                  const urgent = n <= 3;
                  const dt = new Date(x.date + 'T00:00:00');
                  return (
                    <li key={x.key} className="relative">
                      <span aria-hidden className={cx('absolute top-1 -left-6.25 size-2 rounded-full ring-4 ring-surface', urgent ? 'bg-danger' : 'bg-line-strong')} />
                      <span className="flex items-baseline justify-between gap-2 text-tiny">
                        <span className="text-subtle">{dt.getMonth() + 1}월 {dt.getDate()}일 ({weekdays[dt.getDay()]}) · {x.kind}</span>
                        <span className={cx('shrink-0 font-semibold tabular-nums', urgent ? 'text-danger' : 'text-muted')}>{dDay(x.date)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-body font-medium text-ink">{x.title}</span>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-body text-subtle">45일 안에 남은 기한이 없어요.</p>}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.08)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold tracking-tight">{Number(month.slice(5))}월 손익</h2>
              <Link href={href('incomeExpense')} className="rounded-md px-2 py-1 text-caption text-muted hover:bg-surface-2 hover:text-ink">수입비용 →</Link>
            </div>
            {(() => {
              const costs = monthPl.cogs + monthPl.sga;
              const top = Math.max(monthPl.revenue, costs, 1);
              return (
                <>
                  <p className="mt-3 text-caption text-muted">영업이익</p>
                  <p className={cx('text-[28px] leading-tight font-semibold tracking-[-0.02em] tabular-nums', monthPl.operating < 0 ? 'text-danger' : 'text-ink')}>
                    {monthPl.operating < 0 ? '−' : '+'}{compactWon(Math.abs(monthPl.operating))}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 text-caption">
                    {([['매출', monthPl.revenue, 'bg-[linear-gradient(90deg,#0780bf,#1aa8e2)]'], ['원가 · 비용', costs, 'bg-line-strong']] as const).map(([k, v, c]) => (
                      <div key={k}>
                        <span className="mb-1 flex justify-between"><span className="text-muted">{k}</span><span className="font-medium tabular-nums text-ink-2">{compactWon(v)}</span></span>
                        <span className="block h-2.5 overflow-hidden rounded-full bg-surface-2"><span className={cx('block h-full rounded-full', c)} style={{ width: `${Math.max(2, (v / top) * 100)}%` }} /></span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      </div>

      <section className="mb-12">
        <SectionHead title="업무 모듈" sub="매일 쓰는 화면" to={href('settings')} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {modules.map(m => (
            <Link key={m.page} href={href(m.page)} className="group rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_28px_-14px_rgb(0_0_0/0.18)]">
              <span className="flex items-start justify-between gap-2">
                <ModuleIcon page={m.page} />
                {counts[m.page] && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-tiny font-medium text-accent">{counts[m.page]}</span>}
              </span>
              <span className="mt-4 block text-[15px] font-semibold text-ink">{m.name}</span>
              <span className="mt-0.5 block text-caption text-muted">{m.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <SectionHead title="지금 우리 회사는" sub="실시간 현황 한눈에" to={href('reports')} />
        <div className="rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.08)]">
          <div className="flex flex-wrap gap-1 border-b border-line p-2">
            {liveTabs.map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => { setTab(t); setActive(0); }}
                className={cx('h-8 rounded-full border px-4 text-body transition', tab === t ? 'border-transparent bg-ink text-canvas' : 'border-transparent text-muted hover:bg-surface-2 hover:text-ink')}
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
                    className={cx('flex gap-4 rounded-xl px-4 py-4 transition', active === i ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
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

    </>
  );
}

interface Bar { label: string; value: number; max: number; text: string; marker?: number; warn?: boolean }

/** Right-hand panel: three headline numbers and a horizontal bar chart, all from live workspace data. */
function DataPanel({ metrics, title, note, bars }: { metrics: [string, string, 'warn'?][]; title: string; note?: string; bars: Bar[] }) {
  return (
    <div className="flex min-h-85 flex-col rounded-xl bg-surface-2/70 p-5">
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
                {b.marker !== undefined && b.max > 0 && <span className="absolute -inset-y-0.5 w-0.5 bg-ink-2/60" style={{ left: `${Math.min(100, (b.marker / b.max) * 100)}%` }} />}
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

/** Six points as a soft white line with a faded fill, for the hero tiles. */
function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - min) / span) * 24] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full overflow-visible" aria-hidden>
      <path d={`${line} L100,30 L0,30 Z`} fill="rgb(255 255 255 / 0.14)" />
      <path d={line} fill="none" stroke="white" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.2" fill="white" />
    </svg>
  );
}
