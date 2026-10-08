'use client';

import { useState } from 'react';
import { PRIORITIES, addTask } from '@/lib/collab';
import { advanceLeft, settleDoc } from '@/lib/books';
import { PAYMENT_METHODS, balanceOf, checkCredit, createQuote, knownPartners, lastPrice, rejectQuote, withVat, type PaymentKind } from '@/lib/finance';
import { receiveInspected } from '@/lib/inventory';
import { updateSalary } from '@/lib/payroll';
import { createWorkOrder, reportOutput, requirements } from '@/lib/production';
import * as F from '@/lib/flow-core';
import type { ErpState, Item, Order, Sale } from '@/lib/flow-core';
import { useErp, type FormRequest, type FormType } from './erp-provider';
import { Field, FormShell, Select, Summary, dialogClass, inputClass } from './form-kit';
import { useModalDialog } from './use-modal-dialog';
import { Subtitle } from './ui';

const stepFor = (item?: Item) => (item && F.unit(item) === 'kg' ? '0.001' : '1');

function ItemSelect({ items, value, onChange }: { items: Item[]; value: string; onChange: (code: string) => void }) {
  return (
    <Select name="itemCode" label="품목" value={value} onChange={onChange}>
      {items.map(i => (
        <option key={i[0]} value={i[0]}>
          {i[1]} · {i[0]} ({F.unit(i)})
        </option>
      ))}
    </Select>
  );
}

function ItemForm() {
  return (
    <FormShell title="품목 등록" run={(d, f) => F.addItem(d, { name: f.name, type: f.type, stock: f.stock })}>
      <Field name="name" label="품목명" />
      <Select name="type" label="품목 유형">
        {['완제품', '원료', '부자재', '반제품', '상품'].map(t => <option key={t}>{t}</option>)}
      </Select>
      <Field name="stock" label="초기 재고" type="number" defaultValue={100} />
    </FormShell>
  );
}

function LeaveForm() {
  return (
    <FormShell
      title="휴가 신청"
      run={(d, f) => d.leaves.unshift({ name: '민서', dept: '경영지원팀', date: f.date, type: f.type, days: f.type === '연차' ? 1 : 0.5, status: '승인 대기' })}
    >
      <Select name="type" label="휴가 종류">
        {['연차', '오전 반차', '오후 반차'].map(t => <option key={t}>{t}</option>)}
      </Select>
      <Field name="date" label="휴가일" type="date" defaultValue="2026-10-08" />
    </FormShell>
  );
}

/**
 * Item + partner + quantity + price, where the price defaults to this partner's last price for the item
 * (per-customer pricing), falling back to the item's standard price.
 */
function PricedLine({ side, items, priceLabel, defaultQty = 10 }: { side: 'sale' | 'purchase'; items: Item[]; priceLabel: string; defaultQty?: number }) {
  const { state } = useErp();
  const [code, setCode] = useState(items[0]?.[0] ?? '');
  const [partner, setPartner] = useState('');
  const item = items.find(i => i[0] === code);
  const last = lastPrice(state, side, partner, code);
  const discount = state.books.partners.find(p => p.name === partner.trim())?.discount ?? 0;
  const suggested = last?.price ?? Math.round((item?.[6] ?? 0) * (1 - discount / 100));
  const step = stepFor(item);
  const listId = `partners-${side}`;
  return (
    <>
      <ItemSelect items={items} value={code} onChange={setCode} />
      <label className="my-3 block text-caption font-medium text-ink-2">
        {side === 'sale' ? '고객사' : '공급 거래처'}
        <input name={side === 'sale' ? 'customer' : 'vendor'} required list={listId} value={partner} onChange={e => setPartner(e.target.value)} autoComplete="off" className={inputClass} />
        <datalist id={listId}>{knownPartners(state, side).map(p => <option key={p} value={p} />)}</datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field name="qty" label="수량" type="number" defaultValue={defaultQty} min={step} step={step} />
        {/* Keyed so the default follows the chosen item and partner. */}
        <Field key={`${code}|${suggested}`} name="price" label={priceLabel} type="number" defaultValue={suggested} min={0} />
      </div>
      <p className="-mt-1.5 text-tiny text-subtle">
        {last ? <>단가는 <strong className="font-medium text-accent">{partner}</strong>의 {last.source.includes('단가표') ? '단가표' : '최근 거래 단가'}예요 · {last.source}</> : discount ? `기준 단가에서 ${partner} 기본 할인 ${discount}%를 뺐어요.` : '거래처별 단가가 없으면 품목 기준 단가를 넣어요.'}
      </p>
    </>
  );
}

