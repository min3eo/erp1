'use client';

import { useErp } from '@/components/erp-provider';
import { FlowProgress } from '@/components/flow';
import { useOpenForm } from '@/components/forms';
import { Button, ButtonLink, Card, CellSub, Dash, DataTable, FilterToolbar, NameCell, PageHead, Pill, Stat, Stats, Subtitle, useListFilter } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';

export default function SalesPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const count = (status: string) => state.sales.filter(s => s.status === status).length;
  const rows = state.sales
    .filter(s => (list.filter === '전체' || s.status === list.filter) && list.matches(s.id, s.name, s.customer))
    .map(s => {
      const item = state.items.find(i => i[0] === s.itemCode);
      const ship = state.movements.find(m => m.ref === s.id && m.type === '판매 출고' && !m.cancelled);
      const late = s.due && s.status !== '출고 완료' && s.due < F.date();
      return [
        <span key="id" className="font-mono text-caption">{s.id}{s.quoteId && <CellSub>견적 {s.quoteId}</CellSub>}</span>,
        <NameCell key="n" name={s.name} sub={money(s.qty * s.price)} />,
        s.customer,
        `${s.qty} / ${s.shipped} ${item ? F.unit(item) : ''}`,
        item?.[4] ?? '—',
        <span key="d" className="text-caption">{s.due ? <span className={late ? 'text-danger' : ''}>납기 {s.due}{late ? ' · 지연' : ''}</span> : <span className="text-subtle">납기 없음</span>}{ship?.tracking && <CellSub>{ship.carrier} {ship.tracking}</CellSub>}</span>,
        <Pill key="s">{s.status}</Pill>,
        <span key="a" className="flex items-center gap-1.5">
          {s.status !== '출고 완료' && <Button variant="primary" onClick={() => openForm('ship', s.id)}>출고 처리</Button>}
          {s.shipped > 0 ? <ButtonLink href={`/print/statement/${s.id}`}>명세서</ButtonLink> : s.status === '출고 완료' && <Dash />}
        </span>,
      ];
    });

  return (
    <>
      <PageHead
        title="판매 · 출고"
        sub="고객 주문을 등록하고, 보유 재고에서 출고하세요."
        action={<><ButtonLink href="/quotes">견적에서 시작</ButtonLink><Button variant="primary" onClick={() => openForm('sale')}>＋ 판매 주문</Button></>}
      />
      <FlowProgress active={5} />
      <Stats>
        <Stat label="전체 주문" value={state.sales.length} unit="건" foot="등록된 판매 주문" />
        <Stat label="출고 대기" value={count('출고 대기')} unit="건" foot="재고 확보 전 주문 포함" tone="orange" />
        <Stat label="부분 출고" value={count('부분 출고')} unit="건" foot="남은 수량 확인" />
        <Stat label="출고 완료" value={count('출고 완료')} unit="건" foot="주문 수량 출고 완료" tone="green" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '출고 대기', '부분 출고', '출고 완료']} list={list} />
        <DataTable headers={['주문 번호', '품목', '고객사', '주문 / 출고', '현재 재고', '납기 · 배송', '상태', '처리']} rows={rows} />
      </Card>
      <Subtitle>주문 등록 시 재고는 변하지 않습니다. 출고를 확정할 때 차감됩니다.</Subtitle>
    </>
  );
}
