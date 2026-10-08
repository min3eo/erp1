'use client';

import { AttachButton } from '@/components/attachments';
import { contractStamp } from '@/lib/tax-calendar';
import { useState } from 'react';
import { Options, SignCell } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, Suggestions, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { addContract, billContract, contractPhase, deleteContract, payStamp, expenseAccounts, monthOf, partnerNames, type Contract } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';

const categories = ['용역', '공급', '임대차', '유지보수', '라이선스', '기타'];

export default function ContractsPage() {
  const { state } = useErp();
  const act = useAction();
  const list = useListFilter();
  const [open, setOpen] = useState(false);
  const today = date();
  const month = monthOf(today);
  const contracts = state.books.contracts.filter(c => c.side !== '근로');
  const active = contracts.filter(c => c.sign === '서명 완료' && ['진행 중', '만료 예정'].includes(contractPhase(c, today)));
  const monthly = (side: '매출' | '매입') => active.filter(c => c.side === side && c.cycle === '월 정기').reduce((t, c) => t + c.amount, 0);
  const expiring = contracts.filter(c => contractPhase(c, today) === '만료 예정');
  const billable = (c: Contract) => c.sign === '서명 완료' && contractPhase(c, today) !== '만료' && contractPhase(c, today) !== '시작 전' && !c.billed.includes(c.cycle === '일시' ? 'once' : month);

  return (
    <>
      <PageHead
        title="계약관리"
        sub="거래처와의 매출 · 매입 계약을 등록하고 전자서명으로 체결해요. 정기 계약은 매달 버튼 한 번으로 청구 · 정산 거래와 세금계산서가 만들어집니다."
        action={<Button variant="primary" onClick={() => setOpen(true)}>계약 등록</Button>}
      />
      <Stats>
        <Stat label="진행 중 계약" value={active.length} unit="건" foot={`전체 ${contracts.length}건`} tone="info" />
        <Stat label="월 정기 매출" value={money(monthly('매출'))} unit="" foot="공급가 기준" tone="ok" />
        <Stat label="월 정기 매입" value={money(monthly('매입'))} unit="" foot="임차료 · 용역비 등" />
        <Stat label="30일 안에 만료" value={expiring.length} unit="건" foot={expiring.map(c => c.partner).join(', ') || '없음'} tone={expiring.length ? 'warn' : undefined} />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '매출', '매입', '서명 대기', '만료 예정']} list={list} placeholder="계약명, 거래처 검색" />
        <DataTable
          headers={['계약', '구분', '기간', '금액', '전자서명', `${month} 청구 · 정산`, '']}
          rows={contracts
            .filter(c => {
              const f = list.filter;
              const ok = f === '전체' || c.side === f || (f === '서명 대기' && c.sign !== '서명 완료') || (f === '만료 예정' && contractPhase(c, today) === '만료 예정');
              return ok && list.matches(c.title, c.partner, c.category);
            })
            .map(c => {
              const phase = contractPhase(c, today);
              return [
                <><strong className="font-medium text-ink">{c.title}</strong><CellSub>{c.partner}</CellSub></>,
                <><Pill tone={c.side === '매출' ? 'ok' : 'info'}>{c.side}</Pill><CellSub>{c.category} · {c.account}</CellSub></>,
                <>{c.start} ~ {c.end || '기간 없음'}<CellSub><Pill>{phase}</Pill></CellSub></>,
                <>{money(c.amount)}<CellSub>{c.cycle === '월 정기' ? '매월 · 공급가' : '일시 · 공급가'}{contractStamp(c) > 0 && (c.stampPaid ? ` · 인지세 ${money(contractStamp(c))} 납부` : <span className="text-warn"> · 인지세 {money(contractStamp(c))}</span>)}</CellSub></>,
                <SignCell key="s" c={c} />,
                billable(c)
                  ? <Button key="b" variant="primary" onClick={() => act(d => billContract(d, c.id, month), c.side === '매출' ? '청구했어요. 매출과 세금계산서(발행 대기)가 생겼어요.' : '정산했어요. 매입과 받은 세금계산서가 기록됐어요.')}>{c.side === '매출' ? '청구' : '정산'}</Button>
                  : <span key="b" className="text-caption text-subtle">{c.billed.includes(c.cycle === '일시' ? 'once' : month) ? '처리 완료' : c.sign !== '서명 완료' ? '서명 후 가능' : '—'}</span>,
                <span key="d" className="flex"><AttachButton refId={c.id} title={c.title} />{c.sign === '서명 완료' && contractStamp(c) > 0 && !c.stampPaid && <Button variant="text" onClick={() => act(d => payStamp(d, c.id, { amount: contractStamp(c), date: date() }), `인지세 ${money(contractStamp(c))}을 세금과공과로 기록했어요.`)}>인지세 납부</Button>}{c.sign !== '서명 완료' && <Button variant="text" onClick={() => act(d => deleteContract(d, c.id), '계약을 지웠어요.')}>삭제</Button>}</span>,
              ];
            })}
        />
      </Card>
      <Hint className="mt-4">서명 요청 · 재전송 · 이력은 전자계약에서 관리해요. 근로계약서는 인사 · 세무 › 전자근로계약에서 작성해요.</Hint>

      <ContractForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ContractForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useErp();
  const [side, setSide] = useState('매출');
  return (
    <ModalForm
      open={open}
      onClose={onClose}
      title="계약 등록"
      done="계약을 등록했어요. 전자서명을 요청하세요."
      run={(d, f) => addContract(d, { title: f.title, partner: f.partner, side: f.side, category: f.category, start: f.start, end: f.end, amount: f.amount, cycle: f.cycle, account: f.account })}
    >
      <Select name="side" label="구분" value={side} onChange={setSide}><Options values={['매출', '매입']} /></Select>
      <Field name="title" label="계약명" placeholder={side === '매출' ? '예) 유지보수 용역' : '예) 창고 임대차'} />
      <Field name="partner" label="거래처" list="contract-partners" />
      <Suggestions id="contract-partners" values={partnerNames(state)} />
      <div className="grid grid-cols-2 gap-3">
        <Select name="category" label="유형" defaultValue="용역"><Options values={categories} /></Select>
        {side === '매입' ? <Select name="account" label="비용 계정" defaultValue="지급수수료"><Options values={expenseAccounts(state)} /></Select> : <Select name="cycle" label="청구 주기" defaultValue="월 정기"><Options values={['월 정기', '일시']} /></Select>}
      </div>
      {side === '매입' && <Select name="cycle" label="정산 주기" defaultValue="월 정기"><Options values={['월 정기', '일시']} /></Select>}
      <div className="grid grid-cols-2 gap-3">
        <Field name="start" label="시작일" type="date" defaultValue={date()} />
        <Field name="end" label="종료일" type="date" optional />
      </div>
      <Field name="amount" label="금액 (원, 공급가 · 정기면 월 금액)" type="number" />
    </ModalForm>
  );
}
