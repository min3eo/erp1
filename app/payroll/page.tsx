'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Avatar, Button, ButtonLink, Card, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { RATES, confirmPayroll, payslips, totals } from '@/lib/payroll';

/** 0.009 → '0.9', 0.03595 → '3.595' (no float noise). */
const pct = (r: number) => String(Number((r * 100).toFixed(3)));

export default function PayrollPage() {
  const { state, mutate, toast } = useErp();
  const openForm = useOpenForm();
  const [month, setMonth] = useState('2026-10');
  const list = payslips(state);
  const sum = totals(list);
  const confirmed = state.payrolls.find(p => p.month === month);

  const confirm = () => {
    try {
      mutate(d => confirmPayroll(d, month, F.date()));
      toast(`${month} 급여를 확정했어요. 회계에 급여 전표가 생겼어요.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <PageHead
        title="급여"
        sub="기본급·수당에서 4대보험과 원천세를 공제해 실지급액을 계산해요. 확정하면 회계에 급여 전표가 만들어집니다."
        action={
          <>
            <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-body">
              <span className="text-muted">귀속 월</span>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent outline-none" aria-label="귀속 월" />
            </label>
            <Button variant="primary" disabled={!!confirmed} onClick={confirm}>{confirmed ? '확정 완료' : '급여 확정'}</Button>
          </>
        }
      />
      <Stats>
        <Stat label="지급 총액" value={money(sum.gross)} unit="" foot={`${list.length}명 · 식대 포함`} />
        <Stat label="4대보험 (근로자)" value={money(sum.insurance)} unit="" foot="국민연금 · 건강 · 장기요양 · 고용" />
        <Stat label="원천세" value={money(sum.tax)} unit="" foot="소득세 + 지방소득세" />
        <Stat label="실지급액" value={money(sum.net)} unit="" foot={confirmed ? `${confirmed.confirmedAt} 확정` : '미확정'} tone={confirmed ? 'ok' : 'warn'} />
      </Stats>
      <Card>
        <DataTable
          headers={['구성원', '기본급', '수당 · 식대', '지급 합계', '4대보험', '원천세', '공제 합계', '실지급액', '처리']}
          rows={list.map(p => [
            <span key="n" className="flex items-center gap-2"><Avatar name={p.name} className="size-6 text-[10px]" /><strong className="font-medium text-ink">{p.name}</strong></span>,
            money(p.base),
            <>{money(p.allowance + p.meal)}<CellSub>식대 {money(p.meal)} 비과세</CellSub></>,
            money(p.gross),
            <>{money(p.pension + p.health + p.longTermCare + p.employment)}<CellSub>연금 {money(p.pension)} · 건강 {money(p.health + p.longTermCare)} · 고용 {money(p.employment)}</CellSub></>,
            <>{money(p.incomeTax + p.localTax)}<CellSub>소득세 {money(p.incomeTax)} · 지방 {money(p.localTax)}</CellSub></>,
            money(p.deductions),
            <strong key="net" className="text-ink">{money(p.net)}</strong>,
            <span key="a" className="flex gap-1.5">
              <ButtonLink href={`/print/payslip/${encodeURIComponent(p.name)}?m=${month}`}>명세서</ButtonLink>
              <Button variant="text" onClick={() => openForm('salary', p.name)}>수정</Button>
            </span>,
          ])}
        />
      </Card>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-caption text-muted">
        확정 이력:
        {state.payrolls.length ? state.payrolls.map(r => <Pill key={r.month} tone="ok">{`${r.month} 확정`}</Pill>) : '없음'}
      </div>
      <Hint className="mt-4">
        샘플 요율: 국민연금 {pct(RATES.pension)}%, 건강보험 {pct(RATES.health)}%, 장기요양 건강보험료의 {pct(RATES.longTermCare)}%, 고용보험 {pct(RATES.employment)}%.
        소득세는 간이세액표를 단순화한 근사치예요. 실제 지급·신고 전에는 그해 고시 요율과 국세청 간이세액표로 확인해 주세요.
      </Hint>
    </>
  );
}
