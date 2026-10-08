'use client';

import { useErp } from '@/components/erp-provider';
import { FlowProgress } from '@/components/flow';
import { useOpenForm } from '@/components/forms';
import { Button, Card, DataTable, FilterToolbar, NameCell, PageHead, Subtitle, useListFilter, IdLink } from '@/components/ui';
import * as F from '@/lib/flow-core';

export default function ReceiptPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const rows = state.orders
    .filter(o => ['발주 완료', '부분 입고'].includes(o.status) && list.matches(o.id, o.name, o.vendor) && (list.filter === '전체' || o.status === list.filter))
    .map(o => {
      const item = state.items.find(i => i[0] === o.itemCode);
      return [
        <IdLink key="id" id={o.id} href={`/documents/${encodeURIComponent(o.id)}`} />,
        <NameCell key="n" name={o.name} sub={item?.[3] || '품목 연결 필요'} />,
        o.vendor,
        o.qty,
        o.received,
        <strong key="r" className="text-accent">{F.round(o.qty - o.received)} {item ? F.unit(item) : ''}</strong>,
        <Button key="a" variant="primary" disabled={!item} onClick={() => openForm('receipt', o.id)}>입고 처리</Button>,
      ];
    });

  return (
    <>
      <PageHead title="입고 관리" sub="실제로 받은 수량을 입력하면 해당 품목의 재고가 늘어납니다." />
      <FlowProgress active={3} />
      <Card>
        <FilterToolbar tabs={['전체', '발주 완료', '부분 입고']} list={list} />
        <DataTable headers={['발주 번호', '품목 · 창고', '거래처', '발주 수량', '입고 누계', '남은 수량', '처리']} rows={rows} />
      </Card>
      <Subtitle>기초 재고는 기존 보유 수량입니다. 이번 시안에서 처리한 입고만 추가 반영됩니다.</Subtitle>
    </>
  );
}
