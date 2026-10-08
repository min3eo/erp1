'use client';

import { useState } from 'react';
import { ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, DetailField, DetailGrid, Hint, PageHead, Pill, Stat, Stats } from '@/components/ui';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { confirmYearEnd, emptyYearEnd, setYearEndInput, undoYearEnd, yearEndCalc } from '@/lib/hr';

export default function YearEndTaxPage() {
  const { state, openDrawer } = useErp();
  const act = useAction();
  const thisYear = date().slice(0, 4);
  const years = [...new Set([thisYear, ...state.payrolls.map(r => r.month.slice(0, 4))])].sort().reverse();
  const [year, setYear] = useState(years[0]);
  const [editing, setEditing] = useState<string | null>(null);
  const names = [...new Set(state.payrolls.filter(r => r.month.startsWith(year)).flatMap(r => (r.slips ?? []).map(p => p.name)))];
  const list = (names.length ? names : state.salaries.map(s => s.name)).map(n => yearEndCalc(state, year, n));
  const refund = list.filter(c => c.diff < 0).reduce((t, c) => t - c.diff - c.diffLocal, 0);
  const extra = list.filter(c => c.diff > 0).reduce((t, c) => t + c.diff + c.diffLocal, 0);

  const detail = (name: string) => {
    const c = yearEndCalc(state, year, name);
    openDrawer(`${name} · ${year} 연말정산`, (
      <>
        <DetailGrid>
          <DetailField label="총급여 (비과세 제외)" value={money(c.total)} />
          <DetailField label="근로소득공제" value={money(c.wageDeduct)} />
          <DetailField label="인적공제" value={money(c.personal)} />
          <DetailField label="연금 · 보험료 공제" value={money(c.pension + c.insurance)} />
          <DetailField label="신용카드 소득공제" value={money(c.card)} />
          <DetailField label="과세표준" value={money(c.base)} />
          <DetailField label="산출세액" value={money(c.computed)} />
          <DetailField label="근로소득 · 자녀 · 특별(표준) 세액공제" value={`${money(c.wageCredit)} · ${money(c.childCredit)} · ${money(c.specialCredit)}`} />
          <DetailField label="결정세액" value={money(c.decided)} />
          <DetailField label="기납부세액" value={money(c.paid)} />
        </DetailGrid>
        <p className="text-body">{c.diff > 0 ? `추가 납부 ${money(c.diff + c.diffLocal)}` : `환급 ${money(-(c.diff + c.diffLocal))}`} (지방소득세 포함)</p>
      </>
    ));
  };

  return (
    <>
      <PageHead
        title="연말정산"
        sub="1년 동안 매달 뗀 근로소득세(기납부세액)와 실제 내야 할 세금(결정세액)을 비교해 환급 · 추가 징수를 계산해요. 확정하면 확정한 달의 원천세 신고(A04)와 장부에 반영돼요."
        action={
          <ToolbarField label="귀속 연도">
            <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}>{years.map(y => <option key={y}>{y}</option>)}</select>
          </ToolbarField>
        }
      />
      <Stats>
        <Stat label="정산 대상" value={list.length} unit="명" foot={`확정 ${list.filter(c => c.done).length}명`} tone="info" />
        <Stat label="환급 예상" value={money(refund)} unit="" foot={`${list.filter(c => c.diff < 0).length}명`} tone="ok" />
        <Stat label="추가 징수 예상" value={money(extra)} unit="" foot={`${list.filter(c => c.diff > 0).length}명`} tone={extra ? 'warn' : undefined} />
        <Stat label="일정" value={`${Number(year) + 1}-02`} unit="급여" foot={`지급명세서 제출 ${Number(year) + 1}-03-10`} />
      </Stats>
      <Card>
        <DataTable
          headers={['직원', '반영 월수', '총급여', '결정세액', '기납부세액', '차감 (지방 포함)', '공제 자료', '상태', '처리']}
          rows={list.map(c => [
            <button key="n" type="button" onClick={() => detail(c.name)} className="font-medium text-ink hover:text-accent">{c.name}</button>,
            `${c.months}개월`,
            money(c.total),
            money(c.decided),
            money(c.paid),
            <strong key="d" className={c.diff < 0 ? 'font-medium text-ok' : 'font-medium text-ink'}>{c.diff < 0 ? '환급 ' : '징수 '}{money(Math.abs(c.diff + c.diffLocal))}</strong>,
            <>{c.input.cardSpend || c.input.medical || c.input.insurance ? '입력됨' : '없음'}<CellSub>카드 {money(c.input.cardSpend)} · 자녀 {c.input.children}명</CellSub></>,
            <Pill key="s">{c.done ? '확정' : '미확정'}</Pill>,
            <span key="a" className="flex gap-1.5">
              {!c.done && <Button onClick={() => setEditing(c.name)}>공제 입력</Button>}
              {!c.done ? <Button variant="primary" onClick={() => act(d => confirmYearEnd(d, year, c.name), `${c.name}님 연말정산을 확정했어요.`)}>확정</Button>
                : <Button variant="text" onClick={() => act(d => undoYearEnd(d, year, c.name), '확정을 취소했어요.')}>확정 취소</Button>}
            </span>,
          ])}
        />
      </Card>
      <Hint className="mt-4">
        간이 계산이에요. 근로소득공제 · 기본세율 · 근로소득세액공제 · 자녀세액공제와 보험료 · 의료비 · 교육비 · 기부금 세액공제(또는 표준세액공제 13만 원)만 반영했어요. 실제 정산은 홈택스 간소화 자료로 확인하세요.
      </Hint>

      {editing && (() => {
        const v = state.hr.yearEnd[year]?.[editing] ?? emptyYearEnd();
        return (
          <ModalForm open onClose={() => setEditing(null)} title={`${editing} · ${year} 공제 자료`} submitLabel="저장" done="공제 자료를 저장했어요." run={(d, f) => setYearEndInput(d, year, editing, f)}>
            <Field name="cardSpend" label="신용 · 체크카드 · 현금영수증 사용액" type="number" min={0} defaultValue={v.cardSpend} />
            <div className="grid grid-cols-2 gap-3">
              <Field name="insurance" label="보장성 보험료" type="number" min={0} defaultValue={v.insurance} />
              <Field name="medical" label="의료비" type="number" min={0} defaultValue={v.medical} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="education" label="교육비" type="number" min={0} defaultValue={v.education} />
              <Field name="donation" label="기부금" type="number" min={0} defaultValue={v.donation} />
            </div>
            <Field name="children" label="8세 이상 자녀 수" type="number" min={0} defaultValue={v.children} />
          </ModalForm>
        );
      })()}
    </>
  );
}
