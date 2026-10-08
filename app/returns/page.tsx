'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, Card, DataTable, FilterToolbar, Hint, PageHead, Pill, useListFilter } from '@/components/ui';

export default function ReturnsPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const rows = state.returns
    .filter(r => (list.filter === '전체' || list.filter === r.kind) && list.matches(r.name, r.ref, r.reason))
    .map(r => [r.date, <Pill key="k">{r.kind}</Pill>, r.name, `${r.qty} ${r.unit}`, <Pill key="g">{r.grade}</Pill>, r.ref, r.reason]);

  return (
    <>
      <PageHead
        title="반품 관리"
        sub="판매 반품은 검수 결과에 따라 정상 재고 또는 불량 보관으로 반영됩니다."
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openForm('purchaseReturn')}>＋ 구매 반품</Button>
            <Button variant="primary" onClick={() => openForm('saleReturn')}>＋ 판매 반품</Button>
          </div>
        }
      />
      <Hint>정상 판매 반품은 판매 가능한 재고로 돌아옵니다. 불량 반품은 별도로 보관하며 출고 가능한 수량에 포함하지 않습니다.</Hint>
      <Card>
        <FilterToolbar tabs={['전체', '판매 반품', '구매 반품']} list={list} />
        <DataTable headers={['처리일', '유형', '품목', '반품 수량', '검수 결과', '원래 거래', '사유']} rows={rows} />
      </Card>
    </>
  );
}
