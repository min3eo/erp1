'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Card, DataTable, PageHead, Pill, PreviewNotice, PreviewTabs, Stat, Stats } from '@/components/ui';
import { money } from '@/lib/format';

const tabs = ['구매 · 판매', '재고', '근태'] as const;
const bars = [45, 68, 52, 86, 74];

export default function ReportsPage() {
  const { state } = useErp();
  const [tab, setTab] = useState<(typeof tabs)[number]>('구매 · 판매');
  const hr = tab === '근태';
  const stock = tab === '재고';
  const stockValue = (items = state.items) => money(items.reduce((sum, i) => sum + i[4] * i[6], 0));

  return (
    <>
      <PageHead title="리포트" sub="업무 지표와 기간별 흐름을 한눈에 확인하세요." />
      <PreviewNotice />
      <Card>
        <PreviewTabs options={tabs} value={tab} onChange={setTab} />
        <div className="p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-2.5 text-body font-semibold">
            2026년 10월 <Pill tone="gray">월간 예시</Pill>
          </div>
          <Stats>
            {hr ? (
              <>
                <Stat label="근무 기록률" value="98.2" unit="%" foot="샘플 집계" />
                <Stat label="휴가 사용" value="12.5" unit="일" foot="이번 달 샘플" />
                <Stat label="정정 요청" value="3" unit="건" foot="처리 대기" />
                <Stat label="평균 근무" value="8" unit="시간" foot="일 평균" />
              </>
            ) : (
              <>
                <Stat label={stock ? '재고 평가액' : '구매 금액'} value={stock ? stockValue() : '₩12,800,000'} unit="" foot="월간 샘플" />
                <Stat label={stock ? '출고 금액' : '판매 금액'} value={stock ? '₩6,720,000' : '₩24,600,000'} unit="" foot="월간 샘플" tone="blue" />
                <Stat label="전월 대비" value="+12.4" unit="%" foot="비교 예시" tone="green" />
                <Stat label="확인 필요" value={stock ? '2' : '3'} unit="건" foot="미처리 업무" />
              </>
            )}
          </Stats>
          <div className="mb-5.5 rounded-card border border-accent-line p-6">
            <div className="flex items-start justify-between gap-2.5 sm:items-center">
              <h2 className="text-title font-semibold">{hr ? '부서별 근무 기록률' : stock ? '주차별 입출고' : '주차별 구매 · 판매'}</h2>
              <span className="max-w-25 text-tiny text-accent sm:max-w-none">
                ● {hr ? '근무 기록' : '구매 / 입고'} <span className="ml-2.5 text-subtle">● 판매 / 출고</span>
              </span>
            </div>
            <div className="flex h-58.75 justify-around gap-2.5 bg-[repeating-linear-gradient(to_top,var(--color-line)_0,var(--color-line)_1px,transparent_1px,transparent_50px)] pt-5 sm:gap-6.25 sm:px-5">
              {bars.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center justify-end">
                  <div className="flex h-45 w-full items-end justify-center gap-2">
                    <span className="w-3.75 max-w-[35%] rounded-t-[5px] bg-accent sm:w-7" style={{ height: `${v}%` }} />
                    {!hr && <span className="w-3.75 max-w-[35%] rounded-t-[5px] bg-accent-soft sm:w-7" style={{ height: `${Math.min(100, v + 13)}%` }} />}
                  </div>
                  <small className="w-full bg-surface pt-3 text-center text-tiny text-subtle">{hr ? ['경영지원', '구매', '물류', '운영', '개발'][i] : `${i + 1}주차`}</small>
                </div>
              ))}
            </div>
          </div>
          {hr ? (
            <DataTable
              headers={['부서', '구성원', '근무 기록률', '휴가 사용', '정정 대기']}
              rows={[['경영지원팀', '1명', '100%', '1일', '1건'], ['구매 · 물류', '2명', '98%', '2.5일', '1건'], ['운영 · 상품', '2명', '97%', '8일', '1건']]}
            />
          ) : stock ? (
            <DataTable
              headers={['품목 유형', '관리 품목', '현재 재고 평가액', '안전재고 미만']}
              rows={[...new Set(state.items.map(i => i[2]))].map(type => {
                const items = state.items.filter(i => i[2] === type);
                return [type, items.length + '개', stockValue(items), items.filter(i => i[4] < i[5]).length + '개'];
              })}
            />
          ) : (
            <DataTable
              headers={['구분', '이번 달', '지난 달', '변화']}
              rows={[['구매 금액', money(12800000), money(11387900), '+12.4%'], ['판매 금액', money(24600000), money(22360000), '+10.0%'], ['출고 건수', '148건', '132건', '+16건']]}
            />
          )}
        </div>
      </Card>
    </>
  );
}
