'use client';

import { useState } from 'react';
import { KeyValues, Options, SideBox, ToolbarField, bareSelect } from './books-ui';
import { useErp } from './erp-provider';
import { Field, ModalForm, Select, Suggestions, useAction } from './form-kit';
import { Button, ButtonLink, Card, CellSub, DataTable, Pill, Stat, Stats, Tabs, Toolbar } from './ui';
import { addOtherIncome, expenseAccounts, otherIncomeTax, partnerNames } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import {
  fileVat, payWithholding, quarterEnded, quarterLabel, recentQuarters, vatFiling, vatSummary,
  withholdingFiling, withholdingMonths, withholdingSummary,
} from '@/lib/tax';
import { vatReturn } from '@/lib/vat-return';

export const TAX_NOTE = '시안 계산이에요. 실제 신고는 홈택스나 세무 대리인을 통해 하고, ‘신고 · 납부 완료’는 낸 세금을 장부에 기록하는 버튼입니다.';

export function VatTab() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const quarters = recentQuarters(today);
  const [period, setPeriod] = useState(quarters.find(q => quarterEnded(q, today) && !vatFiling(state, q)) ?? quarters[0]);
  const s = vatSummary(state, period);
  const filed = vatFiling(state, period);
  const ended = quarterEnded(period, today);

  return (
    <>
      <Stats>
        <Stat label="매출세액" value={money(s.output)} unit="" foot="부가세예수금" tone="info" />
        <Stat label="매입세액" value={money(s.input)} unit="" foot="부가세대급금 · 공제 가능" />
        <Stat label={s.payable >= 0 ? '납부할 세액' : '환급받을 세액'} value={money(Math.abs(s.payable))} unit="" foot={`신고 · 납부 기한 ${s.due}`} tone={s.payable >= 0 ? 'warn' : 'ok'} />
        <Stat label="신고 상태" value={filed ? '완료' : ended ? '신고 대상' : '진행 중'} unit="" foot={filed ? `${filed.date} 처리` : ended ? '분기 종료' : '분기가 끝나면 신고'} tone={filed ? 'ok' : ended ? 'warn' : undefined} />
      </Stats>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <Toolbar>
            <ToolbarField label="신고 기간">
              <select value={period} onChange={e => setPeriod(e.target.value)} className={bareSelect}>
                {quarters.map(q => <option key={q} value={q}>{quarterLabel(q)}{vatFiling(state, q) ? ' · 신고 완료' : ''}</option>)}
              </select>
            </ToolbarField>
            <span className="flex gap-2">
              <ButtonLink href={`/print/report/vat?p=${period}`}>매입매출장</ButtonLink>
              <Button variant="primary" disabled={!!filed || !ended} onClick={() => act(d => fileVat(d, period), s.payable >= 0 ? '부가세 신고 · 납부를 장부에 기록했어요.' : '부가세 환급 신청을 기록했어요. 환급금은 미수금으로 잡혀요.')}>
                {filed ? '신고 완료' : '신고 · 납부 완료'}
              </Button>
            </span>
          </Toolbar>
          <DataTable
            foot={false}
            headers={['거래 구분', '매출세액', '매입세액', '차감']}
            rows={[
              ...s.bySource.map(r => [<Pill key="s" tone="neutral">{r.source}</Pill>, money(r.output), money(r.input), money(r.output - r.input)]),
              [<strong key="t">합계</strong>, <strong key="o">{money(s.output)}</strong>, <strong key="i">{money(s.input)}</strong>, <strong key="p" className={s.payable < 0 ? 'text-ok' : 'text-ink'}>{money(s.payable)}</strong>],
            ]}
          />
        </Card>
        <aside className="flex flex-col gap-3">
          <SideBox title="세금계산서 (이 기간)">
            <KeyValues rows={[
              ['매출 발행', `${s.invoices.salesCount}건 · ${money(s.invoices.salesSupply)}`],
              ['매입 수취', `${s.invoices.purchaseCount}건 · ${money(s.invoices.purchaseSupply)}`],
              ['미전송 매출', <span key="u" className={s.invoices.unsent ? 'text-warn' : ''}>{s.invoices.unsent}건</span>],
              ['영세율 (수출)', money(s.zeroRated)],
            ]} />
          </SideBox>
          <SideBox title="확인할 것">
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-caption text-muted">
              <li>세금계산서 없이 들어온 매입세액은 공제되지 않을 수 있어요.</li>
              <li>접대비 · 비영업용 승용차 관련 매입세액은 불공제예요.</li>
              <li>카드 매입은 카드 매출전표 수취명세서로 공제받아요.</li>
            </ul>
          </SideBox>
        </aside>
      </div>
      <VatReturnCard period={period} />
    </>
  );
}

const returnViews = ['신고서 요약', '세금계산서합계표', '계산서합계표', '신용카드 수취명세서', '불공제 명세', '수출실적명세서'] as const;

