'use client';

import { useState } from 'react';
import { Options, ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, ButtonLink, Card, CardHead, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats, Tabs, Toolbar, cx } from '@/components/ui';
import { currentUser, reopenMonth } from '@/lib/admin';
import { addMonths, deleteVoucher, expenseAccounts, incomeAccounts, lastDay } from '@/lib/books';
import { ACCRUAL_KINDS, accruals, addAccrual, bookClosing, closeWithChecks, closingItems, equityStatement, monthChecks, setBadDebtRate, type AccrualKind } from '@/lib/closing';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { href, type PageId } from '@/lib/nav';

const views = ['점검 · 마감', '결산 정리', '발생주의 정리', '자본변동표'] as const;

export default function ClosingPage() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const lastMonth = addMonths(today.slice(0, 7), -1);
  const [view, setView] = useState<(typeof views)[number]>('점검 · 마감');
  const [month, setMonth] = useState(lastMonth);
  const [rateOpen, setRateOpen] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const [kind, setKind] = useState<AccrualKind>('미지급비용');

  const closed = state.admin.closedThrough;
  const end = lastDay(month);
  const past = end <= today;
  const isClosed = !!closed && month <= closed;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 7), -i - 1));
  const checks = monthChecks(state, month);
  const items = past ? closingItems(state, end) : [];
  const pendingItems = items.filter(i => i.amount);
  const years = [...new Set([today.slice(0, 4), ...months.map(m => m.slice(0, 4))])];
  const [year, setYear] = useState(today.slice(0, 4));
  const eq = equityStatement(state, year, today);
  const list = accruals(state);
  const accrualAccounts = ACCRUAL_KINDS[kind].side === '비용' ? expenseAccounts(state) : incomeAccounts(state);
  const admin = currentUser(state)?.role === '관리자';

  return (
    <>
      <PageHead
        title="결산"
        sub="월말에 빠진 처리를 점검하고, 대손충당금 · 퇴직급여충당부채 · 법인세 같은 결산 정리를 반영한 뒤 마감해요. 마감한 달은 누구도 고칠 수 없어요."
        action={past && !isClosed ? <Button variant="primary" onClick={() => act(d => closeWithChecks(d, month, today), `${month} 장부를 마감했어요.`)}>{month} 마감</Button> : undefined}
      />
      <Stats>
        <Stat label="마감 완료" value={closed || '없음'} unit="" foot={closed ? `${closed}까지 잠금` : '아직 마감한 달이 없어요'} tone={closed ? 'ok' : 'neutral'} />
        <Stat label={`${month} 점검`} value={`${checks.filter(c => c.ok).length}/${checks.length}`} unit="" foot={checks.every(c => c.ok) ? '모두 끝났어요' : `${checks.filter(c => !c.ok).map(c => c.label).slice(0, 2).join(', ')} 확인`} tone={checks.every(c => c.ok) ? 'ok' : 'warn'} />
        <Stat label="반영 전 결산 정리" value={pendingItems.length} unit="건" foot={past ? `${end} 기준` : '월이 끝나야 계산해요'} tone={pendingItems.length ? 'warn' : 'ok'} />
        <Stat label={`${year} 당기순이익`} value={money(eq.profit)} unit="" foot="법인세비용 차감 후" tone={eq.profit >= 0 ? 'info' : 'danger'} />
      </Stats>

      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          {view === '자본변동표' ? (
            <ToolbarField label="사업연도">
              <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}><Options values={years} /></select>
            </ToolbarField>
          ) : view !== '발생주의 정리' && (
            <ToolbarField label="결산 월">
              <select value={month} onChange={e => setMonth(e.target.value)} className={bareSelect}>
                {months.map(m => <option key={m} value={m}>{m}{closed && m <= closed ? ' (마감)' : ''}</option>)}
              </select>
            </ToolbarField>
          )}
        </Toolbar>

        {view === '점검 · 마감' && (
          <>
            <DataTable
              foot={false}
              headers={['점검 항목', '상태', '내용', '']}
              rows={checks.map(c => [
                <strong key="l" className="font-medium text-ink">{c.label}{c.blocking && <CellSub>통과해야 마감할 수 있어요</CellSub>}</strong>,
                <Pill key="s" tone={c.ok ? 'ok' : c.blocking ? 'danger' : 'warn'}>{c.ok ? '완료' : '확인 필요'}</Pill>,
                <span key="d" className="text-muted">{c.detail}</span>,
                c.ok ? '' : c.page === 'closing'
                  ? <Button key="g" variant="text" onClick={() => setView('결산 정리')}>결산 정리</Button>
                  : <ButtonLink key="g" variant="text" href={href(c.page as PageId)}>바로 가기</ButtonLink>,
              ])}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5 text-body">
              <span className="text-muted">
                {isClosed ? `${month}은(는) 마감됐어요. 이 달의 전표 · 거래는 추가 · 수정 · 삭제할 수 없어요.` : past ? '경고 항목이 남아도 마감할 수 있지만, 처리하고 마감하는 걸 권해요.' : '이 달이 끝나야 마감할 수 있어요.'}
              </span>
              {closed && <Button disabled={!admin} title={admin ? undefined : '관리자만 할 수 있어요'} onClick={() => act(d => reopenMonth(d), `${closed} 마감을 취소했어요.`)}>{closed} 마감 취소</Button>}
            </div>
          </>
        )}

        {view === '결산 정리' && (
          <>
            <DataTable
              foot={false}
              headers={['정리 항목', '계산 근거', '목표 잔액', '지금 장부', '반영할 금액', '분개']}
              rows={items.map(i => [
                <strong key="k" className="font-medium text-ink">{i.key}</strong>,
                <span key="b" className="text-caption text-muted">{i.basis}</span>,
                money(i.target),
                money(i.current),
                <strong key="a" className={cx('font-medium', i.amount ? 'text-ink' : 'text-subtle')}>{i.amount ? money(i.amount) : '반영 완료'}</strong>,
                i.amount ? <span key="j" className="text-caption text-muted">{i.amount > 0 ? `${i.debit} / ${i.credit}` : `${i.credit} / ${i.debit} (환입)`}</span> : '',
              ])}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5">
              <span className="text-body text-muted">{past ? `${end} 날짜의 대체 전표로 반영해요. 몇 번을 눌러도 목표 잔액과의 차이만 들어가요.` : '이 달이 끝나야 결산 정리를 할 수 있어요.'}</span>
              <span className="flex gap-2">
                <Button onClick={() => setRateOpen(true)}>대손 설정률 {state.books.badDebtRate}%</Button>
                <Button disabled={!past || isClosed || !pendingItems.some(i => i.key !== '법인세비용')} onClick={() => act(d => bookClosing(d, end, ['대손충당금', '퇴직급여충당부채']), '대손충당금 · 퇴직급여충당부채를 반영했어요.')}>충당금만 반영</Button>
                <Button variant="primary" disabled={!past || isClosed || !pendingItems.length} onClick={() => act(d => bookClosing(d, end), `${month} 결산 정리를 반영했어요.`)}>모두 반영</Button>
              </span>
            </div>
          </>
        )}

        {view === '발생주의 정리' && (
          <>
            <CardHead title="미지급 · 선급 · 미수 · 선수 정리" sub="월말에 넣으면 다음 달 1일에 자동으로 역분개돼요. 실제 청구서나 입금은 평소처럼 처리하면 돼요.">
              <Button variant="primary" onClick={() => setAccrualOpen(true)}>정리 추가</Button>
            </CardHead>
            <DataTable
              headers={['결산일', '구분', '내용', '계정', '금액', '역분개', '']}
              rows={list.map(v => {
                const rev = state.books.vouchers.find(x => x.id === v.pair);
                const acct = v.lines.find(l => l.account !== v.closing)?.account ?? '';
                return [
                  v.date,
                  <Pill key="k" tone="neutral">{v.closing!}</Pill>,
                  v.desc.replace(`${v.closing} · `, ''),
                  acct,
                  money(v.lines[0].debit),
                  rev?.date ?? '—',
                  <Button key="d" variant="text" onClick={() => act(d => deleteVoucher(d, v.id), '정리 전표와 역분개를 함께 지웠어요.')}>삭제</Button>,
                ];
              })}
            />
          </>
        )}

        {view === '자본변동표' && (
          <>
            <DataTable
              foot={false}
              headers={['구분', '자본금 (기초자본)', '이익잉여금', '합계']}
              rows={[
                ...eq.rows.map(r => [r.label, money(r.capital), <span key="r" className={r.retained < 0 ? 'text-danger' : ''}>{money(r.retained)}</span>, money(r.capital + r.retained)]),
                [<strong key="l">기말 잔액</strong>, <strong key="c">{money(eq.close.capital)}</strong>, <strong key="r">{money(eq.close.retained)}</strong>, <strong key="t">{money(eq.close.capital + eq.close.retained)}</strong>],
              ]}
            />
            <p className="border-t border-line px-4 py-3.5 text-caption text-muted">
              당기순이익은 사업연도가 바뀌면 자동으로 이익잉여금에 이월돼요. 손익 계정은 연도별로 따로 집계되니 기수 이월 작업을 따로 할 필요가 없어요. 배당은 기타원천세에서 배당소득으로 지급하면 이익잉여금에서 빠져요.
            </p>
          </>
        )}
      </Card>
      <Hint className="mt-4">
        결산 정리 금액은 회사 기준에 따른 계산이에요. 대손 설정률, 퇴직급여 추계 방식, 법인세 세무조정은 결산 전에 세무사와 확인하세요.
      </Hint>

      <ModalForm open={rateOpen} onClose={() => setRateOpen(false)} title="대손충당금 설정률" submitLabel="저장" done="설정률을 바꿨어요." run={(d, f) => setBadDebtRate(d, f.rate)}>
        <p className="text-body text-muted">기말 외상매출금과 미수금 잔액에 이 비율을 곱한 만큼 대손충당금을 쌓아요. 과거 대손 경험률을 쓰는 게 원칙이고, 세법상 손금 한도는 채권 잔액의 1%(또는 대손실적률)예요.</p>
        <Field name="rate" label="설정률 (%)" type="number" step="0.1" min={0} defaultValue={state.books.badDebtRate} />
      </ModalForm>

      <ModalForm open={accrualOpen} onClose={() => setAccrualOpen(false)} title="발생주의 정리 추가" done="정리 전표와 다음 달 역분개를 만들었어요." run={(d, f) => addAccrual(d, { kind: f.kind, month: f.month, account: f.account, amount: f.amount, desc: f.desc })}>
        <Select name="kind" label="구분" value={kind} onChange={v => setKind(v as AccrualKind)}><Options values={Object.keys(ACCRUAL_KINDS)} /></Select>
        <p className="-mt-1 mb-2 text-caption text-muted">{ACCRUAL_KINDS[kind].desc}</p>
        <div className="grid grid-cols-2 gap-3">
          <Select name="month" label="결산 월" defaultValue={lastMonth}>
            {months.filter(m => !closed || m > closed).map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select key={kind} name="account" label={`${ACCRUAL_KINDS[kind].side} 계정`}><Options values={accrualAccounts} /></Select>
        </div>
        <Field name="amount" label="금액 (원)" type="number" />
        <Field name="desc" label="내용" placeholder="예) 9월 전기요금 (10월 청구)" />
      </ModalForm>
    </>
  );
}