function OrderForm({ kind }: { kind: 'purchase' | 'sale' }) {
  const { state } = useErp();
  const items = state.items.filter(i => kind === 'purchase' || ['완제품', '상품'].includes(i[2]));
  const sale = kind === 'sale';
  return (
    <FormShell
      title={sale ? '판매 주문' : '구매 요청'}
      run={(d, f) => (sale ? (checkCredit(d, f.customer, Number(f.qty) * Number(f.price)), F.sale(d, { itemCode: f.itemCode, customer: f.customer, qty: f.qty, price: f.price, due: f.due })) : F.purchase(d, { itemCode: f.itemCode, vendor: f.vendor, qty: f.qty, price: f.price }))}
    >
      <PricedLine side={kind} items={items} priceLabel={sale ? '판매 단가 (원)' : '구매 단가 (원)'} />
      {sale && <Field name="due" label="납기" type="date" optional />}
    </FormShell>
  );
}

function WorkOrderForm() {
  const { state } = useErp();
  const products = state.items.filter(i => state.boms.some(b => b.productCode === i[0]));
  const [code, setCode] = useState(products[0]?.[0] ?? '');
  const [qty, setQty] = useState(100);
  const item = products.find(i => i[0] === code);
  const need = requirements(state, { qty, lines: state.boms.find(b => b.productCode === code)?.lines ?? [] });
  return (
    <FormShell title="생산 지시" submitLabel="생산 지시 등록" done="생산 지시를 등록했어요. 자재를 출고하면 생산이 시작돼요." run={(d, f) => createWorkOrder(d, { productCode: f.itemCode, qty: f.qty, due: f.due })}>
      <ItemSelect items={products} value={code} onChange={setCode} />
      <div className="grid grid-cols-2 gap-3">
        <label className="my-3 block text-caption font-medium text-ink-2">
          생산 수량 ({item ? F.unit(item) : 'EA'})
          <input name="qty" type="number" required min={stepFor(item)} step={stepFor(item)} value={qty} onChange={e => setQty(Number(e.target.value))} className={inputClass} />
        </label>
        <Field name="due" label="완료 예정일" type="date" defaultValue="2026-10-14" />
      </div>
      <div className="rounded-lg border border-line">
        <p className="border-b border-line px-3 py-2 text-caption text-muted">필요 자재 (BOM 기준)</p>
        <ul className="divide-y divide-line text-body">
          {need.map(r => (
            <li key={r.code} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span>{r.name}</span>
              <span className={r.short ? 'text-danger' : 'text-muted'}>{r.need} / 보유 {r.stock} {r.unit}{r.short ? ` · ${r.short} 부족` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    </FormShell>
  );
}

function OutputForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const wo = state.workOrders.find(w => w.id === req.ref)!;
  const item = state.items.find(i => i[0] === wo.productCode);
  const left = F.round(wo.qty - wo.produced);
  return (
    <FormShell title="생산 실적 등록" submitLabel="실적 등록" done="생산 실적을 등록하고 재고에 반영했어요." run={(d, f) => reportOutput(d, wo.id, f.qty, req.token)}>
      <Summary title={wo.name} sub={`${wo.id} · ${wo.lot}`} rows={[['지시 수량', `${wo.qty}`], ['완료 수량', `${wo.produced}`], ['남은 수량', `${left} ${item ? F.unit(item) : ''}`]]} />
      <Field name="qty" label="이번 실적 수량" type="number" defaultValue={left} min={stepFor(item)} step={stepFor(item)} max={left} />
    </FormShell>
  );
}

function SalaryForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const s = state.salaries.find(x => x.name === req.ref)!;
  return (
    <FormShell title={`${s.name} 급여 정보`} submitLabel="저장" done="급여 정보를 저장했어요." run={(d, f) => updateSalary(d, s.name, { base: f.base, allowance: f.allowance, dependents: f.dependents, car: f.car, childcare: f.childcare })}>
      <Field name="base" label="기본급 (월, 원)" type="number" defaultValue={s.base} min={0} />
      <Field name="allowance" label="직책 · 기타 수당 (월, 원)" type="number" defaultValue={s.allowance} min={0} />
      <div className="grid grid-cols-2 gap-3">
        <Field name="car" label="자가운전보조금 (비과세)" type="number" defaultValue={s.car ?? 0} min={0} />
        <Field name="childcare" label="육아수당 (비과세)" type="number" defaultValue={s.childcare ?? 0} min={0} />
      </div>
      <Field name="dependents" label="부양가족 수 (본인 포함)" type="number" defaultValue={s.dependents} />
      <Subtitle>식대 {s.meal.toLocaleString()}원 · 자가운전보조금 · 6세 이하 자녀 육아수당은 각각 월 20만 원까지 비과세로 계산해요.</Subtitle>
    </FormShell>
  );
}

function StockForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const receipt = req.type === 'receipt';
  const row = (receipt ? state.orders : state.sales).find(o => o.id === req.ref)!;
  const item = state.items.find(i => i[0] === row.itemCode)!;
  const u = F.unit(item);
  const remaining = F.round(row.qty - (receipt ? (row as Order).received : (row as Sale).shipped));
  const word = receipt ? '입고' : '출고';
  return (
    <FormShell
      title={receipt ? '구매 입고 처리' : '판매 출고 처리'}
      submitLabel={`${word} 확정`}
      done={receipt ? '입고를 확정하고 재고에 반영했어요.' : '출고를 확정하고 재고를 차감했어요.'}
      run={(d, f) => {
        if (receipt) return receiveInspected(d, req.ref!, { qty: f.qty, rejected: f.rejected, reason: f.reason, lot: f.lot, expiry: f.expiry }, req.token);
        const m = F.ship(d, req.ref!, f.qty, req.token);
        if (f.carrier) m.carrier = f.carrier;
        if (f.tracking?.trim()) m.tracking = f.tracking.trim();
        return m;
      }}
    >
      <Summary title={row.name} sub={req.ref} rows={[[`남은 ${word} 수량`, `${remaining} ${u}`], [`${item[3]} 현재 재고`, `${item[4]} ${u}`], ...(!receipt && (row as Sale).due ? [['납기', (row as Sale).due!] as [string, string]] : [])]} />
      <Field
        name="qty"
        label={`이번 ${word} 수량 (${u})`}
        type="number"
        min={stepFor(item)}
        step={stepFor(item)}
        max={remaining}
        defaultValue={receipt ? remaining : Math.min(remaining, item[4]) || 1}
      />
      {receipt ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field name="rejected" label={`검사 불합격 (${u})`} type="number" min={0} step={stepFor(item)} defaultValue={0} optional />
            <Field name="reason" label="불합격 사유" optional placeholder="예) 포장 파손" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field name="lot" label="제조번호 (LOT)" optional placeholder={`${req.ref}-자동`} />
            <Field name="expiry" label="유통기한" type="date" optional />
          </div>
          <Subtitle>{state.inv.meta[item[0]]?.inspect ? '입고 검사 대상 품목이에요. ' : ''}합격 수량만 재고에 들어가고, 불합격분은 발주 잔량으로 남아요. 유통기한을 비우면 품목의 유통기한 일수로 계산해요.</Subtitle>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select name="carrier" label="택배사 · 배송" defaultValue="CJ대한통운">{['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '직접 배송', '화물'].map(c => <option key={c}>{c}</option>)}</Select>
            <Field name="tracking" label="송장번호" optional />
          </div>
          <Subtitle>보유 재고를 초과하는 출고는 처리되지 않아요. 유통기한이 빠른 LOT부터 나가요(FEFO).</Subtitle>
        </>
      )}
    </FormShell>
  );
}

function CancelOrderForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const o = state.orders.find(o => o.id === req.ref)!;
  return (
    <FormShell title="구매 요청 · 발주 취소" submitLabel="취소 확정" run={(d, f) => F.cancelOrder(d, req.ref!, f.reason)}>
      <Summary title={o.name} sub={`${o.id} · ${o.status}`}>재고는 변하지 않으며, 취소 사유가 남습니다.</Summary>
      <Field name="reason" label="취소 사유" />
    </FormShell>
  );
}

function CancelMovementForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const m = state.movements.find(m => m.id === req.ref)!;
  return (
    <FormShell title={m.type === '구매 입고' ? '입고 취소' : '출고 취소'} submitLabel="취소 확정" run={(d, f) => F.cancelMovement(d, req.ref!, f.reason, req.token)}>
      <Summary title={m.name} sub={m.ref} rows={[['되돌릴 수량', `${-m.qty > 0 ? '+' : ''}${-m.qty} ${m.unit}`]]} />
      <Subtitle>원래 기록은 유지하고, 반대 수량의 취소 이력을 추가합니다.</Subtitle>
      <Field name="reason" label="취소 사유" />
    </FormShell>
  );
}

