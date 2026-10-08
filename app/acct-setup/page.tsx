'use client';

import { useState } from 'react';
import { Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, inputClass } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, Hint, PageHead, Pill, SearchInput, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { fundBalances, journal, trialBalance } from '@/lib/accounting';
import { ACCOUNTS, DERIVED_OPENING, accountTypes, addAccount, addFund, addPartner, addPartnerOpening, partnerNames, setOpening, setPartnerPrice, setPartnerTerms } from '@/lib/books';
import { money } from '@/lib/format';

const views = ['계정과목', '거래처', '계좌 · 카드', '기초 잔액'] as const;
type Dialog = null | 'account' | 'fund' | 'opening' | { partner: string } | { terms: string } | { prices: string } | { account: string };

export default function AcctSetupPage() {
  const { state } = useErp();
  const [view, setView] = useState<(typeof views)[number]>('계정과목');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const types = accountTypes(state);
  const entries = journal(state);
  const tb = trialBalance(entries, types);
  const balances = fundBalances(state, entries);
  const custom = new Set(state.books.accounts.map(a => a.name));
  const registered = new Set(state.books.partners.map(p => p.name));
  const unregistered = partnerNames(state).filter(n => !registered.has(n));
  const hit = (...v: string[]) => v.join(' ').includes(query);
  const d = dialog && typeof dialog === 'object' ? dialog : null;

  return (
    <>
      <PageHead
        title="기초등록"
        sub="장부의 뼈대예요. 계정과목, 거래처(결제 조건 · 여신 한도 · 단가표), 통장 · 카드, 그리고 시스템을 쓰기 전의 기초 잔액을 등록해요."
        action={
          <>
            {view === '계정과목' && <Button variant="primary" onClick={() => setDialog('account')}>계정 추가</Button>}
            {view === '거래처' && <Button variant="primary" onClick={() => setDialog({ partner: '' })}>거래처 추가</Button>}
            {view === '계좌 · 카드' && <Button variant="primary" onClick={() => setDialog('fund')}>계좌 · 카드 추가</Button>}
            {view === '기초 잔액' && <Button variant="primary" onClick={() => setDialog('opening')}>거래처 기초 미수 · 미지급</Button>}
          </>
        }
      />
      <Stats>
        <Stat label="계정과목" value={Object.keys(types).length} unit="개" foot={`기본 ${Object.keys(ACCOUNTS).length} · 추가 ${custom.size}`} />
        <Stat label="등록 거래처" value={registered.size} unit="곳" foot={unregistered.length ? `미등록 ${unregistered.length}곳 있음` : '거래처 모두 등록됨'} tone={unregistered.length ? 'warn' : 'ok'} />
        <Stat label="계좌 · 현금" value={money(balances.filter(b => b.fund.kind !== '카드').reduce((t, b) => t + b.balance, 0))} unit="" foot={`${balances.filter(b => b.fund.kind !== '카드').length}개 장부 잔액`} tone="info" />
        <Stat label="기초 잔액 입력" value={Object.keys(state.books.opening).length + state.books.partnerOpening.length} unit="건" foot="계정 · 거래처 기초" />
      </Stats>

      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          <SearchInput value={query} onChange={setQuery} placeholder="이름 검색" />
        </Toolbar>

        {view === '계정과목' && (
          <DataTable
            headers={['계정', '분류', '구분', '차변 합계', '대변 합계', '잔액']}
            rows={Object.entries(types).filter(([name]) => hit(name)).map(([name, type]) => {
              const r = tb.find(x => x.account === name);
              return [
                <strong key="n" className="font-medium text-ink">{name}</strong>,
                <Pill key="t" tone="neutral">{type}</Pill>,
                custom.has(name) ? <Pill key="c" tone="accent">추가</Pill> : <span key="c" className="text-subtle">기본</span>,
                r ? money(r.debit) : '—',
                r ? money(r.credit) : '—',
                r ? <span key="b" className={r.balance < 0 ? 'text-danger' : 'text-ink'}>{money(r.balance)}</span> : '—',
              ];
            })}
          />
        )}

        {view === '거래처' && (
          <DataTable
            headers={['거래처', '구분', '사업자등록번호', '결제 조건', '여신 한도', '할인 · 단가표', '처리']}
            rows={[
              ...state.books.partners.filter(p => hit(p.name, p.bizNo)).map(p => [
                <><strong className="font-medium text-ink">{p.name}</strong><CellSub>{p.contact || '—'}</CellSub></>,
                p.kind,
                p.bizNo ? <span key="b" className="font-mono text-caption">{p.bizNo}</span> : <Pill key="b">미등록</Pill>,
                `${p.terms ?? 30}일`,
                p.creditLimit ? money(p.creditLimit) : '—',
                <span key="d">{p.discount ? `${p.discount}%` : '—'} · {Object.keys(p.prices ?? {}).length}품목</span>,
                <span key="a" className="flex gap-1.5">
                  <Button variant="text" onClick={() => setDialog({ terms: p.name })}>조건</Button>
                  <Button variant="text" onClick={() => setDialog({ prices: p.name })}>단가표</Button>
                </span>,
              ]),
              ...unregistered.filter(n => hit(n)).map(n => [
                <strong key="n" className="font-medium text-ink">{n}</strong>,
                '—', '—', '30일', '—', '—',
                <span key="s" className="flex items-center gap-2"><Pill>미등록</Pill><Button variant="text" onClick={() => setDialog({ partner: n })}>등록</Button></span>,
              ]),
            ]}
          />
        )}

        {view === '계좌 · 카드' && (
          <DataTable
            headers={['이름', '종류', '번호', '기초 잔액', '현재 잔액']}
            rows={balances.filter(b => hit(b.fund.name, b.fund.number)).map(({ fund, balance }) => [
              <strong key="n" className="font-medium text-ink">{fund.name}</strong>,
              <Pill key="k" tone="neutral">{fund.kind}</Pill>,
              <span key="no" className="font-mono text-caption">{fund.number || '—'}</span>,
              fund.kind === '카드' ? '—' : money(fund.opening),
              fund.kind === '카드' ? <span key="b">미결제 {money(balance)}</span> : <strong key="b" className="font-medium text-ink">{money(balance)}</strong>,
            ])}
          />
        )}

        {view === '기초 잔액' && (
          <>
            <DataTable
              foot={false}
              headers={['계정', '분류', '기초 잔액', '']}
              rows={Object.entries(types).filter(([name]) => hit(name) && !DERIVED_OPENING.includes(name) && name !== '이월이익잉여금').map(([name, type]) => [
                <strong key="n" className="font-medium text-ink">{name}</strong>,
                <Pill key="t" tone="neutral">{type}</Pill>,
                state.books.opening[name] ? money(state.books.opening[name]) : <span key="v" className="text-subtle">—</span>,
                <Button key="e" variant="text" onClick={() => setDialog({ account: name })}>입력</Button>,
              ])}
            />
            <div className="border-t border-line px-4 py-3 text-caption text-muted">거래처별 기초 미수 · 미지급</div>
            <DataTable
              headers={['거래처', '구분', '기초 금액', '정산한 금액', '남은 금액']}
              rows={state.books.partnerOpening.map(o => [<strong key="p" className="font-medium text-ink">{o.partner}</strong>, o.side === '채권' ? '받을 돈 (미수금)' : '줄 돈 (미지급금)', money(o.amount), money(o.paid), money(o.amount - o.paid)])}
            />
          </>
        )}
      </Card>
      <Hint className="mt-4">
        {view === '기초 잔액'
          ? '시스템을 쓰기 전 재무상태표의 잔액을 넣어요. 현금 · 예금은 계좌 · 카드, 재고는 품목, 외상 거래는 판매 · 구매 문서에서 정해지고, 차액은 이월이익잉여금으로 맞춰요.'
          : '세금계산서를 발행하려면 거래처의 사업자등록번호가 있어야 해요. 결제 조건은 채권 · 채무의 기한에, 여신 한도는 판매 주문에, 단가표 · 할인율은 주문 단가 기본값에 쓰여요.'}
      </Hint>

      <ModalForm open={dialog === 'account'} onClose={close} title="계정과목 추가" submitLabel="추가" done="계정과목을 추가했어요." run={(dr, f) => addAccount(dr, { name: f.name, type: f.type, memo: f.memo })}>
        <Field name="name" label="계정 이름" placeholder="예) 광고선전비" />
        <Select name="type" label="분류" defaultValue="비용"><Options values={['자산', '부채', '자본', '수익', '비용']} /></Select>
        <Field name="memo" label="설명" optional />
      </ModalForm>

      {d && 'partner' in d && (
        <ModalForm open onClose={close} title="거래처 등록" submitLabel="등록" done="거래처를 등록했어요." run={(dr, f) => addPartner(dr, { name: f.name, bizNo: f.bizNo, kind: f.kind, contact: f.contact })}>
          <Field name="name" label="거래처 이름" defaultValue={d.partner} />
          <Select name="kind" label="구분" defaultValue="공통"><Options values={['매출처', '매입처', '공통']} /></Select>
          <Field name="bizNo" label="사업자등록번호" placeholder="000-00-00000" optional />
          <Field name="contact" label="연락처" optional />
        </ModalForm>
      )}

      {d && 'terms' in d && (() => {
        const p = state.books.partners.find(x => x.name === d.terms)!;
        return (
          <ModalForm open onClose={close} title={`${p.name} 거래 조건`} submitLabel="저장" done="거래 조건을 저장했어요." run={(dr, f) => setPartnerTerms(dr, p.name, f)}>
            <div className="grid grid-cols-2 gap-3">
              <Field name="terms" label="결제 조건 (일)" type="number" min={0} defaultValue={p.terms ?? 30} />
              <Field name="discount" label="기본 할인율 (%)" type="number" min={0} step="0.1" defaultValue={p.discount ?? 0} optional />
            </div>
            <Field name="creditLimit" label="여신 한도 (원, 0이면 제한 없음)" type="number" min={0} defaultValue={p.creditLimit ?? 0} optional />
            <div className="grid grid-cols-2 gap-3">
              <Field name="bizNo" label="사업자등록번호" defaultValue={p.bizNo} optional />
              <Field name="contact" label="연락처" defaultValue={p.contact} optional />
            </div>
          </ModalForm>
        );
      })()}

      {d && 'prices' in d && (
        <ModalForm open onClose={close} title={`${d.prices} 단가표`} submitLabel="저장" done="단가표를 저장했어요." run={(dr, f) => state.items.forEach(i => setPartnerPrice(dr, d.prices, i[0], f[i[0]]))}>
          <p className="mb-2 text-caption text-muted">비워 두면 최근 거래 단가나 기준 단가에서 할인율을 뺀 값을 써요.</p>
          {state.items.map(i => (
            <label key={i[0]} className="my-2 grid grid-cols-[1fr_140px] items-center gap-3 text-caption text-ink-2">
              <span>{i[1]} <span className="text-subtle">기준 {money(i[6])}</span></span>
              <input name={i[0]} type="number" min={0} defaultValue={state.books.partners.find(x => x.name === d.prices)?.prices?.[i[0]] ?? ''} className={inputClass + ' mt-0'} />
            </label>
          ))}
        </ModalForm>
      )}

      {d && 'account' in d && (
        <ModalForm open onClose={close} title={`${d.account} 기초 잔액`} submitLabel="저장" done="기초 잔액을 저장했어요." run={(dr, f) => setOpening(dr, d.account, f.amount)}>
          <Field name="amount" label="전기 말 잔액 (원)" type="number" min={0} defaultValue={state.books.opening[d.account] ?? 0} />
        </ModalForm>
      )}

      <ModalForm open={dialog === 'opening'} onClose={close} title="거래처 기초 미수 · 미지급" submitLabel="추가" done="기초 잔액을 추가했어요. 채권 · 채무관리의 기타 탭에서 정산할 수 있어요." run={(dr, f) => addPartnerOpening(dr, { partner: f.partner, side: f.side, amount: f.amount })}>
        <Field name="partner" label="거래처" />
        <Select name="side" label="구분" defaultValue="채권"><option value="채권">받을 돈 (미수금)</option><option value="채무">줄 돈 (미지급금)</option></Select>
        <Field name="amount" label="금액 (원, 부가세 포함)" type="number" />
      </ModalForm>

      <FundForm open={dialog === 'fund'} onClose={close} />
    </>
  );
}

function FundForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useErp();
  const [kind, setKind] = useState('계좌');
  return (
    <ModalForm open={open} onClose={onClose} title="계좌 · 카드 추가" submitLabel="추가" done="추가했어요." run={(d, f) => addFund(d, { kind: f.kind, name: f.name, number: f.number, opening: f.opening })}>
      <Select name="kind" label="종류" value={kind} onChange={setKind}><Options values={['계좌', '카드', '현금']} /></Select>
      <Field name="name" label="이름" placeholder={kind === '카드' ? '예) 국민 법인카드' : '예) 하나은행 운영자금'} />
      <Field name="number" label={kind === '카드' ? '카드 번호' : '계좌 번호'} optional />
      {kind !== '카드' && <Field name="opening" label="기초 잔액 (원)" type="number" min={0} defaultValue={0} />}
      <p className="text-tiny text-subtle">이미 등록된 것: {state.books.funds.map(f => f.name).join(', ') || '없음'}</p>
    </ModalForm>
  );
}
