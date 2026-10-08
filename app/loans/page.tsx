'use client';

import { useState } from 'react';
import { FundOptions, Options, ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, DetailField, DetailGrid, Hint, MiniProgress, PageHead, Pill, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { journal } from '@/lib/accounting';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { DEEMED_RATE, REPAY_METHODS, addLoan, bookDeemedInterest, deemedInterest, deleteLoan, loanAccount, loanSchedule, loanStatus, repayLoan, setDeemedRate, undoRepayment, type Loan } from '@/lib/loans';

const views = ['차입금', '가지급금 인정이자'] as const;

export default function LoansPage() {
  const { state, openDrawer } = useErp();
  const act = useAction();
  const today = date();
  const [view, setView] = useState<(typeof views)[number]>('차입금');
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<{ loan: Loan; payoff: boolean } | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [year, setYear] = useState(today.slice(0, 4));

  const loans = state.books.loans.map(l => ({ l, s: loanStatus(l) }));
  const live = loans.filter(x => !x.s.done);
  const owed = live.reduce((t, x) => t + x.s.balance, 0);
  const thisYearInterest = loans.reduce((t, x) => t + x.l.payments.filter(p => p.date.startsWith(today.slice(0, 4))).reduce((s, p) => s + p.interest, 0), 0);
  const nextDue = live.map(x => x.s.next!).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))[0];
  const entries = journal(state, today);
  const deemed = deemedInterest(state, entries, year, today);
  const rate = state.books.deemedRate ?? DEEMED_RATE;

  const schedule = (l: Loan) => {
    const paid = new Map(l.payments.map(p => [p.seq, p]));
    openDrawer(`${l.lender} ${l.desc}`, (
      <>
        <DetailGrid>
          <DetailField label="대출 금액 · 계정" value={`${money(l.principal)} · ${loanAccount(l)}`} />
          <DetailField label="이자율 · 기간" value={`연 ${l.rate}% · ${l.months}개월`} />
          <DetailField label="상환 방식" value={l.method} />
          <DetailField label="실행일" value={l.start} />
        </DetailGrid>
        <DataTable
          compact
          foot={false}
          headers={['회차', '납입일', '원금', '이자', '납입액', '잔액', '상태']}
          rows={loanSchedule(l).map(r => {
            const p = paid.get(r.seq);
            return [r.seq, p && !p.filler ? p.date : r.date, money(p ? p.principal : r.principal), money(p ? p.interest : r.interest), money(p ? p.principal + p.interest : r.payment), money(r.balance), <Pill key="s" tone={p ? 'ok' : r.date < today ? 'danger' : 'neutral'}>{p ? (p.filler ? '중도 상환' : '상환') : r.date < today ? '연체' : '예정'}</Pill>];
          })}
        />
      </>
    ));
  };

  return (
    <>
      <PageHead
        title="차입금 · 가지급금"
        sub="은행 대출의 상환표를 만들고 회차별로 갚으면 원금과 이자비용이 장부에 들어가요. 대표 · 임원에게 준 가지급금은 세법상 인정이자를 계산해 법인세 세무조정에 넣어요."
        action={view === '차입금' ? <Button variant="primary" onClick={() => setOpen(true)}>차입금 등록</Button> : <Button onClick={() => setRateOpen(true)}>인정이자율 {rate}%</Button>}
      />
      <Stats>
        <Stat label="차입금 잔액" value={money(owed)} unit="" foot={`${live.length}건 상환 중`} tone="info" />
        <Stat label="다음 상환" value={nextDue ? money(nextDue.payment) : '없음'} unit="" foot={nextDue ? `${nextDue.date} · ${nextDue.seq}회차` : '예정된 상환이 없어요'} tone={nextDue && nextDue.date < today ? 'danger' : 'neutral'} />
        <Stat label={`${today.slice(0, 4)} 이자비용`} value={money(thisYearInterest)} unit="" foot="상환한 이자 합계" />
        <Stat label="가지급금 잔액" value={money(deemed.reduce((t, d) => t + Math.max(0, d.balance), 0))} unit="" foot={`인정이자 ${money(deemed.reduce((t, d) => t + d.add, 0))} (${year})`} tone={deemed.some(d => d.balance > 0) ? 'warn' : 'ok'} />
      </Stats>

      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          {view === '가지급금 인정이자' && (
            <ToolbarField label="사업연도">
              <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}><Options values={[today.slice(0, 4), String(Number(today.slice(0, 4)) - 1)]} /></select>
            </ToolbarField>
          )}
        </Toolbar>

        {view === '차입금' && (
          <DataTable
            headers={['빌린 곳', '대출 금액', '이자율 · 방식', '실행 · 만기', '상환 진행', '잔액', '다음 상환', '']}
            rows={loans.map(({ l, s }) => [
              <><strong className="font-medium text-ink">{l.lender}</strong><CellSub>{l.desc} · {loanAccount(l)}</CellSub></>,
              money(l.principal),
              <><span>연 {l.rate}%</span><CellSub>{l.method}</CellSub></>,
              <><span>{l.start}</span><CellSub>{loanSchedule(l).at(-1)?.date} 만기</CellSub></>,
              <span key="p" className="flex items-center gap-2">{l.payments.filter(p => !p.filler).length}/{l.months}회<MiniProgress ratio={s.paidPrincipal / l.principal} className="w-12" /></span>,
              <strong key="b" className="font-medium text-ink">{money(s.balance)}</strong>,
              s.next ? <><span className={s.next.date < today ? 'text-danger' : ''}>{s.next.date}</span><CellSub>{money(s.next.payment)}</CellSub></> : <Pill key="d" tone="ok">완납</Pill>,
              <span key="x" className="flex gap-0.5">
                <Button variant="text" onClick={() => schedule(l)}>상환표</Button>
                {s.next && <Button variant="text" onClick={() => setPaying({ loan: l, payoff: false })}>상환</Button>}
                {s.next && <Button variant="text" onClick={() => setPaying({ loan: l, payoff: true })}>중도 상환</Button>}
                {l.payments.length > 0 && <Button variant="text" onClick={() => act(d => undoRepayment(d, l.id), '마지막 상환을 취소했어요.')}>상환 취소</Button>}
                {!l.payments.length && <Button variant="text" onClick={() => act(d => deleteLoan(d, l.id), '차입금을 지웠어요.')}>삭제</Button>}
              </span>,
            ])}
          />
        )}

        {view === '가지급금 인정이자' && (
          <>
            <DataTable
              headers={['대상자', '가지급금 잔액', '적수 (잔액 × 일수)', '인정이자', '받은 이자', '익금산입', '세무조정', '']}
              rows={deemed.map(r => [
                <strong key="p" className="font-medium text-ink">{r.person}</strong>,
                money(r.balance),
                money(r.sum),
                money(r.deemed),
                money(r.received),
                <strong key="a" className="font-medium text-ink">{money(r.add)}</strong>,
                r.booked ? <Pill key="b" tone={r.booked === r.add ? 'ok' : 'warn'}>{r.booked === r.add ? '반영됨' : `반영 ${money(r.booked)}`}</Pill> : <Pill key="b" tone="neutral">미반영</Pill>,
                r.add && r.booked !== r.add ? <Button key="x" variant="text" onClick={() => act(d => bookDeemedInterest(d, journal(d, today), year, r.person, today), '법인세 세무조정에 익금산입으로 넣었어요.')}>세무조정 반영</Button> : '',
              ])}
            />
            <p className="border-t border-line px-4 py-3.5 text-caption text-muted">
              가지급금은 전표에 거래처(대상자)를 적어 두면 사람별로 모여요. 인정이자 = 적수 × {rate}% ÷ 365. 회사가 이자를 받지 않았거나 덜 받았으면 차액이 익금산입되고, 대표자 상여로 처분돼 소득세도 생길 수 있어요. 연말 기준으로 다시 반영하세요.
            </p>
          </>
        )}
      </Card>
      <Hint className="mt-4">이자는 매달 남은 원금에 연 이자율의 1/12을 곱해 계산해요. 실제 은행 납입액과 몇 원 다를 수 있으니 상환할 때 은행 내역과 맞춰 보세요.</Hint>

      <ModalForm open={open} onClose={() => setOpen(false)} title="차입금 등록" done="차입금을 등록했어요. 대출금이 통장에 들어온 것으로 장부에 기록했어요." run={(d, f) => addLoan(d, { lender: f.lender, desc: f.desc, principal: f.principal, rate: f.rate, start: f.start, months: f.months, method: f.method, fund: f.fund })}>
        <div className="grid grid-cols-2 gap-3">
          <Field name="lender" label="빌린 곳" placeholder="예) 기업은행" />
          <Field name="desc" label="용도" optional placeholder="운전자금" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="principal" label="대출 금액 (원)" type="number" />
          <Field name="rate" label="연 이자율 (%)" type="number" step="0.01" min={0} defaultValue={5} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="start" label="실행일" type="date" defaultValue={today} />
          <Field name="months" label="기간 (개월)" type="number" defaultValue={12} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select name="method" label="상환 방식" defaultValue="원리금균등"><Options values={REPAY_METHODS} /></Select>
          <Select name="fund" label="입금 계좌" defaultValue="BANK-1"><FundOptions funds={state.books.funds} kinds={['계좌']} /></Select>
        </div>
        <p className="text-caption text-muted">12개월 이하는 단기차입금, 그보다 길면 장기차입금으로 기록해요.</p>
      </ModalForm>

      <ModalForm
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying?.payoff ? '중도 상환' : `${paying ? loanStatus(paying.loan).next?.seq : ''}회차 상환`}
        submitLabel="상환 기록"
        done={paying?.payoff ? '남은 원금을 모두 갚았어요.' : '상환을 기록했어요.'}
        run={(d, f) => repayLoan(d, paying!.loan.id, { date: f.date, payoff: paying!.payoff })}
      >
        {paying && (() => {
          const s = loanStatus(paying.loan);
          const principal = paying.payoff ? s.balance : s.next!.principal;
          return (
            <>
              <DetailGrid>
                <DetailField label="원금" value={money(principal)} />
                <DetailField label="이자" value={money(s.next!.interest)} />
                <DetailField label="출금 합계" value={money(principal + s.next!.interest)} />
                <DetailField label="상환 후 잔액" value={money(s.balance - principal)} />
              </DetailGrid>
              <Field name="date" label="상환일" type="date" defaultValue={paying.payoff ? today : [s.next!.date, today].sort()[0]} />
              {paying.payoff && <p className="text-caption text-muted">중도상환수수료가 있으면 전표 입력에서 지급수수료로 따로 넣어 주세요.</p>}
            </>
          );
        })()}
      </ModalForm>

      <ModalForm open={rateOpen} onClose={() => setRateOpen(false)} title="인정이자율" submitLabel="저장" done="인정이자율을 바꿨어요." run={(d, f) => setDeemedRate(d, f.rate)}>
        <p className="text-body text-muted">기본은 법인세법상 당좌대출이자율 4.6%예요. 회사가 가중평균차입이자율을 쓰기로 했다면 그 비율을 넣으세요.</p>
        <Field name="rate" label="연 이자율 (%)" type="number" step="0.01" min={0} defaultValue={rate} />
      </ModalForm>
    </>
  );
}
