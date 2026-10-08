'use client';

import { budgetWarning } from '@/lib/budget';
import { AttachButton } from '@/components/attachments';
import { useState } from 'react';
import { FundOptions, KeyValues, Options, SideBox } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction, Suggestions, inputClass } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { journal } from '@/lib/accounting';
import { addExpense, decideExpense, expenseAccounts, fundById, monthOf, payExpense } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { staff } from '@/lib/hr';

export default function ExpensesPage() {
  const { state } = useErp();
  const act = useAction();
  const list = useListFilter();
  const [open, setOpen] = useState(false);
  const month = monthOf(date());
  const expenses = state.books.expenses;
  const total = (pick: (e: (typeof expenses)[number]) => boolean) => expenses.filter(pick).reduce((t, e) => t + e.amount, 0);

  // 수입비용 집계: every expense account booked this month (경비, 매입, 전표 입력 모두 포함).
  const expenseAccountSet = new Set(expenseAccounts(state));
  const byAccount = new Map<string, number>();
  journal(state).filter(e => monthOf(e.date) === month).forEach(e => e.lines.forEach(l => {
    if (expenseAccountSet.has(l.account)) byAccount.set(l.account, (byAccount.get(l.account) ?? 0) + l.debit - l.credit);
  }));
  const byDept = new Map<string, number>();
  expenses.filter(e => monthOf(e.date) === month && e.status !== '반려').forEach(e => byDept.set(e.dept || '미지정', (byDept.get(e.dept || '미지정') ?? 0) + e.amount));

  return (
    <>
      <PageHead
        title="비용관리"
        sub="직원이 쓴 경비를 청구하고 승인 · 지급까지 처리해요. 승인하면 바로 장부에 비용으로 들어가고, 개인 결제는 지급할 때 통장에서 빠져요."
        action={<Button variant="primary" onClick={() => setOpen(true)}>경비 청구</Button>}
      />
      <Stats>
        <Stat label="승인 대기" value={money(total(e => e.status === '승인 대기'))} unit="" foot={`${expenses.filter(e => e.status === '승인 대기').length}건 · 결재함에서도 처리`} tone={expenses.some(e => e.status === '승인 대기') ? 'warn' : undefined} />
        <Stat label="지급 대기" value={money(total(e => e.status === '승인 완료' && e.method === '개인 결제'))} unit="" foot="승인된 개인 결제" />
        <Stat label="이번 달 승인 경비" value={money(total(e => monthOf(e.date) === month && (e.status === '승인 완료' || e.status === '지급 완료')))} unit="" foot="반려 제외" tone="info" />
        <Stat label="이번 달 전체 비용" value={money([...byAccount.values()].reduce((t, v) => t + v, 0))} unit="" foot="경비 · 매입 · 전표 합계" tone="ok" />
      </Stats>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <FilterToolbar tabs={['전체', '승인 대기', '승인 완료', '지급 완료', '반려']} list={list} placeholder="청구자, 내용, 계정 검색" />
          <DataTable
            headers={['사용일', '청구자', '계정 · 내용', '결제', '금액', '상태', '처리']}
            rows={expenses
              .filter(e => (list.filter === '전체' || e.status === list.filter) && list.matches(e.person, e.desc, e.account, e.dept))
              .map(e => [
                e.date,
                <><strong className="font-medium text-ink">{e.person}</strong><CellSub>{e.dept || '—'}</CellSub></>,
                <>{e.account}<CellSub>{e.desc}</CellSub></>,
                e.method === '법인카드' ? fundById(state, e.card)?.name ?? '법인카드' : '개인 결제',
                <strong key="a" className="font-medium text-ink">{money(e.amount)}</strong>,
                <Pill key="s">{e.status === '승인 완료' && e.method === '개인 결제' ? '지급 대기' : e.status}</Pill>,
                <span key="x" className="flex gap-1.5">
                  <AttachButton refId={e.id} title={`${e.person} · ${e.desc}`} />
                  {e.status === '승인 대기' && (
                    <>
                      <Button onClick={() => act(d => decideExpense(d, e.id, false), '반려했어요.')}>반려</Button>
                      <Button variant="primary" onClick={() => act(d => decideExpense(d, e.id, true), '승인하고 장부에 반영했어요.')}>승인</Button>
                    </>
                  )}
                  {e.status === '승인 완료' && e.method === '개인 결제' && <Button variant="primary" onClick={() => act(d => payExpense(d, e.id), `${e.person}님에게 ${money(e.amount)}을 지급했어요.`)}>지급</Button>}
                  {e.paidAt && <span className="text-caption text-subtle">{e.paidAt} 지급</span>}
                </span>,
              ])}
          />
        </Card>
        <aside className="flex flex-col gap-3">
          <SideBox title={`${month} 계정별 비용`}>
            <KeyValues rows={[...byAccount].filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)])} />
          </SideBox>
          <SideBox title={`${month} 부서별 경비`}>
            <KeyValues rows={[...byDept].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)])} />
          </SideBox>
        </aside>
      </div>
      <Hint className="mt-4">법인카드 경비는 승인하면 카드 미결제 금액으로 잡히고, 카드 대금은 계좌/카드 화면에서 결제 처리해요. 개인 결제는 승인 후 ‘지급’을 눌러야 통장에서 빠집니다.</Hint>

      <ExpenseForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ExpenseForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useErp();
  const people = staff(state);
  const [method, setMethod] = useState('개인 결제');
  const [person, setPerson] = useState(people[0]?.[0] ?? '');
  const [account, setAccount] = useState('여비교통비');
  const [amount, setAmount] = useState(0);
  const budget = amount ? budgetWarning(state, account, amount, date(), people.find(p => p[0] === person)?.[1]) : '';
  return (
    <ModalForm
      open={open}
      onClose={onClose}
      title="경비 청구"
      submitLabel="승인 요청"
      done="경비를 청구했어요. 결재함에서 승인할 수 있어요."
      run={(d, f) => addExpense(d, { date: f.date, person: f.person, dept: people.find(p => p[0] === f.person)?.[1] ?? '', account: f.account, amount: f.amount, desc: f.desc, method: f.method, card: f.card, project: f.project })}
    >
      <div className="grid grid-cols-2 gap-3">
        <Select name="person" label="청구자" value={person} onChange={setPerson}><Options values={people.map(p => p[0])} /></Select>
        <Field name="date" label="사용일" type="date" defaultValue={date()} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select name="account" label="비용 계정" value={account} onChange={setAccount}><Options values={expenseAccounts(state)} /></Select>
        <label className="my-3 block text-caption font-medium text-ink-2">금액 (원)<input name="amount" type="number" min={1} required value={amount || ''} onChange={e => setAmount(Number(e.target.value))} className={inputClass} /></label>
      </div>
      <Field name="desc" label="사용 내용" placeholder="예) 거래처 미팅 택시비" />
      <Field name="project" label="프로젝트" optional list="expense-projects" />
      <Suggestions id="expense-projects" values={state.collab.projects.map(p => p.name)} />
      {budget && <p className="rounded-md bg-warn-soft px-3 py-2 text-caption text-warn">{budget}</p>}
      <Select name="method" label="결제 수단" value={method} onChange={setMethod}><Options values={['개인 결제', '법인카드']} /></Select>
      {method === '법인카드' && <Select name="card" label="사용한 카드"><FundOptions funds={state.books.funds} kinds={['카드']} /></Select>}
    </ModalForm>
  );
}
