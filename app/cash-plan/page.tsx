'use client';

import { useState } from 'react';
import { KeyValues, Options, SideBox, Signed } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, Card, DataTable, Hint, PageHead, Pill, Stat, Stats, Tabs, Toolbar, cx } from '@/components/ui';
import { addPlan, removePlan } from '@/lib/books';
import { cashPlan, type FlowKind } from '@/lib/cashflow';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';

const short = (d: string) => d.slice(5).replace('-', '.');

export default function CashPlanPage() {
  const { state } = useErp();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<number | null>(null);
  const [kind, setKind] = useState<'전체' | FlowKind>('전체');
  const plan = cashPlan(state);
  const inflow = plan.rows.reduce((t, r) => t + r.inflow, 0);
  const outflow = plan.rows.reduce((t, r) => t + r.outflow, 0);
  const max = Math.max(...plan.rows.map(r => Math.max(r.inflow, r.outflow)), 1);
  const kinds = ['전체', ...new Set(plan.items.map(i => i.kind))] as ('전체' | FlowKind)[];
  const items = (week === null ? plan.items : plan.rows[week].items).filter(i => kind === '전체' || i.kind === kind);

  return (
    <>
      <PageHead
        title="자금계획"
        sub="지금 통장 · 현금 잔액에서 앞으로 8주 동안 들어오고 나갈 돈을 더하고 빼서 주별 예상 잔액을 보여줘요. 미수금 · 미지급금 · 급여 · 세금 · 정기 계약이 자동으로 들어갑니다."
        action={<Button variant="primary" onClick={() => setOpen(true)}>예정 금액 추가</Button>}
      />
      <Stats>
        <Stat label="현재 가용 자금" value={money(plan.opening)} unit="" foot="계좌 + 현금 장부 잔액" tone="info" />
        <Stat label="8주 들어올 돈" value={money(inflow)} unit="" foot={`${plan.items.filter(i => i.amount > 0).length}건`} tone="ok" />
        <Stat label="8주 나갈 돈" value={money(outflow)} unit="" foot={`${plan.items.filter(i => i.amount < 0).length}건`} />
        <Stat label="최저 예상 잔액" value={money(plan.lowest.closing)} unit="" foot={`${short(plan.lowest.start)} 주`} tone={plan.lowest.closing < 0 ? 'danger' : plan.lowest.closing < plan.opening * 0.2 ? 'warn' : 'ok'} />
      </Stats>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <Card>
            <div className="border-b border-line px-4 py-3 text-caption text-muted">주별 자금 흐름 · 막대를 누르면 그 주 내역만 보여요</div>
            <ul className="divide-y divide-line">
              {plan.rows.map((r, i) => (
                <li key={r.start}>
                  <button
                    type="button"
                    onClick={() => setWeek(week === i ? null : i)}
                    aria-pressed={week === i}
                    className={cx('grid w-full grid-cols-[88px_minmax(0,1fr)_120px] items-center gap-3 px-4 py-2.5 text-left text-body hover:bg-surface-2/70', week === i && 'bg-surface-2')}
                  >
                    <span className="text-muted">{short(r.start)}~{short(r.end)}{i === 0 && <span className="ml-1 text-tiny text-accent">이번 주</span>}</span>
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2"><i className="h-2 rounded-full bg-ok" style={{ width: `${(r.inflow / max) * 100}%` }} /><span className="text-tiny text-subtle">{r.inflow ? '+' + money(r.inflow) : ''}</span></span>
                      <span className="flex items-center gap-2"><i className="h-2 rounded-full bg-ink-2" style={{ width: `${(r.outflow / max) * 100}%` }} /><span className="text-tiny text-subtle">{r.outflow ? '−' + money(r.outflow) : ''}</span></span>
                    </span>
                    <strong className={cx('text-right font-medium', r.closing < 0 ? 'text-danger' : 'text-ink')}>{money(r.closing)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <Toolbar>
              <Tabs options={kinds} value={kind} onChange={setKind} />
              {week !== null && <Button variant="text" onClick={() => setWeek(null)}>{short(plan.rows[week].start)} 주만 보는 중 · 전체 보기</Button>}
            </Toolbar>
            <DataTable
              headers={['예정일', '구분', '내용', '금액', '']}
              rows={items.map(i => [
                <span key="d" className={i.overdue ? 'text-danger' : ''}>{i.date}{i.overdue && <span className="ml-1 text-tiny">기한 지남</span>}</span>,
                <Pill key="k" tone="neutral">{i.kind}</Pill>,
                i.desc,
                <strong key="a" className="font-medium"><Signed value={i.amount} format={money} /></strong>,
                i.planId ? <Button key="x" variant="text" onClick={() => act(d => removePlan(d, i.planId!), '예정 금액을 지웠어요.')}>삭제</Button> : '',
              ])}
            />
          </Card>
        </div>

        <aside className="flex flex-col gap-3">
          <SideBox title="계좌 · 현금 잔액">
            <KeyValues rows={plan.balances.filter(b => b.fund.kind !== '카드').map(b => [b.fund.name, money(b.balance)])} />
          </SideBox>
          <SideBox title="법인카드 미결제">
            <KeyValues rows={plan.balances.filter(b => b.fund.kind === '카드').map(b => [b.fund.name, money(b.balance)])} empty="카드가 없어요." />
          </SideBox>
          <SideBox title="구분별 합계 (8주)">
            <KeyValues rows={kinds.slice(1).map(k => [k, <Signed key={k} value={plan.items.filter(i => i.kind === k).reduce((t, i) => t + i.amount, 0)} format={money} />])} />
          </SideBox>
        </aside>
      </div>
      <Hint className="mt-4">기한이 지난 미수금 · 미지급금은 오늘 들어오고 나가는 것으로 잡아요. 급여는 아직 확정하지 않은 달만 지금 급여 기준으로 예상합니다.</Hint>

      <ModalForm open={open} onClose={() => setOpen(false)} title="예정 금액 추가" submitLabel="추가" done="자금계획에 넣었어요." run={(d, f) => addPlan(d, { date: f.date, desc: f.desc, direction: f.direction, amount: f.amount })}>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="예정일" type="date" defaultValue={date()} />
          <Select name="direction" label="구분" defaultValue="출금"><Options values={['출금', '입금']} /></Select>
        </div>
        <Field name="desc" label="내용" placeholder="예) 대출 이자, 지원금 입금" />
        <Field name="amount" label="금액 (원)" type="number" />
      </ModalForm>
    </>
  );
}
