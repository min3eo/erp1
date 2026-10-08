'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Card, CellSub, DataTable, Hint, PageHead, Pill, SearchInput, Stat, Stats, Tabs, Toolbar, cx } from '@/components/ui';
import { ToolbarField, bareSelect } from '@/components/books-ui';
import { accountLedger, incomeSummary, journal, trialBalance, type AccountType, type Source } from '@/lib/accounting';
import { accountTypes } from '@/lib/books';
import { money } from '@/lib/format';

const views = ['손익 요약', '시산표', '전표', '계정별 원장'] as const;
const sources: ('전체' | Source)[] = ['전체', '판매', '구매', '매출매입', '수금', '지급', '전표', '경비', '급여', '자산', '세무', '생산', '재고', '결산', '기초'];
const typeOrder: AccountType[] = ['자산', '부채', '자본', '수익', '비용'];

export default function AccountingPage() {
  const { state } = useErp();
  const [view, setView] = useState<(typeof views)[number]>('손익 요약');
  const [source, setSource] = useState<(typeof sources)[number]>('전체');
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState('보통예금');

  const entries = journal(state);
  const types = accountTypes(state);
  const tb = trialBalance(entries, types);
  const ledger = view === '계정별 원장' ? accountLedger(entries, account, types[account] ?? '비용') : [];
  const pl = incomeSummary(tb);
  const debit = tb.reduce((t, r) => t + r.debit, 0);
  const credit = tb.reduce((t, r) => t + r.credit, 0);
  const byType = (t: AccountType) => tb.filter(r => r.type === t).reduce((s, r) => s + r.balance, 0);

  const plRows: [string, number, ('sub' | 'total')?][] = [
    ['매출액', pl.revenue],
    ['매출원가', -pl.cogs],
    ['매출총이익', pl.gross, 'total'],
    ['판매비와관리비', -pl.sga],
    ['영업이익', pl.operating, 'total'],
    ['영업외 손익', pl.other, 'sub'],
    ['당기순이익 (세전)', pl.net, 'total'],
  ];

  return (
    <>
      <PageHead title="회계거래관리" sub="판매·구매·입출금·생산·급여·경비 거래와 직접 입력한 전표가 모두 여기 모여요. 거래를 고치면 장부도 바로 바뀝니다." />
      <Stats>
        <Stat label="매출액" value={money(pl.revenue)} unit="" foot="출고 기준 · 부가세 제외" tone="info" />
        <Stat label="매출총이익" value={money(pl.gross)} unit="" foot={`이익률 ${Math.round(pl.margin * 100)}%`} tone={pl.gross >= 0 ? 'ok' : 'danger'} />
        <Stat label="영업이익" value={money(pl.operating)} unit="" foot="매출총이익 − 판매비와관리비" tone={pl.operating >= 0 ? 'ok' : 'danger'} />
        <Stat label="전표" value={entries.length} unit="건" foot={debit === credit ? '차변 = 대변 일치' : '차대 불일치 확인 필요'} tone={debit === credit ? 'ok' : 'danger'} />
      </Stats>

      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          {view === '전표' && <SearchInput value={query} onChange={setQuery} placeholder="적요, 계정, 문서 번호 검색" />}
          {view === '계정별 원장' && (
            <ToolbarField label="계정">
              <select value={account} onChange={e => setAccount(e.target.value)} className={bareSelect}>
                {tb.map(r => <option key={r.account} value={r.account}>{r.account}</option>)}
              </select>
            </ToolbarField>
          )}
        </Toolbar>

        {view === '손익 요약' && (
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <table className="w-full border-collapse text-body">
              <caption className="mb-3 text-left text-caption text-muted">손익계산서 (요약) · 시안 데이터 전체 기간</caption>
              <tbody>
                {plRows.map(([k, v, kind]) => (
                  <tr key={k} className={cx(kind === 'total' ? 'border-t border-line font-medium text-ink' : 'text-ink-2', kind === 'sub' && 'text-muted')}>
                    <td className={cx('py-2.5', kind !== 'total' && 'pl-4')}>{k}</td>
                    <td className={cx('py-2.5 text-right tabular-nums', v < 0 && 'text-muted')}>{v < 0 ? `(${money(-v)})` : money(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <section className="rounded-card border border-line p-4">
              <h2 className="mb-3 text-caption text-muted">재무상태 요약</h2>
              <ul className="flex flex-col gap-2 text-body">
                {typeOrder.slice(0, 3).map(t => (
                  <li key={t} className="flex justify-between"><span className="text-muted">{t}</span><strong className="font-medium">{money(byType(t))}</strong></li>
                ))}
                <li className="flex justify-between border-t border-line pt-2"><span className="text-muted">당기 손익 (자본에 더해짐)</span><strong className="font-medium">{money(byType('수익') - byType('비용'))}</strong></li>
              </ul>
              <p className="mt-3 text-tiny text-subtle">자산 = 부채 + 자본 + 당기 손익 → {byType('자산') === byType('부채') + byType('자본') + byType('수익') - byType('비용') ? '일치' : '불일치'}</p>
            </section>
          </div>
        )}

        {view === '시산표' && (
          <>
            <DataTable
              foot={false}
              headers={['계정', '분류', '차변 합계', '대변 합계', '잔액']}
              rows={[
                ...[...tb].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || Object.keys(types).indexOf(a.account) - Object.keys(types).indexOf(b.account)).map(r => [
                  <strong key="a" className="font-medium text-ink">{r.account}</strong>,
                  <Pill key="t" tone="neutral">{r.type}</Pill>,
                  money(r.debit),
                  money(r.credit),
                  <span key="b" className={r.balance < 0 ? 'text-danger' : 'text-ink'}>{money(r.balance)}</span>,
                ]),
                [<strong key="a">합계</strong>, '', <strong key="d">{money(debit)}</strong>, <strong key="c">{money(credit)}</strong>, <Pill key="ok" tone={debit === credit ? 'ok' : 'danger'}>{debit === credit ? '차대 일치' : '불일치'}</Pill>],
              ]}
            />
          </>
        )}

        {view === '전표' && (
          <>
            <div className="border-b border-line px-3 py-2">
              <Tabs options={sources} value={source} onChange={setSource} />
            </div>
            <DataTable
              headers={['일자', '구분', '적요', '차변', '대변', '금액']}
              rows={entries
                .filter(e => (source === '전체' || e.source === source) && [e.desc, e.ref, ...e.lines.map(l => l.account)].join(' ').includes(query))
                .map(e => {
                  const dr = e.lines.filter(l => l.debit);
                  const cr = e.lines.filter(l => l.credit);
                  return [
                    e.date,
                    <Pill key="s" tone="neutral">{e.source}</Pill>,
                    <>{e.desc}<CellSub className="font-mono">{e.ref}</CellSub></>,
                    <span key="d" className="flex flex-col">{dr.map((l, i) => <span key={i}>{l.account} <span className="text-subtle">{money(l.debit)}</span></span>)}</span>,
                    <span key="c" className="flex flex-col">{cr.map((l, i) => <span key={i}>{l.account} <span className="text-subtle">{money(l.credit)}</span></span>)}</span>,
                    money(dr.reduce((t, l) => t + l.debit, 0)),
                  ];
                })}
            />
          </>
        )}
        {view === '계정별 원장' && (
          <DataTable
            headers={['일자', '구분', '적요', '차변 금액', '대변 금액', '잔액']}
            rows={ledger.map(r => [
              r.date,
              <Pill key="s" tone="neutral">{r.source}</Pill>,
              <>{r.desc}<CellSub className="font-mono">{r.ref}</CellSub></>,
              r.debit ? money(r.debit) : '',
              r.credit ? money(r.credit) : '',
              <strong key="b" className={cx('font-medium', r.balance < 0 ? 'text-danger' : 'text-ink')}>{money(r.balance)}</strong>,
            ])}
          />
        )}
      </Card>
      <Hint className="mt-4">
        재고는 품목 기준 단가로 평가하고, 생산 투입과 완성품 평가의 차이는 재공품 계정에 남아요. 세무 신고용 장부가 아닌 시안 계산입니다.
      </Hint>
    </>
  );
}
