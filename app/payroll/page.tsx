'use client';

import { useState } from 'react';
import { Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { useOpenForm } from '@/components/forms';
import { Avatar, Button, ButtonLink, Card, CardHead, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { addBonus, removeBonus, staff } from '@/lib/hr';
import { RATES, confirmPayroll, payslips, totals, transferCsv } from '@/lib/payroll';

/** 0.009 → '0.9', 0.03595 → '3.595' (no float noise). */
const pct = (r: number) => String(Number((r * 100).toFixed(3)));

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export default function PayrollPage() {
  const { state, mutate, toast } = useErp();
  const openForm = useOpenForm();
  const act = useAction();
  const [month, setMonth] = useState(F.date().slice(0, 7));
  const [bonusOpen, setBonusOpen] = useState(false);
  const confirmed = state.payrolls.find(p => p.month === month);
  const list = confirmed?.slips ?? payslips(state, month);
  const sum = totals(list);
  const bonuses = state.hr.bonuses.filter(b => b.month === month);

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
        title="급여관리"
        sub="기본급 · 수당 · 연장근로 · 상여에서 4대보험과 원천세를 공제해 실지급액을 계산해요. 중간 입사 · 퇴사자는 일할 계산되고, 확정하면 급여 전표가 만들어져요."
        action={(
          <>
            <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-body">
              <span className="text-muted">귀속 월</span>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent outline-none" aria-label="귀속 월" />
            </label>
            <Button onClick={() => setBonusOpen(true)} disabled={!!confirmed}>상여 등록</Button>
            <Button variant="primary" disabled={!!confirmed} onClick={confirm}>{confirmed ? '확정 완료' : '급여 확정'}</Button>
          </>
        )}
      />
      <Stats>
        <Stat label="지급 총액" value={money(sum.gross)} unit="" foot={`${list.length}명 · 비과세 ${money(list.reduce((t, p) => t + (p.nonTax ?? p.meal), 0))} 포함`} />
        <Stat label="4대보험 (근로자)" value={money(sum.insurance)} unit="" foot="국민연금 · 건강 · 장기요양 · 고용" />
        <Stat label="원천세" value={money(sum.tax)} unit="" foot="소득세 + 지방소득세" />
        <Stat label="실지급액" value={money(sum.net)} unit="" foot={confirmed ? `${confirmed.confirmedAt} 확정` : '미확정 · 계산 중'} tone={confirmed ? 'ok' : 'warn'} />
      </Stats>
      <Card>
        <CardHead title={`${month} 급여대장`} sub={confirmed ? '확정된 금액이에요. 이후 급여 정보를 바꿔도 이 달은 그대로예요.' : '확정 전이라 급여 정보 · 근무 기록 · 상여를 바꾸면 바로 다시 계산돼요.'}>
          <span className="flex gap-1.5">
            <ButtonLink href={`/print/ledger/${month}`}>급여대장 인쇄</ButtonLink>
            <Button onClick={() => download(`${month}_급여이체.csv`, transferCsv(state, month))}>이체 파일</Button>
          </span>
        </CardHead>
        <DataTable
          headers={['구성원', '기본급', '수당 · 비과세', '연장 · 상여', '지급 합계', '4대보험', '원천세', '실지급액', '처리']}
          rows={list.map(p => {
            const extra = (p.overtime ?? 0) + (p.bonus ?? 0);
            return [
              <span key="n" className="flex items-center gap-2"><Avatar name={p.name} className="size-6 text-[10px]" /><span><strong className="font-medium text-ink">{p.name}</strong>{p.days && <CellSub className="text-warn">일할 {p.days.worked}/{p.days.total}일</CellSub>}</span></span>,
              money(p.base),
              <>{money(p.allowance + p.meal + (p.car ?? 0) + (p.childcare ?? 0))}<CellSub>비과세 {money(p.nonTax ?? p.meal)}{p.car ? ' · 자가운전' : ''}{p.childcare ? ' · 육아' : ''}</CellSub></>,
              extra ? <>{money(extra)}<CellSub>{p.overtime ? `연장 ${money(p.overtime)}` : ''}{p.overtime && p.bonus ? ' · ' : ''}{p.bonus ? `상여 ${money(p.bonus)}` : ''}</CellSub></> : '—',
              money(p.gross),
              <>{money(p.pension + p.health + p.longTermCare + p.employment)}<CellSub>연금 {money(p.pension)} · 건강 {money(p.health + p.longTermCare)} · 고용 {money(p.employment)}</CellSub></>,
              <>{money(p.incomeTax + p.localTax)}<CellSub>소득세 {money(p.incomeTax)} · 지방 {money(p.localTax)}</CellSub></>,
              <strong key="net" className="text-ink">{money(p.net)}</strong>,
              <span key="a" className="flex gap-1.5">
                <ButtonLink href={`/print/payslip/${encodeURIComponent(p.name)}?m=${month}`}>명세서</ButtonLink>
                {!confirmed && <Button variant="text" onClick={() => openForm('salary', p.name)}>수정</Button>}
              </span>,
            ];
          })}
        />
      </Card>
      {bonuses.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-caption text-muted">
          {month} 상여:
          {bonuses.map(b => (
            <span key={b.id} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5">
              {b.name} · {b.desc} · {money(b.amount)}
              {!confirmed && <button type="button" className="text-subtle hover:text-danger" onClick={() => act(d => removeBonus(d, b.id), '상여를 지웠어요.')} aria-label="상여 삭제">✕</button>}
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-caption text-muted">
        확정 이력:
        {state.payrolls.length ? state.payrolls.map(r => <Pill key={r.month} tone="ok">{`${r.month} 확정`}</Pill>) : '없음'}
      </div>
      <Hint className="mt-4">
        샘플 요율: 국민연금 {pct(RATES.pension)}%, 건강보험 {pct(RATES.health)}%, 장기요양 건강보험료의 {pct(RATES.longTermCare)}%, 고용보험 {pct(RATES.employment)}%.
        비과세: 식대 · 자가운전보조금 · 육아수당 각 월 20만 원까지. 소득세는 간이세액표를 단순화한 근사치예요. 실제 지급 전에는 그해 고시 요율과 간이세액표로 확인해 주세요.
      </Hint>

      <ModalForm open={bonusOpen} onClose={() => setBonusOpen(false)} title={`${month} 상여 등록`} submitLabel="등록" done="상여를 등록했어요. 이 달 급여에 더해져요." run={(d, f) => addBonus(d, { name: f.name, month, amount: f.amount, desc: f.desc })}>
        <Select name="name" label="대상자"><Options values={staff(state).map(p => p[0])} /></Select>
        <Field name="desc" label="내용" placeholder="예) 명절 상여, 성과급" />
        <Field name="amount" label="금액 (원)" type="number" />
      </ModalForm>
    </>
  );
}
