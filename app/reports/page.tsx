'use client';

import { useState } from 'react';
import { ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Card, DataTable, Hint, PageHead, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { addMonths } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { change, monthlyReport } from '@/lib/operations-report';

const tabs = ['구매 · 판매', '재고', '근태'] as const;

export default function ReportsPage() {
  const { state } = useErp();
  const [tab, setTab] = useState<(typeof tabs)[number]>('구매 · 판매');
  const thisMonth = date().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i));
  const r = monthlyReport(state, month);
  const hr = tab === '근태', stock = tab === '재고';
  const bars = hr
    ? r.depts.map(d => ({ label: d.dept, a: d.leave, b: d.overtime / 8 }))
    : r.now.weeks.map((w, i) => ({ label: `${i + 1}주차`, a: stock ? w.in : w.purchase, b: stock ? w.out : w.sales }));
  const max = Math.max(1, ...bars.flatMap(b => [b.a, b.b]));

  return (
    <>
      <PageHead title="리포트" sub="고른 달의 구매 · 판매, 재고 흐름, 근태를 장부와 입출고 기록에서 바로 집계해 지난달과 비교해요." />
      <Card>
        <Toolbar>
          <Tabs options={tabs} value={tab} onChange={setTab} />
          <ToolbarField label="기간">
            <select value={month} onChange={e => setMonth(e.target.value)} className={bareSelect}>{months.map(m => <option key={m} value={m}>{m}</option>)}</select>
          </ToolbarField>
        </Toolbar>
        <div className="p-4 sm:p-6">
          <Stats>
            {hr ? (
              <>
                <Stat label="재직 인원" value={r.hr.headcount} unit="명" foot={`입사 ${r.hr.joined} · 퇴사 ${r.hr.left}`} />
                <Stat label="휴가 사용" value={r.hr.leave} unit="일" foot={`지난달 ${r.hrPrev.leave}일`} tone="info" />
                <Stat label="연장 · 야간 · 휴일 근무" value={r.hr.overtime} unit="시간" foot={`지난달 ${r.hrPrev.overtime}시간`} tone={r.hr.overtime > r.hrPrev.overtime ? 'warn' : undefined} />
                <Stat label="휴가 승인 대기" value={r.depts.reduce((t, d) => t + d.pending, 0)} unit="건" foot="결재함" />
              </>
            ) : stock ? (
              <>
                <Stat label="월말 재고 평가액" value={money(r.stockValue)} unit="" foot="이동평균 원가 · 수불부 기준" />
                <Stat label="입고 금액" value={money(r.now.inValue)} unit="" foot={`지난달 대비 ${change(r.now.inValue, r.prev.inValue)}`} tone="info" />
                <Stat label="출고 원가" value={money(r.now.out)} unit="" foot={`판매 · 생산 투입 · 지난달 대비 ${change(r.now.out, r.prev.out)}`} />
                <Stat label="안전재고 미만" value={r.types.reduce((t, x) => t + x.low, 0)} unit="개" foot="지금 기준" tone={r.types.some(x => x.low) ? 'warn' : 'ok'} />
              </>
            ) : (
              <>
                <Stat label="구매 금액" value={money(r.now.purchase)} unit="" foot={`입고 원가 + 매입 거래 · ${change(r.now.purchase, r.prev.purchase)}`} />
                <Stat label="매출액" value={money(r.now.sales)} unit="" foot={`부가세 제외 · ${change(r.now.sales, r.prev.sales)}`} tone="info" />
                <Stat label="출고 건수" value={r.now.shipments} unit="건" foot={`지난달 ${r.prev.shipments}건`} />
                <Stat label="매출 − 구매" value={money(r.now.sales - r.now.purchase)} unit="" foot="현금 흐름 아님 · 대략적 차이" tone={r.now.sales >= r.now.purchase ? 'ok' : 'warn'} />
              </>
            )}
          </Stats>
          <div className="mb-5 rounded-card border border-line p-5">
            <div className="flex items-start justify-between gap-2.5 sm:items-center">
              <h2 className="text-title font-medium">{hr ? '부서별 휴가 · 연장근무' : stock ? '주차별 입고 · 출고 금액' : '주차별 구매 입고 · 판매'}</h2>
              <span className="text-tiny text-accent">● {hr ? '휴가 (일)' : stock ? '입고' : '구매'} <span className="ml-2.5 text-subtle">● {hr ? '연장근무 (일 환산)' : stock ? '출고' : '판매'}</span></span>
            </div>
            <div className="mt-4 flex h-52 justify-around gap-3 border-b border-line">
              {bars.map(b => (
                <div key={b.label} className="flex flex-1 flex-col items-center justify-end">
                  <div className="flex h-44 w-full items-end justify-center gap-1.5">
                    <span className="w-5 rounded-t bg-accent sm:w-7" style={{ height: `${(b.a / max) * 100}%` }} title={hr ? `${b.a}일` : money(b.a)} />
                    <span className="w-5 rounded-t bg-accent-soft sm:w-7" style={{ height: `${(b.b / max) * 100}%` }} title={hr ? `${b.b * 8}시간` : money(b.b)} />
                  </div>
                  <small className="pt-2 text-tiny text-subtle">{b.label}</small>
                </div>
              ))}
            </div>
          </div>
          {hr ? (
            <DataTable headers={['부서', '인원', '휴가 사용 (일)', '연장 · 야간 · 휴일 (시간)', '휴가 승인 대기']} rows={r.depts.map(d => [d.dept, `${d.people}명`, d.leave, d.overtime, d.pending])} />
          ) : stock ? (
            <DataTable headers={['품목 유형', '관리 품목', '월말 재고 평가액', '안전재고 미만']} rows={r.types.map(t => [t.type, `${t.count}개`, money(t.value), `${t.low}개`])} />
          ) : (
            <DataTable
              headers={['구분', month, addMonths(month, -1), '변화']}
              rows={[
                ['구매 금액', money(r.now.purchase), money(r.prev.purchase), change(r.now.purchase, r.prev.purchase)],
                ['매출액', money(r.now.sales), money(r.prev.sales), change(r.now.sales, r.prev.sales)],
                ['출고 건수', `${r.now.shipments}건`, `${r.prev.shipments}건`, `${r.now.shipments - r.prev.shipments >= 0 ? '+' : ''}${r.now.shipments - r.prev.shipments}건`],
                ['출고 원가', money(r.now.out), money(r.prev.out), change(r.now.out, r.prev.out)],
              ]}
            />
          )}
        </div>
      </Card>
      <Hint className="mt-4">손익 · 재무제표는 회계 › 출력물, 수입 · 비용 월별 표는 수입비용, 예산 대비 실적은 예산관리에서 볼 수 있어요.</Hint>
    </>
  );
}