const returnKind = (type: FormType): F.ReturnKind => (type === 'saleReturn' ? '판매 반품' : '구매 반품');
const returnDocs = (state: ErpState, kind: F.ReturnKind): (Order | Sale)[] =>
  (kind === '판매 반품' ? state.sales : state.orders).filter(d => d.itemCode && F.returnAvailable(state, d, kind) > 0);

function ReturnForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const kind = returnKind(req.type);
  const docs = returnDocs(state, kind);
  const [ref, setRef] = useState(docs[0]?.id ?? '');
  const doc = docs.find(d => d.id === ref);
  const item = doc && state.items.find(i => i[0] === doc.itemCode);
  const step = stepFor(item);
  return (
    <FormShell title={kind + ' 등록'} submitLabel="반품 확정" run={(d, f) => F.returnGoods(d, { kind, ref: f.ref, qty: f.qty, reason: f.reason, grade: f.grade }, req.token)}>
      <Select name="ref" label="원래 거래" value={ref} onChange={setRef}>
        {docs.map(d => (
          <option key={d.id} value={d.id}>
            {d.name} · {d.id} · 반품 가능 {F.returnAvailable(state, d, kind)}
          </option>
        ))}
      </Select>
      <Field name="qty" label="반품 수량" type="number" defaultValue={1} min={step} step={step} max={doc && F.returnAvailable(state, doc, kind)} />
      {kind === '판매 반품' && (
        <Select name="grade" label="검수 결과">
          <option value="정상">정상 · 판매 재고로 복원</option>
          <option value="불량">불량 · 별도 보관</option>
        </Select>
      )}
      <Field name="reason" label="반품 사유" />
    </FormShell>
  );
}

