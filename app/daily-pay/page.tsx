'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats } from '@/components/ui';
import { addDailyWork, dailyTax, monthOf, payDailyWork } from '@/lib/books';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';

/** 일용직: 일당 × 근무일, 15만 원 공제 후 6% × 45% 원천세, 고용보험 0.9%. 지급하면 잡급으로 장부에 들어가요. */
export default function DailyPayPage() {
  const { state } = useErp();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const list = state.books.dailyWork;
  const unpaid = list.filter(w => !w.paidAt);
  const thisMonth = list.filter(w => w.paidAt && monthOf(w.paidAt) === monthOf(F.date()));
  const sum = (ws: typeof list, k: 'gross' | 'net') => ws.reduce((t, w) => t + dailyTax(w)[k], 0);
  return (
    <>
      <PageHead
        title="일용근로급여관리"
        sub="하루 단위로 일하는 사람의 노임을 근무 월별로 등록하고 지급해요. 일당 15만 원을 넘는 부분에만 원천세가 붙고, 지급하면 잡급으로 장부에 들어가요."
        action={<Button variant="primary" onClick={() => setOpen(true)}>근무 등록</Button>}
      />
      <Stats>
        <Stat label="지급 대기" value={money(sum(unpaid, 'net'))} unit="" foot={`${unpaid.length}건 · 실지급액`} tone={unpaid.length ? 'warn' : undefined} />
        <Stat label="이번 달 지급 노임" value={money(sum(thisMonth, 'gross'))} unit="" foot={`${thisMonth.length}건`} />
        <Stat label="이번 달 원천세" value={money(thisMonth.reduce((t, w) => t + dailyTax(w).tax + dailyTax(w).local, 0))} unit="" foot="소득세 + 지방소득세" />
        <Stat label="일용 근로자" value={new Set(list.map(w => w.name)).size} unit="명" foot="등록된 사람" tone="info" />
      </Stats>
      <Card>
        <DataTable
          headers={['이름', '근무 월', '근무일수', '일당', '지급 합계', '원천세', '고용보험', '실지급액', '처리']}
          rows={list.map(w => {
            const t = dailyTax(w);
            return [
              <strong key="n" className="font-medium text-ink">{w.name}</strong>,
              w.month,
              `${w.days}일`,
              money(w.wage),
              money(t.gross),
              <>{money(t.tax + t.local)}<CellSub>{t.tax ? `소득세 ${money(t.tax)} · 지방 ${money(t.local)}` : '소액부징수 (1,000원 미만)'}</CellSub></>,
              money(t.employment),
              <strong key="net" className="text-ink">{money(t.net)}</strong>,
              w.paidAt
                ? <span key="p" className="flex items-center gap-2"><Pill>지급 완료</Pill><span className="text-tiny text-subtle">{w.paidAt}</span></span>
                : <Button key="p" variant="primary" onClick={() => act(d => payDailyWork(d, w.id), `${w.name}님 노임 ${money(t.net)}을 지급했어요.`)}>지급</Button>,
            ];
          })}
        />
      </Card>
      <Hint className="mt-4">일용근로소득은 지급한 달 기준으로 원천세 신고(A03)에 들어가요. 분기마다 일용근로소득 지급명세서도 제출해야 해요.</Hint>
      <ModalForm open={open} onClose={() => setOpen(false)} title="일용직 근무 등록" done="근무를 등록했어요. 지급하면 장부에 반영돼요." run={(d, f) => addDailyWork(d, { name: f.name, month: f.month, days: f.days, wage: f.wage })}>
        <Field name="name" label="이름" />
        <div className="grid grid-cols-2 gap-3">
          <Field name="month" label="근무 월" type="month" defaultValue={monthOf(F.date())} />
          <Field name="days" label="근무일수" type="number" defaultValue={1} />
        </div>
        <Field name="wage" label="일당 (원)" type="number" defaultValue={150000} />
      </ModalForm>
    </>
  );
}
