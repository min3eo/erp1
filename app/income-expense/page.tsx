'use client';

import { projectPL } from '@/lib/budget';
import { useState } from 'react';
import { FundOptions, Options, ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, Suggestions, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats, Tabs, Toolbar, cx } from '@/components/ui';
import { journal, type JournalEntry } from '@/lib/accounting';
import { accountTypes, addVoucher, dailyTax, deleteVoucher, expenseAccounts, incomeAccounts, partnerNames } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { payslips } from '@/lib/payroll';
import { depts as deptsOf, employee } from '@/lib/hr';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const short = (n: number) => (n === 0 ? '' : Math.abs(n) >= 10_000 ? `${(n / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만` : n.toLocaleString('ko-KR'));

export default function IncomeExpensePage() {
  const { state, openDrawer } = useErp();
  const act = useAction();
  const today = date();
  const [year, setYear] = useState(today.slice(0, 4));
  const [view, setView] = useState<'월별' | '부서별' | '프로젝트별' | '직접 입력 내역'>('월별');
  const [open, setOpen] = useState<'수입' | '비용' | null>(null);

  const depts = deptsOf(state);
  const types = accountTypes(state);
  const entries = journal(state, today).filter(e => e.date.startsWith(year));
  // account → month → amount on its normal side, plus the entries behind each cell.
  const grid = new Map<string, { type: '수익' | '비용'; byMonth: number[]; list: JournalEntry[][] }>();
  entries.forEach(e => e.lines.forEach(l => {
    const type = types[l.account];
    if (type !== '수익' && type !== '비용') return;
    const row = grid.get(l.account) ?? { type, byMonth: Array(12).fill(0), list: MONTHS.map((): JournalEntry[] => []) };
    const m = Number(e.date.slice(5, 7)) - 1;
    row.byMonth[m] += type === '수익' ? l.credit - l.debit : l.debit - l.credit;
    if (!row.list[m].includes(e)) row.list[m].push(e);
    grid.set(l.account, row);
  }));
  const order = Object.keys(types);
  const rows = (type: '수익' | '비용') => [...grid].filter(([, r]) => r.type === type).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const monthTotal = (type: '수익' | '비용') => MONTHS.map((_, i) => rows(type).reduce((t, [, r]) => t + r.byMonth[i], 0));
  const income = monthTotal('수익'), expense = monthTotal('비용');
  const sum = (a: number[]) => a.reduce((t, v) => t + v, 0);
  const cur = year === today.slice(0, 4) ? Number(today.slice(5, 7)) - 1 : 11;
  const net = (i: number) => income[i] - expense[i];

  const showCell = (account: string, i: number, list: JournalEntry[]) => openDrawer(`${account} · ${year}-${MONTHS[i]}`, (
    <DataTable
      compact
      foot={false}
      headers={['일자', '구분', '적요', '금액']}
      rows={list.map(e => {
        const amt = e.lines.filter(l => l.account === account).reduce((t, l) => t + (types[account] === '수익' ? l.credit - l.debit : l.debit - l.credit), 0);
        return [e.date, <Pill key="s" tone="neutral">{e.source}</Pill>, e.desc, money(amt)];
      })}
    />
  ));

  // 부서별: department-tagged entries, expense claims, payroll (confirmed months × each person's pay) and day labor.
  const byDept = new Map<string, { income: number; expense: number; payroll: number; claims: number }>();
  const bucket = (d: string) => {
    const k = d || '미지정';
    if (!byDept.has(k)) byDept.set(k, { income: 0, expense: 0, payroll: 0, claims: 0 });
    return byDept.get(k)!;
  };
  depts.forEach(d => bucket(d));
  state.books.vouchers.filter(v => v.date.startsWith(year) && v.dept).forEach(v => {
    const amt = v.lines.reduce((t, l) => t + l.debit, 0);
    if (v.kind === '입금') bucket(v.dept!).income += amt;
    else bucket(v.dept!).expense += amt;
  });
  state.books.expenses.filter(e => e.date.startsWith(year) && (e.status === '승인 완료' || e.status === '지급 완료')).forEach(e => { bucket(e.dept).claims += e.amount; });
  const slips = payslips(state);
  state.payrolls.filter(r => r.month.startsWith(year)).forEach(() => slips.forEach(s => { bucket(employee(state, s.name)?.dept ?? '').payroll += s.gross; }));
  state.books.dailyWork.filter(w => w.paidAt?.startsWith(year)).forEach(w => { bucket('현장 (일용)').payroll += dailyTax(w).gross; });
  const deptRows = [...byDept].map(([d, v]) => ({ d, ...v, total: v.expense + v.payroll + v.claims })).sort((a, b) => b.total - a.total);
  const maxDept = Math.max(...deptRows.map(r => r.total), 1);
  const direct = state.books.vouchers.filter(v => v.origin === '수입비용');

  const th = 'sticky top-0 z-1 h-9 border-b border-line bg-surface-2 px-2.5 text-right text-caption font-normal text-muted';
  const td = 'border-b border-line px-2.5 py-2 text-right tabular-nums';
  const section = (type: '수익' | '비용', totals: number[]) => (
    <>
      <tr className="bg-surface-2/50"><td colSpan={14} className="border-b border-line px-4 py-1.5 text-tiny font-medium text-subtle">{type === '수익' ? '수입' : '비용'}</td></tr>
      {rows(type).map(([account, r]) => (
        <tr key={account} className="hover:bg-surface-2/70">
          <td className="sticky left-0 border-b border-line bg-surface px-4 py-2 text-body text-ink-2">{account}</td>
          {r.byMonth.map((v, i) => (
            <td key={i} className={cx(td, 'text-caption', i === cur && 'bg-accent-soft/40')}>
              {v ? <button type="button" onClick={() => showCell(account, i, r.list[i])} className="hover:text-accent hover:underline">{short(v)}</button> : ''}
            </td>
          ))}
          <td className={cx(td, 'text-body font-medium text-ink')}>{money(sum(r.byMonth))}</td>
        </tr>
      ))}
      <tr className="font-medium">
        <td className="sticky left-0 border-b border-line bg-surface px-4 py-2 text-body">{type === '수익' ? '수입' : '비용'} 합계</td>
        {totals.map((v, i) => <td key={i} className={cx(td, 'text-caption', i === cur && 'bg-accent-soft/40')}>{short(v)}</td>)}
        <td className={cx(td, 'text-body')}>{money(sum(totals))}</td>
      </tr>
    </>
  );

  return (
    <>
      <PageHead
        title="수입비용"
        sub="매출 · 이자 같은 수입과 급여 · 경비 · 임차료 같은 비용을 월별 · 부서별로 모아 봐요. 장부에 없는 소소한 수입이나 지출은 여기서 바로 입력할 수 있어요."
        action={
          <>
            <Button onClick={() => setOpen('비용')}>비용 입력</Button>
            <Button variant="primary" onClick={() => setOpen('수입')}>수입 입력</Button>
          </>
        }
      />
      <Stats>
        <Stat label={`${year}년 수입`} value={money(sum(income))} unit="" foot="매출 · 이자 · 잡이익 등" tone="ok" />
        <Stat label={`${year}년 비용`} value={money(sum(expense))} unit="" foot="매출원가 · 급여 · 경비 등" />
        <Stat label={`${year}년 순손익`} value={money(sum(income) - sum(expense))} unit="" foot="수입 − 비용 (세전)" tone={sum(income) >= sum(expense) ? 'ok' : 'danger'} />
        <Stat label={`${Number(MONTHS[cur])}월 순손익`} value={money(net(cur))} unit="" foot={cur ? `전월 대비 ${net(cur) - net(cur - 1) >= 0 ? '+' : '−'}${money(Math.abs(net(cur) - net(cur - 1)))}` : '연초'} tone={net(cur) >= 0 ? 'ok' : 'danger'} />
      </Stats>

      <Card>
        <Toolbar>
          <Tabs options={['월별', '부서별', '프로젝트별', '직접 입력 내역'] as const} value={view} onChange={setView} />
          <ToolbarField label="연도">
            <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}>
              {[today.slice(0, 4), String(Number(today.slice(0, 4)) - 1)].map(y => <option key={y}>{y}</option>)}
            </select>
          </ToolbarField>
        </Toolbar>

        {view === '월별' && (
          <div className="max-h-[calc(100dvh-260px)] overflow-auto">
            <table className="w-full border-collapse whitespace-nowrap">
              <thead>
                <tr>
                  <th className={cx(th.replace('text-right', 'text-left'), 'left-0 z-2 px-4')}>계정</th>
                  {MONTHS.map((m, i) => <th key={m} className={cx(th, i === cur && 'text-accent')}>{Number(m)}월</th>)}
                  <th className={th}>합계</th>
                </tr>
              </thead>
              <tbody>
                {section('수익', income)}
                {section('비용', expense)}
                <tr className="font-semibold">
                  <td className="sticky left-0 bg-surface px-4 py-2.5 text-body">순손익</td>
                  {MONTHS.map((_, i) => <td key={i} className={cx('px-2.5 py-2.5 text-right text-caption tabular-nums', net(i) < 0 && 'text-danger', i === cur && 'bg-accent-soft/40')}>{short(net(i))}</td>)}
                  <td className={cx('px-2.5 py-2.5 text-right text-body tabular-nums', sum(income) < sum(expense) && 'text-danger')}>{money(sum(income) - sum(expense))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {view === '부서별' && (
          <DataTable
            foot={false}
            headers={['부서', '급여 · 노임', '경비 청구', '직접 입력 비용', '비용 합계', '직접 입력 수입']}
            rows={deptRows.map(r => [
              <span key="d" className="flex items-center gap-3">
                <strong className="w-24 font-medium text-ink">{r.d}</strong>
                <i className="h-1.5 rounded-full bg-accent" style={{ width: `${(r.total / maxDept) * 120}px` }} />
              </span>,
              money(r.payroll),
              money(r.claims),
              money(r.expense),
              <strong key="t" className="font-medium text-ink">{money(r.total)}</strong>,
              r.income ? <span key="i" className="text-ok">{money(r.income)}</span> : '—',
            ])}
          />
        )}

        {view === '프로젝트별' && (
          <DataTable
            foot={false}
            headers={['프로젝트', '매출 · 수입', '비용', '손익', '이익률', '주요 비용', '건수']}
            rows={projectPL(state, undefined, year).map(p => [
              <strong key="p" className="font-medium text-ink">{p.project}</strong>,
              money(p.revenue),
              money(p.cost),
              <strong key="pr" className={p.profit < 0 ? 'font-medium text-danger' : 'font-medium text-ok'}>{money(p.profit)}</strong>,
              p.revenue ? `${Math.round(p.margin * 100)}%` : '—',
              <span key="a" className="text-caption text-muted">{[...p.byAccount].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${money(v)}`).join(' · ')}</span>,
              p.count,
            ])}
          />
        )}

        {view === '직접 입력 내역' && (
          <DataTable
            headers={['일자', '구분', '계정 · 적요', '부서', '계좌 · 카드', '금액', '']}
            rows={direct.map(v => {
              const main = v.lines.find(l => !l.fund)!;
              const fundLine = v.lines.find(l => l.fund);
              return [
                v.date,
                <Pill key="k" tone={v.kind === '입금' ? 'ok' : 'info'}>{v.kind === '입금' ? '수입' : '비용'}</Pill>,
                <>{main.account}<CellSub>{v.desc}{v.partner && ` · ${v.partner}`}</CellSub></>,
                v.dept ?? '—',
                state.books.funds.find(f => f.id === fundLine?.fund)?.name ?? '—',
                <strong key="a" className={v.kind === '입금' ? 'font-medium text-ok' : 'font-medium text-ink'}>{money(main.debit || main.credit)}</strong>,
                <Button key="x" variant="text" onClick={() => act(d => deleteVoucher(d, v.id), '지웠어요.')}>삭제</Button>,
              ];
            })}
          />
        )}
      </Card>
      <Hint className="mt-4">
        월별 표는 판매 · 구매 · 급여 · 경비 · 감가상각 등 모든 장부에서 자동으로 모여요. 금액을 누르면 그 달 내역이 열려요. 부서별 급여는 확정된 달 수 × 지금 급여 기준으로 나눈 값이에요.
      </Hint>

      <ModalForm
        open={!!open}
        onClose={() => setOpen(null)}
        title={`${open} 입력`}
        done={`${open}을 기록하고 장부에 반영했어요.`}
        run={(d, f) => addVoucher(d, { date: f.date, kind: open === '수입' ? '입금' : '출금', account: f.account, counter: f.fund, amount: f.amount, desc: f.desc, partner: f.partner, dept: f.dept }, '수입비용')}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="일자" type="date" defaultValue={today} />
          <Select name="account" label="계정" defaultValue={open === '수입' ? '잡이익' : '복리후생비'}>
            <Options values={open === '수입' ? incomeAccounts(state) : expenseAccounts(state)} />
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="amount" label="금액 (원)" type="number" />
          <Select name="fund" label={open === '수입' ? '들어온 곳' : '나간 곳'}>
            <FundOptions funds={state.books.funds} kinds={open === '수입' ? ['계좌', '현금'] : ['계좌', '현금', '카드']} />
          </Select>
        </div>
        <Field name="desc" label="적요" placeholder={open === '수입' ? '예) 폐자재 매각' : '예) 팀 회식'} />
        <div className="grid grid-cols-2 gap-3">
          <Select name="dept" label="부서" defaultValue={depts[0]}><Options values={depts} /></Select>
          <Field name="partner" label="거래처" list="ie-partners" optional />
        </div>
        <Suggestions id="ie-partners" values={partnerNames(state)} />
        <p className="text-tiny text-subtle">매출 · 매입처럼 세금계산서가 오가는 거래는 매출매입거래에서, 직원 경비는 비용관리에서 입력하세요.</p>
      </ModalForm>
    </>
  );
}