function AdjustmentForm() {
  const { state } = useErp();
  const [code, setCode] = useState(state.items[0]?.[0] ?? '');
  const item = state.items.find(i => i[0] === code);
  return (
    <FormShell title="실사 결과 등록" submitLabel="승인 요청" run={(d, f) => F.requestAdjustment(d, { itemCode: f.itemCode, actual: f.actual, reason: f.reason })}>
      <ItemSelect items={state.items} value={code} onChange={setCode} />
      {item && <Summary title={`시스템 수량 ${item[4]} ${F.unit(item)} · ${item[3]}`} />}
      {/* Keyed by item so the default jumps to the selected item's system quantity. */}
      <Field key={code} name="actual" label="실제 확인 수량" type="number" defaultValue={item?.[4] ?? 0} min={0} step={stepFor(item)} />
      <Field name="reason" label="차이 사유" />
      <Subtitle>승인을 요청합니다. 승인되기 전까지 재고는 유지됩니다.</Subtitle>
    </FormShell>
  );
}

function TaskForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const project = state.collab.projects.find(p => p.id === req.ref)!;
  return (
    <FormShell
      title={`${project.name} · 업무 요청`}
      submitLabel="업무 요청"
      done="업무를 요청하고 피드에 알렸어요."
      run={(d, f) => addTask(d.collab, { projectId: project.id, title: f.title, assignee: f.assignee, priority: f.priority, start: f.start, due: f.due })}
    >
      <Field name="title" label="업무 제목" />
      <Select name="assignee" label="담당자">
        {project.members.map(m => <option key={m}>{m}</option>)}
      </Select>
      <Select name="priority" label="우선순위" defaultValue="보통">
        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Field name="start" label="시작일" type="date" defaultValue="2026-10-07" />
        <Field name="due" label="마감일" type="date" defaultValue="2026-10-14" />
      </div>
      <Subtitle>요청 상태로 등록되고, 담당자가 진행 · 피드백 · 완료로 바꿀 수 있어요.</Subtitle>
    </FormShell>
  );
}

