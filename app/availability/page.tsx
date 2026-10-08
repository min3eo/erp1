'use client';

import { useErp } from '@/components/erp-provider';
import { Card, DataTable, Hint, NameCell, PageHead, PreviewNotice, Stat, Stats } from '@/components/ui';
import * as F from '@/lib/flow-core';

export default function AvailabilityPage() {
  const { state } = useErp();
  return (
    <>
      <PageHead title="가용재고" sub="보유 재고와 주문 예약을 구분해 출고 가능한 수량을 확인하세요." />
      <PreviewNotice />
      <Stats>
        <Stat label="관리 품목" value={state.items.length} unit="개" foot="현재 시안 품목" />
        <Stat label="예약 품목" value={state.items.filter(i => i[4] > 0).length} unit="개" foot="예약 수량은 화면 예시" tone="blue" />
        <Stat label="부족 품목" value={state.items.filter(i => i[4] < i[5]).length} unit="개" foot="안전재고 미만" tone="orange" />
        <Stat label="예약 기준" value="출고 전" unit="" foot="주문 확정 시 예약하는 예시" />
      </Stats>
      <Card>
        <DataTable
          headers={['품목', '창고', '보유 정상재고', '예약 수량', '가용재고', '불량 보관', '단위']}
          rows={state.items.map(i => {
            const reserved = Math.min(i[4], Math.ceil(i[4] * 0.2));
            return [
              <NameCell key="n" name={i[1]} sub={i[0]} />,
              i[3], i[4], reserved,
              <strong key="a" className="text-accent">{F.round(i[4] - reserved)}</strong>,
              state.quarantine[i[0]] || 0,
              F.unit(i),
            ];
          })}
        />
      </Card>
      <Hint className="mt-5">가용재고 = 정상 보유 재고 − 예약 수량. 예약 수량은 시각적 예시이며 실제 주문 예약 기능은 연결하지 않았습니다.</Hint>
    </>
  );
}
