'use client';

import Link from 'next/link';
import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, ButtonLink, Card, CellSub, Dash, DataTable, FilterToolbar, NameCell, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import * as F from '@/lib/flow-core';
import { convertQuote, withVat } from '@/lib/finance';
import { money } from '@/lib/format';
import { href } from '@/lib/nav';

export default function QuotesPage() {
  const { state, mutate, toast } = useErp();
  const openForm = useOpenForm();
  const list = useListFilter();
  const today = F.date();
  const open = state.quotes.filter(q => q.status === '작성');
  const won = state.quotes.filter(q => q.status === '주문 전환');
  const decided = state.quotes.filter(q => q.status !== '작성');

  const convert = (id: string) => {
    try {
      const s = mutate(d => convertQuote(d, id));
      toast(`주문 ${s.id}로 전환했어요. 판매 · 출고에서 출고할 수 있어요.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const rows = state.quotes
    .filter(q => (list.filter === '전체' || q.status === list.filter || (list.filter === '만료' && q.status === '작성' && q.validUntil < today)) && list.matches(q.id, q.customer, q.name))
    .map(q => {
      const expired = q.status === '작성' && q.validUntil < today;
      const amount = withVat(q.qty * q.price);
      return [
        <span key="id" className="font-mono text-caption">{q.id}</span>,
        <NameCell key="c" name={q.customer} sub={q.date} />,
        <NameCell key="n" name={q.name} sub={`${q.qty} × ${money(q.price)}`} />,
        <>{money(amount.total)}<CellSub>공급가 {money(amount.supply)}</CellSub></>,
        <span key="v" className={expired ? 'text-danger' : ''}>{q.validUntil}{expired && <CellSub className="text-danger">유효기간 지남</CellSub>}</span>,
        <>
          <Pill>{expired ? '만료' : q.status}</Pill>
          {q.saleId && <CellSub><Link href={href('sales')} className="hover:text-accent">→ {q.saleId}</Link></CellSub>}
          {q.reason && <CellSub>{q.reason}</CellSub>}
        </>,
        <span key="a" className="flex items-center gap-1.5">
          <ButtonLink href={`/print/quote/${q.id}`}>인쇄</ButtonLink>
          {q.status === '작성' && !expired && <Button variant="primary" onClick={() => convert(q.id)}>주문 전환</Button>}
          {q.status === '작성' && <Button variant="text" onClick={() => openForm('rejectQuote', q.id)}>거절</Button>}
          {q.status !== '작성' && !q.saleId && <Dash />}
        </span>,
      ];
    });

  return (
    <>
      <PageHead title="견적 관리" sub="견적서를 보내고, 고객이 수락하면 한 번에 판매 주문으로 전환하세요." action={<Button variant="primary" onClick={() => openForm('quote')}>＋ 견적서 작성</Button>} />
      <Stats>
        <Stat label="진행 중 견적" value={open.length} unit="건" foot={`합계 ${money(open.reduce((s, q) => s + withVat(q.qty * q.price).total, 0))}`} tone="info" />
        <Stat label="이번 주 만료" value={open.filter(q => q.validUntil >= today && Date.parse(q.validUntil) - Date.parse(today) <= 7 * 86400000).length} unit="건" foot="7일 이내 유효기간 종료" tone="warn" />
        <Stat label="주문 전환" value={won.length} unit="건" foot="견적에서 주문으로" tone="ok" />
        <Stat label="수주율" value={decided.length ? Math.round((won.length / decided.length) * 100) : 0} unit="%" foot="결정된 견적 중 전환 비율" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '작성', '주문 전환', '거절', '만료']} list={list} placeholder="견적 번호, 고객사, 품목 검색" />
        <DataTable headers={['견적 번호', '고객사', '품목', '견적 금액', '유효기간', '상태', '처리']} rows={rows} />
      </Card>
    </>
  );
}