function QuoteForm() {
  const { state } = useErp();
  const items = state.items.filter(i => ['완제품', '상품'].includes(i[2]));
  return (
    <FormShell title="견적서 작성" submitLabel="견적 저장" done="견적서를 저장했어요." run={(d, f) => createQuote(d, { itemCode: f.itemCode, customer: f.customer, qty: f.qty, price: f.price, validUntil: f.validUntil })}>
      <PricedLine side="sale" items={items} priceLabel="견적 단가 (원, 부가세 별도)" />
      <Field name="validUntil" label="유효기간" type="date" defaultValue="2026-10-21" />
      <Subtitle>주문으로 전환하기 전까지 재고와 매출에 반영되지 않아요.</Subtitle>
    </FormShell>
  );
}

function RejectQuoteForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const q = state.quotes.find(x => x.id === req.ref)!;
  return (
    <FormShell title="견적 거절 처리" submitLabel="거절로 표시" done="견적을 거절로 표시했어요." run={(d, f) => rejectQuote(d, req.ref!, f.reason)}>
      <Summary title={`${q.customer} · ${q.name}`} sub={q.id} rows={[['견적 금액 (부가세 포함)', `${withVat(q.qty * q.price).total.toLocaleString()}원`]]} />
      <Field name="reason" label="거절 사유" defaultValue="단가 조건 불일치" />
    </FormShell>
  );
}

