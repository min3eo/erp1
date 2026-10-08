'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Options } from '@/components/books-ui';
import { Button, ButtonLink, Card, CellSub, DataTable, Hint, PageHead, Pill, SearchInput, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { AMEND_REASONS, advanceInvoice, amendInvoice, bizNoOf, invoiceForDoc, invoiceTargets, type AmendReason, type TaxInvoice } from '@/lib/books';
import { money } from '@/lib/format';
import { quarterOf } from '@/lib/tax';
import { date } from '@/lib/flow-core';

const views = ['매출', '매입', '발행 대상'] as const;

export default function TaxInvoicesPage() {
  const { state } = useErp();
  const act = useAction();
  const [view, setView] = useState<(typeof views)[number]>('매출');
  const [query, setQuery] = useState('');
  const [amending, setAmending] = useState<TaxInvoice | null>(null);
  const [reason, setReason] = useState<AmendReason>('공급가액 변동');
  const invoices = state.books.invoices;
  const targets = invoiceTargets(state);
  const quarter = quarterOf(date());
  const inQuarter = invoices.filter(i => quarterOf(i.date) === quarter);
  const hit = (...v: string[]) => v.join(' ').includes(query);

  return (
    <>
      <PageHead
        title="전자(세금)계산서"
        sub="출고한 판매와 매출 거래로 세금계산서를 발행하고 국세청에 전송해요. 받은 매입 세금계산서도 함께 모아 부가세 신고 자료로 씁니다."
      />
      <Stats>
        <Stat label="발행 대기" value={invoices.filter(i => i.status === '발행 대기').length} unit="건" foot="매출 · 아직 발행 전" tone={invoices.some(i => i.status === '발행 대기') ? 'warn' : undefined} />
        <Stat label="국세청 미전송" value={invoices.filter(i => i.status === '발행 완료').length} unit="건" foot="발행 다음 날까지 전송" tone={invoices.some(i => i.status === '발행 완료') ? 'warn' : undefined} />
        <Stat label="이번 분기 매출 발행" value={money(inQuarter.filter(i => i.kind === '매출').reduce((t, i) => t + i.supply, 0))} unit="" foot={`${inQuarter.filter(i => i.kind === '매출').length}건 · 공급가`} tone="ok" />
        <Stat label="이번 분기 매입 수취" value={money(inQuarter.filter(i => i.kind === '매입').reduce((t, i) => t + i.supply, 0))} unit="" foot={`${inQuarter.filter(i => i.kind === '매입').length}건 · 공급가`} tone="info" />
      </Stats>
      <Card>
        <Toolbar>
          <Tabs options={views.map(v => (v === '발행 대상' ? `발행 대상 ${targets.length}` : v)) as readonly string[]} value={view === '발행 대상' ? `발행 대상 ${targets.length}` : view} onChange={v => setView(v.startsWith('발행 대상') ? '발행 대상' : (v as '매출' | '매입'))} />
          <SearchInput value={query} onChange={setQuery} placeholder="거래처, 품목, 번호 검색" />
        </Toolbar>
        {view === '발행 대상' ? (
          <DataTable
            headers={['거래일', '구분', '거래처', '관련 문서', '공급가액', '세액', '처리']}
            rows={targets.filter(t => hit(t.partner, t.name, t.docId)).map(t => [
              t.date,
              <Pill key="k" tone={t.kind === '매출' ? 'ok' : 'info'}>{t.kind}</Pill>,
              <><strong className="font-medium text-ink">{t.partner}</strong>{t.kind === '매출' && !bizNoOf(state, t.partner) && <CellSub className="text-warn">사업자번호 미등록</CellSub>}</>,
              <><span className="font-mono text-caption">{t.docId}</span><CellSub>{t.name}</CellSub></>,
              money(t.supply),
              money(Math.round(t.supply * 0.1)),
              <Button key="a" variant="primary" onClick={() => act(d => invoiceForDoc(d, t.kind, t.docId), t.kind === '매출' ? '세금계산서를 만들었어요. 발행 대기 상태예요.' : '받은 세금계산서로 등록했어요.')}>
                {t.kind === '매출' ? '세금계산서 작성' : '수취 등록'}
              </Button>,
            ])}
          />
        ) : (
          <DataTable
            headers={['작성일', '거래처', '품목 · 내용', '공급가액', '세액', '합계 금액', '상태', '처리']}
            rows={invoices.filter(i => i.kind === view && hit(i.partner, i.desc, i.ref, i.id)).map(i => [
              i.date,
              <><strong className="font-medium text-ink">{i.partner}</strong><CellSub className="font-mono">{bizNoOf(state, i.partner) || '사업자번호 없음'}</CellSub></>,
              <>{i.desc}<CellSub><span className="font-mono">{i.ref}</span> · {i.type ?? '세금계산서'}{i.amendOf && ' · 수정분'}</CellSub></>,
              money(i.supply),
              money(i.vat),
              <strong key="t" className="font-medium text-ink">{money(i.supply + i.vat)}</strong>,
              <Pill key="s">{i.status}</Pill>,
              <span key="a" className="flex gap-1.5">
                <ButtonLink href={`/print/taxinvoice/${i.id}`}>보기</ButtonLink>
                {i.status === '발행 대기' && <Button variant="primary" onClick={() => act(d => advanceInvoice(d, i.id), '세금계산서를 발행했어요. 국세청 전송을 기다려요.')}>발행</Button>}
                {i.status === '발행 완료' && <Button variant="primary" onClick={() => act(d => advanceInvoice(d, i.id), '국세청에 전송했어요.')}>국세청 전송</Button>}
                {!i.amendOf && (i.kind === '매입' || i.status !== '발행 대기') && <Button variant="text" onClick={() => setAmending(i)}>수정 발행</Button>}
              </span>,
            ])}
          />
        )}
      </Card>
      <ModalForm
        open={!!amending}
        onClose={() => setAmending(null)}
        title={amending?.kind === '매입' ? '받은 수정세금계산서 등록' : '수정세금계산서 발행'}
        submitLabel="수정분 만들기"
        done="수정분을 만들고 장부에 반영했어요."
        run={(d, f) => amendInvoice(d, amending!.id, { reason: f.reason, supply: f.supply, date: f.date })}
      >
        {amending && (
          <>
            <p className="text-body text-muted">{amending.partner} · {amending.desc} · 원래 공급가액 {money(amending.supply)} ({amending.date})</p>
            <Select name="reason" label="수정 사유" value={reason} onChange={v => setReason(v as AmendReason)}><Options values={AMEND_REASONS} /></Select>
            <p className="-mt-1 text-caption text-muted">
              {{ '기재사항 착오': '처음 것을 전액 (−)로 취소하고 올바른 금액으로 다시 발행해요.', '공급가액 변동': '바뀐 만큼만 (+) 또는 (−)로 발행해요. 에누리 · 단가 조정이에요.', '환입': '반품된 금액만큼 (−)로 발행해요. 반품 처리는 반품 관리에서 먼저 하세요.', '계약 해제': '남은 금액 전체를 (−)로 발행해요.', '착오 이중발급': '잘못 한 번 더 발급한 계산서를 전액 (−)로 취소해요.' }[reason]}
            </p>
            {(reason === '기재사항 착오' || reason === '공급가액 변동' || reason === '환입') && (
              <Field key={reason} name="supply" label={reason === '기재사항 착오' ? '올바른 공급가액 (원)' : reason === '환입' ? '반품된 공급가액 (원)' : '바뀐 금액 (원, 줄면 −)'} type="number" min={reason === '공급가액 변동' ? -amending.supply : 1} />
            )}
            <Field name="date" label="작성일 (사유 발생일)" type="date" defaultValue={date()} />
          </>
        )}
      </ModalForm>
      <Hint className="mt-4">수정세금계산서는 원래 계산서를 지우지 않고 (+) · (−) 계산서를 새로 발행해 맞춰요. 시안에서는 실제 국세청 전송 없이 상태만 바뀌어요. 공급가액은 출고(입고) 수량에서 반품을 뺀 만큼이고, 이미 발행한 금액은 다시 잡히지 않아요.</Hint>
    </>
  );
}