/** 부가세 신고서 (일반과세자) lines and the attachments 세무사 asks for, for one quarter. */
function VatReturnCard({ period }: { period: string }) {
  const { state } = useErp();
  const [view, setView] = useState<(typeof returnViews)[number]>('신고서 요약');
  const r = vatReturn(state, period);
  const a = r.attachments;
  const partnerRows = (list: typeof a.salesTaxInvoices) => list.map(p => [p.partner, p.bizNo || <span key="b" className="text-warn">미등록</span>, p.count, money(p.supply), money(p.vat), p.electronic ? '전자' : '전송 전']);
  const signed = (n: number) => (n < 0 ? `(${money(-n)})` : money(n));
  return (
    <Card className="mt-4">
      <Toolbar>
        <Tabs options={returnViews} value={view} onChange={setView} />
      </Toolbar>
      {view === '신고서 요약' && (
        <DataTable
          foot={false}
          headers={['번호', '구분', '금액 (공급가액)', '세액']}
          rows={[
            [<strong key="h">매출</strong>, '', '', ''],
            ...r.sales.map(l => [l.no, <>{l.label}{l.note && <CellSub>{l.note}</CellSub>}</>, signed(l.supply), signed(l.vat)]),
            ['', <strong key="t">매출세액 합계 (㉮)</strong>, '', <strong key="v">{money(r.output)}</strong>],
            [<strong key="h2">매입</strong>, '', '', ''],
            ...r.purchases.map(l => [l.no, <>{l.label}{l.note && <CellSub>{l.note}</CellSub>}</>, signed(l.supply), signed(l.vat)]),
            ['', <strong key="t2">공제받을 매입세액 (㉯)</strong>, '', <strong key="v2">{money(r.input)}</strong>],
            ['', <strong key="t3">{r.payable >= 0 ? '납부할 세액 (㉮ − ㉯)' : '환급받을 세액'}</strong>, `면세 수입금액 ${money(a.exempt.supply)}`, <strong key="v3" className={r.payable < 0 ? 'text-ok' : 'text-ink'}>{money(Math.abs(r.payable))}</strong>],
          ]}
        />
      )}
      {view === '세금계산서합계표' && (
        <>
          <p className="px-4 pt-3 text-caption text-muted">매출처별 (발행 · 전송한 것만)</p>
          <DataTable foot={false} headers={['거래처', '사업자등록번호', '매수', '공급가액', '세액', '발급 방식']} rows={partnerRows(a.salesTaxInvoices)} />
          <p className="border-t border-line px-4 pt-3 text-caption text-muted">매입처별</p>
          <DataTable foot={false} headers={['거래처', '사업자등록번호', '매수', '공급가액', '세액', '발급 방식']} rows={partnerRows(a.purchaseTaxInvoices)} />
        </>
      )}
      {view === '계산서합계표' && (
        <>
          <p className="px-4 pt-3 text-caption text-muted">면세 거래의 계산서예요. 부가세 신고 때가 아니라 다음 해 2월 10일까지 사업장현황 · 합계표로 제출해요.</p>
          <DataTable foot={false} headers={['거래처', '사업자등록번호', '매수', '공급가액', '세액', '구분']} rows={[...partnerRows(a.salesInvoices).map(r => [...r.slice(0, 5), '매출']), ...partnerRows(a.purchaseInvoices).map(r => [...r.slice(0, 5), '매입'])]} />
        </>
      )}
      {view === '신용카드 수취명세서' && (
        <DataTable
          headers={['일자', '가맹점 · 거래처', '사업자등록번호', '구분', '공급가액', '세액']}
          rows={a.cards.map(c => [c.date, <>{c.partner}{'card' in c && c.card && <CellSub>{c.card}</CellSub>}</>, c.bizNo || '—', c.kind, money(c.supply), money(c.vat)])}
        />
      )}
      {view === '불공제 명세' && (
        <DataTable foot={false} headers={['불공제 사유', '매수', '공급가액', '불공제 세액']} rows={a.nonDeductible.map(n => [n.reason, n.count, money(n.supply), money(n.vat)])} />
      )}
      {view === '수출실적명세서' && (
        <DataTable
          headers={['선적일', '거래처', '품목', '통화', '외화 금액', '환율', '원화 금액']}
          rows={a.exports.map(e => [e.date, e.partner, e.desc, e.currency, e.amount.toLocaleString(), e.rate.toLocaleString(), money(e.krw)])}
        />
      )}
    </Card>
  );
}

