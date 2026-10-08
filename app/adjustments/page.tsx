'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, Card, CardHead, DataTable, FilterToolbar, NameCell, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { unit } from '@/lib/flow-core';

export default function AdjustmentsPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const pending = state.adjustments.filter(a => a.status === '승인 대기').length;
  const rows = state.adjustments
    .filter(a => (list.filter === '전체' || a.status === list.filter) && list.matches(a.name, a.code, a.reason))
    .map(a => [
      a.date,
      <NameCell key="n" name={a.name} sub={a.warehouse} />,
      `${a.expected} ${a.unit}`,
      `${a.actual} ${a.unit}`,
      <strong key="d" className={a.delta < 0 ? 'text-warn' : 'text-accent'}>
        {a.delta > 0 ? '+' : ''}
        {a.delta}
      </strong>,
      a.reason,
      <Pill key="s">{a.status}</Pill>,
    ]);

  return (
    <>
      <PageHead
        title="재고 실사 · 조정"
        sub="실제 수량을 기록하고, 승인 후 시스템 재고에 반영하세요."
        action={<Button variant="primary" onClick={() => openForm('adjustment')}>＋ 실사 결과 등록</Button>}
      />
      <Stats>
        <Stat label="승인 대기" value={pending} unit="건" foot="승인 전에는 재고가 바뀌지 않아요" tone="orange" />
        <Stat label="조정 완료" value={state.adjustments.filter(a => a.status === '승인 완료').length} unit="건" foot="승인 내역은 이력에 기록" />
        <Stat label="불량 보관" value={Object.values(state.quarantine).filter(n => n > 0).length} unit="품목" foot="판매 재고와 분리" tone="orange" />
        <Stat label="전체 실사" value={state.adjustments.length} unit="건" foot="등록된 실사 기록" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '승인 대기', '승인 완료', '반려']} list={list} />
        <DataTable headers={['실사일', '품목 · 창고', '시스템 수량', '실제 수량', '차이', '사유', '상태']} rows={rows} />
      </Card>
      <Card className="mt-5.5">
        <CardHead title="불량 보관 현황" sub="정상 재고에서 제외" />
        <DataTable
          headers={['품목 코드', '품목명', '보관 창고', '불량 수량']}
          rows={state.items.filter(i => (state.quarantine[i[0]] || 0) > 0).map(i => [i[0], i[1], i[3], `${state.quarantine[i[0]]} ${unit(i)}`])}
        />
      </Card>
    </>
  );
}
