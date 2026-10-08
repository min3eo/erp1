'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, Card, CellSub, DataTable, FilterToolbar, NameCell, PageHead, Pill, useListFilter } from '@/components/ui';

export default function MovementsPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const rows = state.movements
    .filter(m => (list.filter === '전체' || m.type === list.filter) && list.matches(m.ref, m.name, m.code, m.warehouse))
    .map(m => [
      m.date,
      <>
        <Pill>{m.type}</Pill>
        {m.cancelled && <CellSub className="text-warn">취소됨 · 원본 보존</CellSub>}
      </>,
      <NameCell key="n" name={m.name} sub={`${m.code} · ${m.warehouse}${m.stockType === '불량' ? ' · 불량 보관' : ''}`} />,
      <strong key="q" className={m.qty < 0 ? 'text-warn' : 'text-accent'}>
        {m.qty > 0 ? '+' : ''}
        {m.qty} {m.unit}
      </strong>,
      <>
        {m.before} → <strong>{m.after}</strong>
      </>,
      m.ref,
      m.note,
      ['구매 입고', '판매 출고'].includes(m.type) && !m.cancelled ? <Button key="a" onClick={() => openForm('cancelMovement', m.id)}>취소</Button> : '—',
    ]);

  return (
    <>
      <PageHead title="입출고 이력" sub="재고가 언제, 어떤 거래로 바뀌었는지 확인하세요." />
      <Card>
        <FilterToolbar tabs={['전체', '구매 입고', '판매 출고', '생산 출고', '생산 입고', '판매 반품', '구매 반품', '재고 조정', '입고 취소', '출고 취소', '기초 재고']} list={list} />
        <DataTable headers={['처리일', '구분', '품목 · 창고', '변동 수량', '이전 → 이후', '관련 문서', '사유', '처리']} rows={rows} />
      </Card>
    </>
  );
}