export function WithholdingTab() {
  const { state } = useErp();
  const act = useAction();
  const months = withholdingMonths(state);
  const [month, setMonth] = useState(months.find(m => m < date().slice(0, 7) && !withholdingFiling(state, m)) ?? months[0]);
  const s = withholdingSummary(state, month);
  const filed = withholdingFiling(state, month);
  const ended = month < date().slice(0, 7);

  return (
    <>
      <Stats>
        <Stat label="소득세" value={money(s.tax)} unit="" foot="국세 · 세무서" tone="info" />
        <Stat label="지방소득세" value={money(s.local)} unit="" foot="지방세 · 위택스" />
        <Stat label="납부할 합계" value={money(s.total)} unit="" foot={`신고 · 납부 기한 ${s.due}`} tone={filed ? 'ok' : s.total ? 'warn' : undefined} />
        <Stat label="신고 상태" value={filed ? '완료' : ended ? '신고 대상' : '진행 중'} unit="" foot={filed ? `${filed.date} 납부` : ended ? '지급한 달 종료' : '달이 끝나면 신고'} tone={filed ? 'ok' : ended && s.total ? 'warn' : undefined} />
      </Stats>
      <Card>
        <Toolbar>
          <ToolbarField label="지급 월">
            <select value={month} onChange={e => setMonth(e.target.value)} className={bareSelect}>
              {months.map(m => <option key={m} value={m}>{m}{withholdingFiling(state, m) ? ' · 납부 완료' : ''}</option>)}
            </select>
          </ToolbarField>
          <span className="flex gap-2">
            <ButtonLink href={`/print/report/wht?p=${month}`}>이행상황신고서</ButtonLink>
            <Button variant="primary" disabled={!!filed || !ended || !s.total} onClick={() => act(d => payWithholding(d, month), '원천세 납부를 장부에 기록했어요.')}>
              {filed ? '납부 완료' : '신고 · 납부 완료'}
            </Button>
          </span>
        </Toolbar>
        <DataTable
          foot={false}
          headers={['코드', '소득 구분', '인원', '총지급액', '소득세', '지방소득세']}
          rows={[
            ...s.rows.map(r => [<span key="c" className="font-mono text-caption">{r.code}</span>, r.label, r.people ? `${r.people}명` : '—', money(r.gross), money(r.tax), money(r.local)]),
            ['', <strong key="t">합계</strong>, '', <strong key="g">{money(s.rows.reduce((t, r) => t + r.gross, 0))}</strong>, <strong key="x">{money(s.tax)}</strong>, <strong key="l">{money(s.local)}</strong>],
          ]}
        />
      </Card>
    </>
  );
}

export function OtherIncomeTab() {
  const { state } = useErp();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('사업소득');
  const [gross, setGross] = useState(0);
  const preview = otherIncomeTax(kind === '기타소득' ? '기타소득' : '사업소득', gross);
  const list = state.books.otherIncome;
  return (
    <>
      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-caption text-muted">프리랜서 · 강사 등 근로자가 아닌 사람에게 준 돈</span>
          <Button variant="primary" onClick={() => setOpen(true)}>지급 등록</Button>
        </div>
        <DataTable
          headers={['지급일', '소득자', '구분', '내용', '지급액', '원천세', '실지급액']}
          rows={list.map(o => {
            const t = otherIncomeTax(o.kind, o.gross);
            return [
              o.date,
              <strong key="n" className="font-medium text-ink">{o.name}</strong>,
              <Pill key="k" tone="neutral">{o.kind}</Pill>,
              <>{o.desc}<CellSub>{o.account}</CellSub></>,
              money(o.gross),
              <>{money(t.tax + t.local)}<CellSub>{o.kind === '사업소득' ? '3% + 지방 0.3%' : t.tax ? '필요경비 60% 후 20% + 지방 2%' : '과세최저한 (5만 원 이하)'}</CellSub></>,
              <strong key="net" className="text-ink">{money(t.net)}</strong>,
            ];
          })}
        />
      </Card>
      <ModalForm
        open={open}
        onClose={() => { setOpen(false); setGross(0); }}
        title="사업 · 기타소득 지급"
        submitLabel="지급 등록"
        done="지급을 기록했어요. 원천세는 지급한 달 신고에 들어가요."
        run={(d, f) => addOtherIncome(d, { date: f.date, name: f.name, kind: f.kind, gross: f.gross, desc: f.desc, account: f.account })}
      >
        <div className="grid grid-cols-2 gap-3">
          <Select name="kind" label="소득 구분" value={kind} onChange={setKind}><Options values={['사업소득', '기타소득']} /></Select>
          <Field name="date" label="지급일" type="date" defaultValue={date()} />
        </div>
        <Field name="name" label="소득자" list="income-names" placeholder={kind === '사업소득' ? '예) 프리랜서 디자이너' : '예) 외부 강사'} />
        <Suggestions id="income-names" values={[...new Set([...list.map(o => o.name), ...partnerNames(state)])]} />
        <Field name="desc" label="지급 내용" placeholder={kind === '사업소득' ? '예) 웹 디자인 외주' : '예) 일시 강연료'} />
        <div className="grid grid-cols-2 gap-3">
          <label className="my-3 block text-caption font-medium text-ink-2">
            지급액 (세전, 원)
            <input name="gross" type="number" min={1} required value={gross || ''} onChange={e => setGross(Number(e.target.value))} className="mt-1.5 block h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-body outline-none focus:border-accent" />
          </label>
          <Select name="account" label="비용 계정" defaultValue="지급수수료"><Options values={expenseAccounts(state)} /></Select>
        </div>
        <p className="-mt-1.5 text-tiny text-subtle">원천세 {money(preview.tax + preview.local)} · 실지급액 {money(preview.net)}</p>
      </ModalForm>
    </>
  );
}
