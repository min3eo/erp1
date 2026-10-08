'use client';

import { useState } from 'react';
import { Options, ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, Suggestions, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, Hint, MiniProgress, PageHead, Pill, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { expenseAccounts, incomeAccounts } from '@/lib/books';
import { budgetReport, removeBudget, setBudget } from '@/lib/budget';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { depts } from '@/lib/hr';

const views = ['비용 예산', '수입 목표'] as const;

export default function BudgetPage() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const thisYear = today.slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState<(typeof views)[number]>('비용 예산');
  const [open, setOpen] = useState(false);
  const rows = budgetReport(state, year, today);
  const costs = rows.filter(r => !r.income), incomes = rows.filter(r => r.income);
  const list = view === '비용 예산' ? costs : incomes;
  const sum = (l: typeof rows, k: 'amount' | 'spent' | 'elapsed') => l.reduce((t, r) => t + r[k], 0);
  const over = costs.filter(r => r.status === '초과');
  const months = year < thisYear ? 12 : year > thisYear ? 0 : Number(today.slice(5, 7));

  return (
    <>
      <PageHead
        title="예산관리"
        sub="계정별 · 부서별로 한 해 예산을 정하면, 지금까지 쓴 돈을 경과 예산(예산 × 지난 개월 ÷ 12)과 비교해요. 경비를 청구할 때 예산을 넘으면 미리 알려 줘요."
        action={
          <>
            <ToolbarField label="연도">
              <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}><Options values={[String(Number(thisYear) + 1), thisYear, String(Number(thisYear) - 1)]} /></select>
            </ToolbarField>
            <Button variant="primary" onClick={() => setOpen(true)}>예산 정하기</Button>
          </>
        }
      />
      <Stats>
        <Stat label="비용 예산 (연간)" value={money(sum(costs, 'amount'))} unit="" foot={`${costs.length}개 항목`} />
        <Stat label="지금까지 쓴 돈" value={money(sum(costs, 'spent'))} unit="" foot={`경과 예산 ${money(sum(costs, 'elapsed'))} (${months}개월)`} tone={sum(costs, 'spent') > sum(costs, 'elapsed') ? 'warn' : 'ok'} />
        <Stat label="예산 초과" value={over.length} unit="건" foot={over.map(r => r.account).join(', ') || '없어요'} tone={over.length ? 'danger' : 'ok'} />
        <Stat label="수입 목표 달성" value={incomes.length ? `${Math.round((sum(incomes, 'spent') / Math.max(1, sum(incomes, 'amount'))) * 100)}%` : '—'} unit="" foot={incomes.length ? `${money(sum(incomes, 'spent'))} / ${money(sum(incomes, 'amount'))}` : '목표 없음'} tone="info" />
      </Stats>
      <Card>
        <Toolbar><Tabs options={views} value={view} onChange={setView} /></Toolbar>
        <DataTable
          headers={['계정', '연간 예산', '경과 예산', '실적', '남은 예산', '소진율', '상태', '']}
          rows={list.map(r => [
            <><strong className="font-medium text-ink">{r.account}</strong><CellSub>{r.dept ?? '회사 전체'}</CellSub></>,
            money(r.amount),
            money(r.elapsed),
            <strong key="s" className="font-medium text-ink">{money(r.spent)}</strong>,
            <span key="l" className={r.left < 0 && !r.income ? 'text-danger' : ''}>{money(r.left)}</span>,
            <span key="p" className="flex items-center justify-end gap-2">{Math.round(r.rate * 100)}%<MiniProgress ratio={Math.min(1, r.rate)} className="w-14" /></span>,
            <Pill key="t" tone={r.status === '초과' || r.status === '미달' ? 'danger' : r.status === '주의' ? 'warn' : 'ok'}>{r.status}</Pill>,
            <Button key="x" variant="text" onClick={() => act(d => removeBudget(d, r.id), '예산을 지웠어요.')}>삭제</Button>,
          ])}
        />
      </Card>
      <Hint className="mt-4">실적은 장부에서 바로 모아요. 부서 예산은 부서가 붙은 전표 · 경비 · 매출매입만 집계하고, 급여처럼 부서가 없는 장부는 회사 전체 예산에만 들어가요.</Hint>

      <ModalForm open={open} onClose={() => setOpen(false)} title={`${year}년 예산 정하기`} submitLabel="저장" done="예산을 저장했어요." run={(d, f) => setBudget(d, { year, account: f.account, dept: f.dept, amount: f.amount })}>
        <Select name="account" label="계정" defaultValue={view === '수입 목표' ? '매출' : '복리후생비'}>
          <optgroup label="비용"><Options values={expenseAccounts(state)} /></optgroup>
          <optgroup label="수입"><Options values={incomeAccounts(state)} /></optgroup>
        </Select>
        <Field name="dept" label="부서" optional list="budget-depts" placeholder="비우면 회사 전체" />
        <Suggestions id="budget-depts" values={depts(state)} />
        <Field name="amount" label="연간 금액 (원)" type="number" min={0} />
        <p className="text-tiny text-subtle">같은 계정 · 부서로 다시 저장하면 금액이 바뀌고, 0으로 저장하면 지워져요.</p>
      </ModalForm>
    </>
  );
}
