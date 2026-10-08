'use client';

import { useErp } from '@/components/erp-provider';
import { FlowProgress } from '@/components/flow';
import { useOpenForm } from '@/components/forms';
import { Button, ButtonLink, Card, Dash, DataTable, FilterToolbar, NameCell, PageHead, Pill, Stat, Stats, useListFilter, IdLink } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { PREVIEW_DOCUMENT_ID } from '@/lib/masters';
import { href } from '@/lib/nav';

export default function PurchasePage() {
  const { state, mutate, toast } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const count = (...statuses: string[]) => state.orders.filter(o => statuses.includes(o.status)).length;

  const place = (id: string) => {
    try {
      mutate(d => F.place(d, id));
      toast('발주했어요. 입고 관리에서 처리할 수 있습니다.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const rows = state.orders
    .filter(o => (list.filter === '전체' || o.status === list.filter) && list.matches(o.id, o.name, o.vendor))
    .map(o => {
      const item = state.items.find(i => i[0] === o.itemCode);
      const cancellable = ['승인 대기', '승인 완료', '발주 완료'].includes(o.status) && !o.received;
      return [
        <IdLink key="id" id={o.id} href={`/documents/${encodeURIComponent(o.id)}`} />,
        <NameCell key="n" name={o.name} sub={o.itemCode || '품목 연결 필요'} />,
        o.vendor,
        `${o.qty} / ${o.received} ${item ? F.unit(item) : ''}`,
        money(o.qty * o.price),
        <Pill key="s">{o.status}</Pill>,
        <span key="a" className="flex items-center gap-1">
          {o.status === '승인 대기' ? (
            <ButtonLink href={href('approval')}>결재함 이동</ButtonLink>
          ) : o.status === '승인 완료' ? (
            <Button variant="primary" onClick={() => place(o.id)}>발주하기</Button>
          ) : ['발주 완료', '부분 입고'].includes(o.status) ? (
            <Button disabled={!item} onClick={() => openForm('receipt', o.id)}>입고 처리</Button>
          ) : (
            <Dash />
          )}
          {cancellable && <Button variant="text" onClick={() => openForm('cancelOrder', o.id)}>취소</Button>}
          {['발주 완료', '부분 입고', '입고 완료'].includes(o.status) && <ButtonLink href={`/print/order/${o.id}`} variant="text">발주서</ButtonLink>}
        </span>,
      ];
    });

  return (
    <>
      <PageHead
        title="구매 관리"
        sub="요청을 승인하고 발주한 뒤, 받은 수량만큼 입고하세요."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/documents/${PREVIEW_DOCUMENT_ID}`}>다품목 문서 예시</ButtonLink>
            <Button variant="primary" onClick={() => openForm('purchase')}>＋ 구매 요청</Button>
          </div>
        }
      />
      <FlowProgress active={0} />
      <Stats>
        <Stat label="승인 대기" value={count('승인 대기')} unit="건" foot="담당자 확인 필요" tone="orange" />
        <Stat label="발주 준비" value={count('승인 완료')} unit="건" foot="승인 후 발주 진행" />
        <Stat label="입고 대기" value={count('발주 완료', '부분 입고')} unit="건" foot="부분 입고 포함" tone="blue" />
        <Stat label="입고 완료" value={count('입고 완료')} unit="건" foot="발주 수량 입고 완료" tone="green" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '승인 대기', '승인 완료', '발주 완료', '부분 입고', '입고 완료', '취소']} list={list} />
        <DataTable headers={['발주 번호', '품목', '거래처', '발주 / 입고', '금액', '상태', '다음 업무']} rows={rows} />
      </Card>
    </>
  );
}
