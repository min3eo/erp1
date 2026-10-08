'use client';

import { useErp } from '@/components/erp-provider';
import { Card, CellSub, DataTable, FilterToolbar, Hint, NameCell, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { availability } from '@/lib/operations-report';

export default function AvailabilityPage() {
  const { state } = useErp();
  const list = useListFilter();
  const rows = availability(state);
  const short = rows.filter(r => r.available < 0);
  const low = rows.filter(r => r.available >= 0 && r.available < r.safety);

  return (
    <>
      <PageHead title="가용재고" sub="보유 재고에서 아직 출고하지 않은 판매 주문과 계획된 생산의 자재를 예약으로 빼고, 발주 · 생산 중인 수량을 더해 약속할 수 있는 수량을 보여줘요." />
      <Stats>
        <Stat label="관리 품목" value={rows.length} unit="개" foot={`예약 걸린 품목 ${rows.filter(r => r.reserved > 0).length}개`} />
        <Stat label="예약 수량 있는 품목" value={rows.filter(r => r.reserved > 0).length} unit="개" foot="판매 주문 · 생산 계획" tone="info" />
        <Stat label="가용 부족" value={short.length} unit="개" foot={short.map(r => r.name).slice(0, 2).join(', ') || '없어요'} tone={short.length ? 'danger' : 'ok'} />
        <Stat label="안전재고 미만" value={low.length} unit="개" foot="가용 기준" tone={low.length ? 'warn' : undefined} />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '부족', '안전재고 미만']} list={list} placeholder="품목 이름 또는 코드" />
        <DataTable
          headers={['품목', '창고', '보유 재고', '판매 예약', '생산 자재 예약', '가용재고', '입고 · 생산 예정', '예상 가용', '불량 보관']}
          rows={rows
            .filter(r => (list.filter === '전체' || (list.filter === '부족' ? r.available < 0 : r.available < r.safety)) && list.matches(r.name, r.code))
            .map(r => [
              <NameCell key="n" name={r.name} sub={`${r.code} · ${r.type}`} />,
              r.warehouse,
              `${r.stock} ${r.unit}`,
              r.sales || '—',
              r.production || '—',
              <strong key="a" className={r.available < 0 ? 'text-danger' : r.available < r.safety ? 'text-warn' : 'text-accent'}>{r.available} {r.unit}</strong>,
              r.incoming || '—',
              <>{r.expected}<CellSub>{r.expected < r.safety ? <Pill tone="warn">발주 · 생산 필요</Pill> : ''}</CellSub></>,
              r.bad || '—',
            ])}
        />
      </Card>
      <Hint className="mt-5">가용재고 = 보유 정상재고 − (미출고 판매 주문 + 계획 상태 생산 지시의 자재 소요량). 예상 가용 = 가용재고 + 미입고 발주 + 생산 중 수량.</Hint>
    </>
  );
}
