'use client';

import { useState } from 'react';
import { KeyValues, Options, SideBox, ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, ButtonLink, Card, CardHead, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats, cx } from '@/components/ui';
import { journal } from '@/lib/accounting';
import { addTaxAdjust, removeTaxAdjust, setCarryLoss } from '@/lib/books';
import { MIN_TAX_RATE, addCredit, interimTax, payInterim, removeCredit, setPriorCorpTax } from '@/lib/corp-tax';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { corpBrackets, corpTaxEstimate } from '@/lib/tax';

const pct = (r: number) => `${Math.round(r * 100)}%`;
const limitLabel = (n: number) => (n === Infinity ? '초과' : n >= 100_000_000 ? `${(n / 100_000_000).toLocaleString()}억 이하` : money(n));

export default function CorpTaxPage() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const thisYear = today.slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const [dialog, setDialog] = useState<null | 'adjust' | 'loss' | 'credit' | 'prior' | 'interim'>(null);
  const [creditKind, setCreditKind] = useState<'감면' | '공제'>('감면');
  const t = corpTaxEstimate(state, year, today);
  const interim = interimTax(state, year, journal(state, today));
  const partial = t.months > 0 && t.months < 12;
  const priorYear = String(Number(year) - 1);

  const flow: [string, number, ('total' | 'sub')?][] = [
    ['결산서상 당기순이익 (법인세 차감 전)', t.pl.net],
    ['(+) 익금산입 · 손금불산입', t.add, 'sub'],
    ['(−) 손금산입 · 익금불산입', -t.sub, 'sub'],
    ['각 사업연도 소득금액', t.income, 'total'],
    ['(−) 이월결손금', -t.carry, 'sub'],
    ['과세표준', t.base, 'total'],
    ['산출세액', t.tax, 'total'],
    [`(−) 세액감면 · 공제 (최저한세 ${pct(MIN_TAX_RATE)} 적용 후)`, -t.allowedCredit, 'sub'],
    ['결정세액 (법인세)', t.determined, 'total'],
    ['(+) 법인지방소득세 (10%)', t.local, 'sub'],
    ['총 부담 세액', t.total, 'total'],
    ['(−) 중간예납 · 기납부세액', -t.prepaid, 'sub'],
    ['신고 때 낼 법인세', t.payable, 'total'],
  ];

  return (
    <>
      <PageHead
        title="법인세"
        sub="장부의 손익에 세무조정을 더하고 빼서 과세표준을 구하고, 감면 · 공제와 최저한세를 반영해 법인세를 미리 계산해요. 접대비 한도 · 증빙, 대손 · 퇴직급여 충당금 조정은 장부에서 자동으로 계산돼요."
        action={
          <>
            <ToolbarField label="사업연도">
              <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}>
                {[thisYear, priorYear].map(y => <option key={y} value={y}>{y}년 (1~12월)</option>)}
              </select>
            </ToolbarField>
            <Button variant="primary" onClick={() => setDialog('adjust')}>세무조정 추가</Button>
          </>
        }
      />
      <Stats>
        <Stat label="당기순이익 (누계)" value={money(t.pl.net)} unit="" foot={partial ? `${year}년 1~${t.months}월 장부 기준` : `${year}년 장부 기준`} tone={t.pl.net >= 0 ? 'ok' : 'danger'} />
        <Stat label="과세표준" value={money(t.base)} unit="" foot={t.income < 0 ? `결손 ${money(-t.income)} · 다음 해부터 15년간 공제` : `자동 조정 ${t.auto.length}건 · 직접 ${t.manual.length}건`} tone="info" />
        <Stat label="예상 세액 (누계 기준)" value={money(t.total)} unit="" foot={t.allowedCredit ? `감면 · 공제 ${money(t.allowedCredit)} 반영` : '법인세 + 지방소득세'} tone={t.total ? 'warn' : undefined} />
        <Stat label="중간예납 (8월)" value={interim.paid ? '납부 완료' : interim.exempt ? '면제' : money(interim.amount)} unit="" foot={interim.paid ? `${interim.paid.date} · ${money(interim.paid.amount)}` : `기한 ${interim.due}`} tone={interim.paid ? 'ok' : interim.amount ? 'warn' : undefined} />
      </Stats>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHead title="법인세 계산 흐름" sub="법인세 과세표준 및 세액조정계산서 요약">
              <span className="flex gap-1.5">
                <ButtonLink href="/print/report/pl">손익계산서</ButtonLink>
                <ButtonLink href="/print/report/bs">재무상태표</ButtonLink>
              </span>
            </CardHead>
            <table className="w-full border-collapse border-t border-line text-body">
              <tbody>
                {flow.map(([k, v, kind]) => (
                  <tr key={k} className={cx('border-b border-line last:border-0', kind === 'total' ? 'font-medium text-ink' : 'text-ink-2', kind === 'sub' && 'text-muted')}>
                    <td className={cx('px-4 py-2.5', kind === 'sub' && 'pl-8')}>{k}</td>
                    <td className={cx('px-4 py-2.5 text-right tabular-nums', v < 0 && 'text-danger')}>{money(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHead title="세무조정" sub="자동: 장부에서 계산 · 직접: 장부로 알 수 없는 것 (벌과금, 업무무관 경비, 업무용 승용차 한도 등)">
              <Button onClick={() => setDialog('adjust')}>추가</Button>
            </CardHead>
            <DataTable
              headers={['구분', '조정 내용', '금액', '']}
              rows={[
                ...t.auto.map(a => [
                  <Pill key="k" tone={a.kind === '가산' ? 'warn' : 'info'}>{a.kind}</Pill>,
                  <>{a.desc}<CellSub>자동 · {a.basis}</CellSub></>,
                  money(a.amount),
                  '',
                ]),
                ...t.manual.map(a => [
                  <Pill key="k" tone={a.kind === '가산' ? 'warn' : 'info'}>{a.kind}</Pill>,
                  <>{a.desc}<CellSub>직접 입력</CellSub></>,
                  money(a.amount),
                  <Button key="x" variant="text" onClick={() => act(d => removeTaxAdjust(d, a.id), '세무조정을 지웠어요.')}>삭제</Button>,
                ]),
              ]}
            />
          </Card>

          <Card>
            <CardHead title="세액감면 · 공제" sub={`최저한세: 과세표준의 ${pct(MIN_TAX_RATE)}(${money(t.minTax)}) 아래로는 줄지 않아요`}>
              <Button onClick={() => setDialog('credit')}>추가</Button>
            </CardHead>
            <DataTable
              foot={false}
              headers={['구분', '내용', '계산', '금액', '']}
              rows={t.credits.map(c => [
                <Pill key="k" tone="info">{c.kind}</Pill>,
                c.desc,
                c.rate ? `산출세액 × ${c.rate}%` : '고정 금액',
                money(c.value),
                <Button key="x" variant="text" onClick={() => act(d => removeCredit(d, c.id), '지웠어요.')}>삭제</Button>,
              ])}
            />
            {t.creditTotal > t.allowedCredit && <p className="border-t border-line px-4 py-2.5 text-caption text-warn">최저한세 때문에 {money(t.creditTotal - t.allowedCredit)}은 이번에 공제받지 못해요. 세액공제는 10년간 이월할 수 있어요.</p>}
          </Card>
        </div>

        <aside className="flex flex-col gap-3">
          <SideBox title="중간예납 (상반기분)">
            <KeyValues rows={[
              [`직전 ${priorYear}년 결정세액의 1/2`, interim.byPrior == null ? '직전 세액 미입력' : money(interim.byPrior)],
              ['상반기 가결산 기준', money(interim.byHalf)],
              ['낼 금액 (적은 쪽)', interim.exempt ? '면제 (직전 50만 원 미만)' : money(interim.amount)],
              ['기한', interim.due],
            ]} />
            <div className="mt-3 flex gap-2">
              <Button onClick={() => setDialog('prior')}>직전 세액 입력</Button>
              <Button variant="primary" disabled={!!interim.paid} onClick={() => setDialog('interim')}>{interim.paid ? '납부 완료' : '납부 기록'}</Button>
            </div>
          </SideBox>
          <SideBox title={`${year}년 세율 (과세표준 구간)`}>
            <KeyValues rows={corpBrackets(year).map(([limit, rate]) => [limitLabel(limit), pct(rate)])} />
          </SideBox>
          <SideBox title="일정">
            <KeyValues rows={[['중간예납', t.interimDue], ['정기 신고 · 납부', t.due], ['지방소득세 신고', `${Number(year) + 1}-04-30`]]} />
          </SideBox>
          <SideBox title="이월결손금">
            <p className="mb-3 text-caption text-muted">지난 사업연도 결손금 중 남은 금액이에요. 중소기업은 소득금액의 100%까지 공제돼요.</p>
            <div className="flex items-center justify-between">
              <strong className="font-medium">{money(state.books.carryLoss[year] ?? 0)}</strong>
              <Button onClick={() => setDialog('loss')}>입력</Button>
            </div>
          </SideBox>
        </aside>
      </div>
      <Hint className="mt-4">
        세율 · 감면율 · 한도는 세법 개정과 업종 · 지역에 따라 달라요. 중소기업 특별세액감면율(5~30%)과 공제 금액은 세무사와 확인해 넣고, 실제 신고 전에 꼭 검토하세요.
      </Hint>

      <ModalForm open={dialog === 'adjust'} onClose={() => setDialog(null)} title="세무조정 추가" submitLabel="추가" done="세무조정을 추가했어요." run={(d, f) => addTaxAdjust(d, { year, kind: f.kind, desc: f.desc, amount: f.amount })}>
        <Select name="kind" label="구분" defaultValue="가산"><Options values={['가산', '차감']} /></Select>
        <Field name="desc" label="조정 내용" placeholder="예) 교통 과태료, 업무용 승용차 감가상각 한도 초과" />
        <Field name="amount" label="금액 (원)" type="number" />
        <p className="text-tiny text-subtle">접대비 한도 · 증빙, 대손 · 퇴직급여 충당금은 자동으로 계산되니 넣지 마세요.</p>
      </ModalForm>
      <ModalForm open={dialog === 'loss'} onClose={() => setDialog(null)} title={`${year}년 이월결손금`} submitLabel="저장" done="이월결손금을 저장했어요." run={(d, f) => setCarryLoss(d, year, f.amount)}>
        <Field name="amount" label="공제할 수 있는 이월결손금 (원)" type="number" min={0} defaultValue={state.books.carryLoss[year] ?? 0} />
      </ModalForm>
      <ModalForm open={dialog === 'credit'} onClose={() => setDialog(null)} title="세액감면 · 공제 추가" submitLabel="추가" done="추가했어요." run={(d, f) => addCredit(d, { year, kind: creditKind, desc: f.desc, rate: f.rate, amount: f.amount })}>
        <Select name="kind" label="구분" value={creditKind} onChange={v => setCreditKind(v as '감면' | '공제')}><Options values={['감면', '공제']} /></Select>
        <Field name="desc" label="이름" defaultValue={creditKind === '감면' ? '중소기업 특별세액감면' : ''} placeholder={creditKind === '공제' ? '예) 통합투자세액공제, 고용증대세액공제' : undefined} />
        {creditKind === '감면'
          ? <Field name="rate" label="감면율 (%)" type="number" step="0.1" defaultValue={10} />
          : <Field name="amount" label="공제 금액 (원)" type="number" />}
      </ModalForm>
      <ModalForm open={dialog === 'prior'} onClose={() => setDialog(null)} title={`${priorYear}년 결정세액`} submitLabel="저장" done="저장했어요." run={(d, f) => setPriorCorpTax(d, priorYear, f.amount)}>
        <p className="text-body text-muted">작년 법인세 신고서의 결정세액(감면 · 공제 후, 가산세 제외)을 넣으면 중간예납을 계산해요.</p>
        <Field name="amount" label="결정세액 (원)" type="number" min={0} defaultValue={interim.prior ?? 0} />
      </ModalForm>
      <ModalForm open={dialog === 'interim'} onClose={() => setDialog(null)} title="중간예납 납부 기록" submitLabel="기록" done="중간예납을 선납세금으로 기록했어요." run={(d, f) => payInterim(d, year, { amount: f.amount, date: f.date })}>
        <Field name="amount" label="납부한 금액 (원)" type="number" defaultValue={interim.amount || undefined} />
        <Field name="date" label="납부일" type="date" defaultValue={[interim.due, today].sort()[0]} />
      </ModalForm>
    </>
  );
}