function PaymentForm({ req }: { req: FormRequest }) {
  const { state } = useErp();
  const kind: PaymentKind = req.type === 'collect' ? '수금' : '지급';
  const doc = kind === '수금' ? state.sales.find(s => s.id === req.ref)! : state.orders.find(o => o.id === req.ref)!;
  const b = balanceOf(state, doc, kind);
  const advance = advanceLeft(state, kind === '수금' ? '선수금' : '선급금', b.partner);
  return (
    <FormShell
      title={kind === '수금' ? '수금 처리' : '지급 처리'}
      submitLabel={`${kind} 등록`}
      done={`${kind}을 등록했어요.`}
      run={(d, f) => settleDoc(d, { kind, docId: doc.id, amount: f.amount, method: f.method, date: f.date, note: f.note })}
    >
      <Summary
        title={`${b.partner} · ${b.name}`}
        sub={`${b.docId} · 결제 기한 ${b.due}`}
        rows={[['청구 금액 (부가세 포함)', `${b.billed.toLocaleString()}원`], [kind === '수금' ? '받은 금액' : '보낸 금액', `${b.settled.toLocaleString()}원`], ['남은 금액', `${b.balance.toLocaleString()}원`]]}
      />
      <Field name="amount" label={`${kind} 금액 (원)`} type="number" defaultValue={b.balance} max={b.balance} />
      <div className="grid grid-cols-2 gap-3">
        <Select name="method" label="정산 방법">
          <optgroup label="돈이 오가요">{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</optgroup>
          <optgroup label="돈이 오가지 않아요">
            {kind === '수금' ? (
              <>
                {advance > 0 && <option value="선수금 대체">선수금에서 차감 (남은 {advance.toLocaleString()}원)</option>}
                <option value="매출할인">매출할인 · 에누리</option>
                <option value="대손">대손 처리 (회수 불가)</option>
              </>
            ) : (
              <>
                {advance > 0 && <option value="선급금 대체">선급금에서 차감 (남은 {advance.toLocaleString()}원)</option>}
                <option value="매입할인">매입할인</option>
              </>
            )}
          </optgroup>
        </Select>
        <Field name="date" label={`${kind}일`} type="date" defaultValue={F.date()} />
      </div>
      <label className="my-3 block text-caption font-medium text-ink-2">
        메모 (선택)
        <input name="note" className={inputClass} placeholder="예) 1차 입금" />
      </label>
      {kind === '수금' && <Subtitle>대손 처리는 부가세분(1/11)을 대손세액공제로 돌려받아요. 회수 불가 사유(파산 · 소멸시효 등)가 있어야 해요.</Subtitle>}
    </FormShell>
  );
}

function FormBody({ req }: { req: FormRequest }) {
  switch (req.type) {
    case 'item': return <ItemForm />;
    case 'leave': return <LeaveForm />;
    case 'purchase': return <OrderForm kind="purchase" />;
    case 'sale': return <OrderForm kind="sale" />;
    case 'receipt':
    case 'ship': return <StockForm req={req} />;
    case 'cancelOrder': return <CancelOrderForm req={req} />;
    case 'cancelMovement': return <CancelMovementForm req={req} />;
    case 'saleReturn':
    case 'purchaseReturn': return <ReturnForm req={req} />;
    case 'adjustment': return <AdjustmentForm />;
    case 'task': return <TaskForm req={req} />;
    case 'quote': return <QuoteForm />;
    case 'rejectQuote': return <RejectQuoteForm req={req} />;
    case 'collect':
    case 'pay': return <PaymentForm req={req} />;
    case 'workOrder': return <WorkOrderForm />;
    case 'output': return <OutputForm req={req} />;
    case 'salary': return <SalaryForm req={req} />;
  }
}

export function FormDialog() {
  const { form, setForm } = useErp();
  const ref = useModalDialog(!!form);
  return (
    <dialog
      ref={ref}
      onClose={() => setForm(null)}
      className={dialogClass}
    >
      {form && <FormBody key={form.key} req={form} />}
    </dialog>
  );
}

/** Opens a form after the same availability checks the original screens ran. */
export function useOpenForm() {
  const { state, setForm, toast } = useErp();
  return (type: FormType, ref?: string) => {
    if (type === 'receipt' || type === 'ship') {
      const row = (type === 'receipt' ? state.orders : state.sales).find(o => o.id === ref);
      if (!row) return;
      if (!state.items.some(i => i[0] === row.itemCode)) return toast('품목 연결을 먼저 확인해 주세요.', 'error');
    }
    if (type === 'cancelOrder' && !state.orders.some(o => o.id === ref)) return;
    if (type === 'rejectQuote' && !state.quotes.some(q => q.id === ref)) return;
    if (type === 'collect' && !state.sales.some(s => s.id === ref)) return;
    if (type === 'pay' && !state.orders.some(o => o.id === ref)) return;
    if (type === 'output' && !state.workOrders.some(w => w.id === ref)) return;
    if (type === 'salary' && !state.salaries.some(x => x.name === ref)) return;
    if (type === 'workOrder' && !state.boms.length) return toast('BOM이 등록된 품목이 없어요.', 'info');
    if (type === 'cancelMovement' && !state.movements.some(m => m.id === ref)) return;
    if ((type === 'saleReturn' || type === 'purchaseReturn') && !returnDocs(state, returnKind(type)).length) {
      return toast('반품 가능한 입고·출고 거래가 없습니다.', 'info');
    }
    setForm({ type, ref, token: F.id('TX'), key: Date.now() });
  };
}
