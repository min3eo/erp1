'use client';

import { depts } from '@/lib/hr';
import { budgetWarning } from '@/lib/budget';
import { AttachButton } from '@/components/attachments';
import Link from 'next/link';
import { useState } from 'react';
import { FundOptions, Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, Suggestions, inputClass, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { NON_DEDUCTIBLE, TAX_TYPES, TRADE_PROOFS, addTrade, deleteTrade, expenseAccounts, fundById, fundName, incomeAccounts, monthOf, partnerNames, type TaxType, type TradeKind } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { href } from '@/lib/nav';

export default function TradesPage() {
  const { state } = useErp();
  const act = useAction();
  const list = useListFilter();
  const [open, setOpen] = useState<TradeKind | null>(null);
  const month = monthOf(date());
  const thisMonth = state.books.trades.filter(t => monthOf(t.date) === month);
  const sum = (kind: TradeKind, k: 'supply' | 'vat') => thisMonth.filter(t => t.kind === kind).reduce((s, t) => s + t[k], 0);

  const rows = state.books.trades
    .filter(t => (list.filter === '전체' || t.kind === list.filter) && list.matches(t.partner, t.desc, t.account))
    .map(t => {
      const inv = state.books.invoices.find(i => i.id === t.invoiceId);
      return [
        t.date,
        <Pill key="k" tone={t.kind === '매출' ? 'ok' : 'info'}>{t.kind}</Pill>,
        <><strong className="font-medium text-ink">{t.partner}</strong><CellSub>{t.desc}</CellSub></>,
        <>{t.account}<CellSub>{t.taxType ?? '과세'} · {t.proof ?? (t.invoiceId ? '세금계산서' : '—')}{t.nonDeductible && <span className="text-warn"> · 불공제</span>}</CellSub></>,
        money(t.supply),
        money(t.vat),
        <strong key="t" className="font-medium text-ink">{money(t.supply + t.vat)}</strong>,
        fundName(state, t.settle),
        inv ? <Link key="i" href={href('taxInvoices')}><Pill>{inv.status}</Pill></Link> : <span key="i" className="text-subtle">없음</span>,
        <span key="d" className="flex"><AttachButton refId={t.id} title={`${t.partner} · ${t.desc}`} /><Button variant="text" onClick={() => act(d => deleteTrade(d, t.id), '거래를 지웠어요.')}>삭제</Button></span>,
      ];
    });

  return (
    <>
      <PageHead
        title="매출매입거래"
        sub="상품 외 매출 · 매입(임차료, 용역, 소모품 등)을 공급가와 부가세로 나눠 기록해요. 판매 · 구매 화면의 거래는 자동으로 장부에 들어가니 여기에 다시 넣지 않아도 돼요."
        action={
          <>
            <Button onClick={() => setOpen('매입')}>매입 입력</Button>
            <Button variant="primary" onClick={() => setOpen('매출')}>매출 입력</Button>
          </>
        }
      />
      <Stats>
        <Stat label="이번 달 매출 (공급가)" value={money(sum('매출', 'supply'))} unit="" foot={`매출세액 ${money(sum('매출', 'vat'))}`} tone="ok" />
        <Stat label="이번 달 매입 (공급가)" value={money(sum('매입', 'supply'))} unit="" foot={`매입세액 ${money(sum('매입', 'vat'))}`} tone="info" />
        <Stat label="외상 거래" value={state.books.trades.filter(t => t.settle === '외상').length} unit="건" foot="미수금 · 미지급금으로 기록" />
        <Stat label="적격증빙 없음" value={state.books.trades.filter(t => t.kind === '매입' && (t.proof === '영수증 없음' || (!t.proof && !t.invoiceId))).length} unit="건" foot="매입 · 영수증만 받은 거래" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '매출', '매입']} list={list} placeholder="거래처, 내용, 계정 검색" />
        <DataTable headers={['일자', '구분', '거래처 · 내용', '계정 · 과세 · 증빙', '공급가액', '세액', '합계 금액', '결제', '세금계산서', '']} rows={rows} />
      </Card>
      <Hint className="mt-4">면세 거래는 계산서로, 수출 같은 영세율은 세액 0으로 기록돼요. 세금계산서를 함께 만들면 매출은 ‘발행 대기’, 매입은 ‘수취 완료’로 전자(세금)계산서 화면에 올라가고 부가세 신고 자료에 들어가요.</Hint>

      <ModalForm
        open={!!open}
        onClose={() => setOpen(null)}
        title={`${open} 입력`}
        done={`${open}을 기록하고 장부에 반영했어요.`}
        run={(d, f) => addTrade(d, { kind: open!, date: f.date, partner: f.partner, desc: f.desc, account: f.account, supply: f.supply, settle: f.settle, taxType: f.taxType, proof: f.proof, nonDeductible: f.nonDeductible, dept: f.dept, project: f.project })}
      >
        <TradeFields kind={open ?? '매출'} />
      </ModalForm>
    </>
  );
}

