'use client';

import { useState } from 'react';
import { FundOptions, Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, DetailField, DetailGrid, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { expenseAccounts, incomeAccounts, lastDay } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import {
  CURRENCIES, addCustoms, addFxDeal, deleteFxDeal, fxPosition, importUnitCost, revaluationPreview, revalueFx, settleFx, undoFxSettlement,
  type Currency, type FxDeal, type FxKind,
} from '@/lib/forex';

const fxText = (n: number, c: string) => `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${c}`;

export default function ForexPage() {
  const { state, openDrawer } = useErp();
  const act = useAction();
  const list = useListFilter();
  const today = date();
  const [adding, setAdding] = useState<FxKind | null>(null);
  const [toStock, setToStock] = useState(true);
  const [settling, setSettling] = useState<FxDeal | null>(null);
  const [customs, setCustoms] = useState<FxDeal | null>(null);
  const [revalue, setRevalue] = useState(false);

  const deals = state.books.fxDeals.map(d => ({ d, p: fxPosition(d) }));
  const open = deals.filter(x => x.p.openFx > 0);
  const sumBook = (k: FxKind) => open.filter(x => x.d.kind === k).reduce((t, x) => t + x.p.book, 0);
  const year = today.slice(0, 4);
  const fxGain = deals.flatMap(x => x.p.steps).filter(s => s.date.startsWith(year)).reduce((t, s) => t + s.diff, 0);
  const prevMonthEnd = lastDay(new Date(Date.parse(today) - Number(today.slice(8)) * 86400000).toISOString().slice(0, 7));
  const rates = state.books.fxRates;

  const history = (x: (typeof deals)[number]) => openDrawer(`${x.d.partner} · ${x.d.desc}`, (
    <>
      <DetailGrid>
        <DetailField label="거래" value={`${x.d.kind} · ${x.d.date}`} />
        <DetailField label="외화 금액" value={fxText(x.d.amount, x.d.currency)} />
        <DetailField label="거래일 환율 · 원화" value={`${x.d.rate.toLocaleString()} · ${money(Math.round(x.d.amount * x.d.rate))}`} />
        <DetailField label="남은 금액 · 장부가" value={`${fxText(x.p.openFx, x.d.currency)} · ${money(x.p.book)}`} />
        {x.d.customs && <DetailField label="통관 (관세 · 수입부가세)" value={`${money(x.d.customs.duty)} · ${money(x.d.customs.vat)} (${x.d.customs.date})`} />}
        {x.d.qty && <DetailField label="입고 단가" value={`${money(Math.round(importUnitCost(x.d)))} × ${x.d.qty}`} />}
      </DetailGrid>
      <DataTable
        compact
        foot={false}
        headers={['일자', '구분', '외화', '환율', '원화', '환차 · 환산 손익']}
        rows={x.p.steps.map(s => [s.date, s.kind, fxText(s.fxAmount, x.d.currency), s.rate?.toLocaleString() ?? '—', s.kind === '결제' ? money(s.cash) : money(s.bookPart), <span key="d" className={s.diff > 0 ? 'text-ok' : s.diff < 0 ? 'text-danger' : ''}>{money(s.diff)}</span>])}
      />
    </>
  ));

  return (
    <>
      <PageHead
        title="수출입 · 외화"
        sub="외화로 사고판 거래를 거래일 환율로 장부에 넣어요. 대금이 오갈 때 환율 차이는 외환차손익, 월말 · 연말에 남은 잔액은 외화환산손익으로 정리돼요. 수출은 영세율로 부가세 신고에 잡혀요."
        action={
          <>
            <Button onClick={() => setRevalue(true)}>외화 환산</Button>
            <Button onClick={() => setAdding('수입')}>수입 등록</Button>
            <Button variant="primary" onClick={() => setAdding('수출')}>수출 등록</Button>
          </>
        }
      />
      <Stats>
        <Stat label="받을 수출 대금" value={money(sumBook('수출'))} unit="" foot={`${open.filter(x => x.d.kind === '수출').length}건 · 장부가`} tone="info" />
        <Stat label="줄 수입 대금" value={money(sumBook('수입'))} unit="" foot={`${open.filter(x => x.d.kind === '수입').length}건 · 장부가`} />
        <Stat label={`${year} 환차 · 환산 손익`} value={money(fxGain)} unit="" foot="외환차익 − 차손 + 환산손익" tone={fxGain >= 0 ? 'ok' : 'danger'} />
        <Stat label="기말 환율" value={Object.keys(rates).length ? Object.entries(rates).map(([c, r]) => `${c} ${r}`).join(' · ') : '없음'} unit="" foot="마지막으로 환산한 환율" />
      </Stats>

      <Card>
        <FilterToolbar tabs={['전체', '수출', '수입', '미결제']} list={list} placeholder="거래처, 품목, 통화 검색" />
        <DataTable
          headers={['거래일', '구분', '거래처 · 내용', '외화 금액', '환율', '원화', '남은 금액', '장부가', '']}
          rows={deals
            .filter(x => (list.filter === '전체' || x.d.kind === list.filter || (list.filter === '미결제' && x.p.openFx > 0)) && list.matches(x.d.partner, x.d.desc, x.d.currency))
            .map(x => [
              x.d.date,
              <Pill key="k" tone={x.d.kind === '수출' ? 'ok' : 'info'}>{x.d.kind}</Pill>,
              <><strong className="font-medium text-ink">{x.d.partner}</strong><CellSub>{x.d.desc}{x.d.kind === '수입' && (x.d.customs ? ' · 통관 완료' : ' · 통관 비용 미입력')}</CellSub></>,
              fxText(x.d.amount, x.d.currency),
              x.d.rate.toLocaleString(),
              money(Math.round(x.d.amount * x.d.rate)),
              x.p.openFx ? fxText(x.p.openFx, x.d.currency) : <Pill key="o" tone="ok">결제 완료</Pill>,
              money(x.p.book),
              <span key="a" className="flex gap-0.5">
                <Button variant="text" onClick={() => history(x)}>내역</Button>
                {x.p.openFx > 0 && <Button variant="text" onClick={() => setSettling(x.d)}>{x.d.kind === '수출' ? '입금' : '송금'}</Button>}
                {x.d.kind === '수입' && <Button variant="text" onClick={() => setCustoms(x.d)}>통관 비용</Button>}
                {x.d.settlements.length > 0 && <Button variant="text" onClick={() => act(d => undoFxSettlement(d, x.d.id), '마지막 결제를 취소했어요.')}>결제 취소</Button>}
                {!x.d.settlements.length && !x.d.revaluations.length && <Button variant="text" onClick={() => act(d => deleteFxDeal(d, x.d.id), '외화 거래를 지웠어요.')}>삭제</Button>}
              </span>,
            ])}
        />
      </Card>
      <Hint className="mt-4">환율은 서울외국환중개 매매기준율을 쓰는 게 일반적이에요. 수출 영세율은 수출신고필증 · 선적일 기준이니, 실제 신고 때 수출실적명세서와 맞춰 보세요.</Hint>

      <ModalForm
        open={!!adding}
        onClose={() => setAdding(null)}
        title={`${adding ?? ''} 등록`}
        done={adding === '수출' ? '수출을 등록했어요. 영세율 매출로 잡혔어요.' : '수입을 등록했어요.'}
        run={(d, f) => addFxDeal(d, { kind: adding!, date: f.date, partner: f.partner, desc: f.desc, currency: f.currency, amount: f.amount, rate: f.rate, account: adding === '수입' && toStock ? '재고자산' : f.account, itemCode: f.itemCode, qty: f.qty })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field name="partner" label="해외 거래처" placeholder="예) Glow Beauty Pte. Ltd." />
          <Field name="date" label={adding === '수출' ? '선적일' : '입고일'} type="date" defaultValue={today} />
        </div>
        <Field name="desc" label="품목 · 내용" placeholder={adding === '수출' ? '예) 모이스처 크림 수출 (FOB 인천)' : '예) 원료 수입'} />
        <div className="grid grid-cols-3 gap-3">
          <Select name="currency" label="통화" defaultValue="USD"><Options values={CURRENCIES} /></Select>
          <Field name="amount" label="외화 금액" type="number" step="0.01" min={0.01} />
          <Field name="rate" label="환율 (1단위당 원)" type="number" step="0.01" min={0.01} defaultValue={rates.USD ?? 1380} />
        </div>
        {adding === '수출' && <Select name="account" label="수익 계정" defaultValue="매출"><Options values={incomeAccounts(state)} /></Select>}
        {adding === '수입' && (
          <>
            <label className="my-3 flex items-center gap-2 text-caption font-medium text-ink-2">
              <input type="checkbox" checked={toStock} onChange={e => setToStock(e.target.checked)} className="size-4 accent-accent" />
              재고로 입고 (원료 · 상품)
            </label>
            {toStock ? (
              <div className="grid grid-cols-2 gap-3">
                <Select name="itemCode" label="품목">{state.items.map(i => <option key={i[0]} value={i[0]}>{i[1]}</option>)}</Select>
                <Field name="qty" label="수량" type="number" step="0.001" min={0.001} />
              </div>
            ) : (
              <Select name="account" label="비용 · 자산 계정" defaultValue="지급수수료"><Options values={[...expenseAccounts(state), '유형자산']} /></Select>
            )}
          </>
        )}
      </ModalForm>

      <ModalForm
        open={!!settling}
        onClose={() => setSettling(null)}
        title={settling?.kind === '수출' ? '수출 대금 입금' : '수입 대금 송금'}
        submitLabel="기록"
        done="결제를 기록하고 환차손익을 반영했어요."
        run={(d, f) => settleFx(d, settling!.id, { date: f.date, amount: f.amount, rate: f.rate, fund: f.fund })}
      >
        {settling && (
          <>
            <p className="text-body text-muted">남은 금액 {fxText(fxPosition(settling).openFx, settling.currency)} · 장부가 {money(fxPosition(settling).book)}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field name="date" label="결제일" type="date" defaultValue={today} />
              <Field name="amount" label={`금액 (${settling.currency})`} type="number" step="0.01" min={0.01} defaultValue={fxPosition(settling).openFx} />
              <Field name="rate" label="그날 환율" type="number" step="0.01" min={0.01} defaultValue={settling.rate} />
            </div>
            <Select name="fund" label="계좌" defaultValue="BANK-1"><FundOptions funds={state.books.funds} kinds={['계좌']} /></Select>
          </>
        )}
      </ModalForm>

      <ModalForm open={!!customs} onClose={() => setCustoms(null)} title="수입 통관 비용" submitLabel="저장" done="관세는 원가에, 수입부가세는 매입세액에 넣었어요." run={(d, f) => addCustoms(d, customs!.id, { date: f.date, duty: f.duty, vat: f.vat, fund: f.fund })}>
        <p className="text-body text-muted">세관에서 받은 수입세금계산서 기준으로 넣으세요. 관세는 {customs?.account === '재고자산' ? '입고 단가' : customs?.account}에 더해지고, 수입부가세는 부가세 신고 때 공제돼요.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field name="date" label="납부일" type="date" defaultValue={customs?.customs?.date ?? today} />
          <Field name="duty" label="관세 (원)" type="number" min={0} defaultValue={customs?.customs?.duty ?? 0} />
          <Field name="vat" label="수입부가세 (원)" type="number" min={0} defaultValue={customs?.customs?.vat ?? 0} />
        </div>
        <Select name="fund" label="낸 계좌" defaultValue={customs?.customs?.fund ?? 'BANK-1'}><FundOptions funds={state.books.funds} kinds={['계좌', '현금']} /></Select>
      </ModalForm>

      <ModalForm open={revalue} onClose={() => setRevalue(false)} title="외화 환산" submitLabel="환산 반영" done="남은 외화 잔액을 기말 환율로 환산했어요." run={(d, f) => revalueFx(d, f.date, Object.fromEntries(CURRENCIES.map(c => [c, f[c]])))}>
        <p className="text-body text-muted">월말이나 연말 매매기준율로 아직 결제되지 않은 외화 채권 · 채무를 다시 평가해요. 같은 날짜로 다시 하면 덮어써요.</p>
        <Field name="date" label="환산 기준일" type="date" defaultValue={prevMonthEnd} />
        <div className="grid grid-cols-2 gap-3">
          {CURRENCIES.filter(c => open.some(x => x.d.currency === c)).map(c => <Field key={c} name={c} label={`${c} 환율`} type="number" step="0.01" min={0.01} defaultValue={rates[c as Currency] ?? open.find(x => x.d.currency === c)?.d.rate} />)}
        </div>
        <RevaluePreview at={prevMonthEnd} />
      </ModalForm>
    </>
  );
}

/** What the revaluation would do at the last saved rates, so the user sees which balances are open. */
function RevaluePreview({ at }: { at: string }) {
  const { state } = useErp();
  const rows = revaluationPreview(state, at, Object.fromEntries(CURRENCIES.map(c => [c, state.books.fxRates[c] ?? undefined])));
  if (!rows.length) return <p className="text-caption text-subtle">환산할 외화 잔액이 없어요.</p>;
  return (
    <ul className="mt-1 flex flex-col gap-1 rounded-lg border border-line bg-surface-2 p-3 text-caption">
      {rows.map(r => (
        <li key={r.deal.id} className="flex justify-between gap-3">
          <span className="truncate text-muted">{r.deal.partner} · {fxText(r.openFx, r.deal.currency)}</span>
          <span>장부가 {money(r.book)}</span>
        </li>
      ))}
    </ul>
  );
}