function TradeFields({ kind }: { kind: TradeKind }) {
  const { state } = useErp();
  const [supply, setSupply] = useState(0);
  const [taxType, setTaxType] = useState<TaxType>('과세');
  const [settle, setSettle] = useState('외상');
  const [account, setAccount] = useState(kind === '매출' ? '매출' : '소모품비');
  const card = fundById(state, settle)?.kind === '카드';
  const proofs = TRADE_PROOFS.filter(p => (taxType === '면세' ? p !== '세금계산서' : p !== '계산서'));
  const vat = taxType === '과세' ? Math.round(supply * 0.1) : 0;
  const accounts = kind === '매출' ? incomeAccounts(state) : [...expenseAccounts(state), '재고자산', '유형자산'];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field name="date" label="거래일" type="date" defaultValue={date()} />
        <Select name="account" label="계정" value={account} onChange={setAccount}><Options values={accounts} /></Select>
      </div>
      <Field name="partner" label="거래처" list="trade-partners" />
      <Suggestions id="trade-partners" values={partnerNames(state)} />
      <Field name="desc" label="내용" placeholder={kind === '매출' ? '예) 10월 컨설팅 용역' : '예) 사무용품 구입'} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="dept" label="부서" optional list="trade-depts" />
        <Field name="project" label="프로젝트" optional list="trade-projects" />
      </div>
      <Suggestions id="trade-depts" values={depts(state)} />
      <Suggestions id="trade-projects" values={[...new Set([...state.collab.projects.map(p => p.name), ...state.books.trades.map(t => t.project ?? ''), ...state.books.vouchers.map(v => v.project ?? '')].filter(Boolean))]} />
      <label className="my-3 block text-caption font-medium text-ink-2">
        공급가액 (원)
        <input name="supply" type="number" required min={1} value={supply || ''} onChange={e => setSupply(Number(e.target.value))} className={inputClass} />
      </label>
      <p className="-mt-1.5 text-tiny text-subtle">부가세 {money(vat)} · 합계 {money(supply + vat)}{taxType !== '과세' && ` · ${taxType}라 부가세 없음`}</p>
      <div className="grid grid-cols-2 gap-3">
        <Select name="taxType" label="과세 유형" value={taxType} onChange={v => setTaxType(v as TaxType)}><Options values={TAX_TYPES} /></Select>
        <Select key={taxType + settle} name="proof" label="증빙" defaultValue={taxType === '면세' ? '계산서' : card ? '신용카드' : '세금계산서'}><Options values={proofs} /></Select>
      </div>
      {kind === '매입' && <BudgetNote account={account} amount={supply} />}
      {kind === '매입' && taxType === '과세' && (
        <label className="my-3 block text-caption font-medium text-ink-2">
          매입세액 불공제 사유 <span className="font-normal text-subtle">(공제받으면 비워 두세요)</span>
          <select key={account} name="nonDeductible" defaultValue={account === '접대비' ? '접대비 관련' : ''} className={inputClass}>
            <option value="">공제 대상</option>
            <Options values={NON_DEDUCTIBLE} />
          </select>
        </label>
      )}
      <Select name="settle" label={kind === '매출' ? '받는 방법' : '결제 방법'} value={settle} onChange={setSettle}>
        <option value="외상">외상 ({kind === '매출' ? '미수금' : '미지급금'})</option>
        <FundOptions funds={state.books.funds} kinds={kind === '매출' ? ['계좌', '현금'] : ['계좌', '현금', '카드']} />
      </Select>
      <p className="text-tiny text-subtle">증빙이 세금계산서 · 계산서면 {kind === '매출' ? '발행 대기로 만들어져요' : '받은 계산서로 기록돼요'}. 3만 원 넘는 매입은 적격증빙(세금계산서 · 계산서 · 카드 · 현금영수증)을 받아야 해요.</p>
    </>
  );
}

/** Shows the 예산 초과 warning for the account being entered. */
function BudgetNote({ account, amount }: { account: string; amount: number }) {
  const { state } = useErp();
  const note = amount ? budgetWarning(state, account, amount) : '';
  return note ? <p className="rounded-md bg-warn-soft px-3 py-2 text-caption text-warn">{note}</p> : null;
}
