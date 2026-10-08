'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { inputClass } from '@/components/form-kit';
import { Button, ButtonLink, Card, CardHead, CellSub, DataTable, Hint, PageHead, Pill, Tabs, Toolbar } from '@/components/ui';
import { addPartner, addTrade, expenseAccounts } from '@/lib/books';
import { money } from '@/lib/format';
import { previewImport, runImport } from '@/lib/import';
import { href } from '@/lib/nav';
import { reconcileHometax } from '@/lib/operations-report';

const tabs = ['은행 · 카드 내역', '홈택스 매입 대사', '외부 서비스'] as const;
const area = 'h-40 w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-caption outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';

const services: [string, string, string][] = [
  ['홈택스 전자세금계산서', '발행 · 국세청 전송, 매입분 자동 수집', '발행은 지금 상태 기록까지만 돼요. 매입분은 홈택스에서 내려받아 ‘홈택스 매입 대사’에 붙여 넣으세요.'],
  ['은행 거래내역', '입출금 자동 수집 (오픈뱅킹 · 스크래핑)', '인터넷뱅킹 엑셀을 ‘은행 · 카드 내역’에 붙여 넣으면 계좌/카드 화면에서 처리할 수 있어요.'],
  ['카드사 이용내역', '법인카드 승인 · 매입 내역 수집', '카드사 이용내역 엑셀을 같은 방법으로 넣으세요. 처리할 때 부가세 공제를 고를 수 있어요.'],
  ['4대보험 EDI', '취득 · 상실 신고, 고지 내역 조회', '4대보험 화면에서 신고 대상을 확인하고 EDI 사이트에서 직접 신고한 뒤 완료로 표시하세요.'],
  ['전자서명', '계약서 서명 요청 · 서명 완료 수신', '서명 요청 · 완료를 상태로 기록해요. 실제 발송은 전자서명 서비스 연결이 필요해요.'],
  ['쇼핑몰 · 택배', '주문 수신, 송장 · 배송 상태', '판매 · 출고에서 송장 번호를 기록해요. 주문 자동 수신은 연결이 필요해요.'],
];

export default function IntegrationsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('은행 · 카드 내역');
  return (
    <>
      <PageHead
        title="연동 관리"
        sub="은행 · 카드사 · 홈택스 자료를 파일로 받아 장부와 맞춰요. 자동 수집은 서버 연동이 필요해서, 지금은 내려받은 엑셀을 붙여 넣는 방식이에요."
      />
      <Card>
        <Toolbar><Tabs options={tabs} value={tab} onChange={setTab} /></Toolbar>
        {tab === '은행 · 카드 내역' && <BankImport />}
        {tab === '홈택스 매입 대사' && <HometaxCheck />}
        {tab === '외부 서비스' && (
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {services.map(([title, what, now]) => (
              <section key={title} className="rounded-card border border-line p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-title font-medium">{title}</h2>
                  <Pill tone="neutral">서버 연동 필요</Pill>
                </div>
                <p className="mt-2 text-caption text-muted">{what}</p>
                <p className="mt-3 border-t border-line pt-3 text-caption text-ink-2">지금은: {now}</p>
              </section>
            ))}
          </div>
        )}
      </Card>
      <Hint className="mt-4">파일로 들인 자료도 다른 입력과 똑같이 검사하고 변경 이력에 남아요. 실제 운영에서는 이 탭들이 자동 수집으로 바뀌어요.</Hint>
    </>
  );
}

function BankImport() {
  const { state, mutate, toast } = useErp();
  const [text, setText] = useState('');
  const p = text.trim() ? previewImport(state, 'bankTx', text) : null;
  const good = p?.rows.filter(r => !r.error).length ?? 0;
  return (
    <div className="p-4">
      <label htmlFor="bank" className="text-caption font-medium text-ink-2">인터넷뱅킹 · 카드사 거래내역을 머리글까지 복사해 붙여 넣기 (계좌 · 카드, 거래일자, 적요, 입금액, 출금액)</label>
      <textarea id="bank" value={text} onChange={e => setText(e.target.value)} className={area} placeholder={'계좌 · 카드\t거래일자\t적요\t입금액\t출금액\n기업은행 보통예금\t2026-10-08\tKT 통신요금\t\t88000'} />
      {p && (
        <>
          {p.missing.length > 0 && <p className="mt-2 text-caption text-danger">필수 열이 없어요: {p.missing.join(', ')}</p>}
          <DataTable
            headers={['행', '계좌 · 카드', '거래일자', '적요', '입금액', '출금액', '검사']}
            rows={p.rows.map(r => [r.line, r.values.fund, r.values.date, r.values.desc, r.values.in, r.values.out, r.error ? <span key="e" className="text-caption text-danger">{r.error}</span> : <Pill key="o" tone="ok">정상</Pill>])}
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <ButtonLink href={href('funds')}>계좌/카드에서 처리하기</ButtonLink>
            <Button variant="primary" disabled={!good} onClick={() => {
              try {
                const r = mutate(d => runImport(d, 'bankTx', text), `은행 · 카드 내역 ${good}건 가져오기`);
                toast(`${r.imported}건을 계좌/카드 내역에 넣었어요.${r.skipped ? ` ${r.skipped}건은 건너뛰었어요.` : ''}`);
                setText('');
              } catch (e) { toast((e as Error).message, 'error'); }
            }}>정상 {good}건 가져오기</Button>
          </div>
        </>
      )}
    </div>
  );
}

function HometaxCheck() {
  const { state, mutate, toast } = useErp();
  const [text, setText] = useState('');
  const [accounts, setAccounts] = useState<Record<number, string>>({});
  const r = text.trim() ? reconcileHometax(state, text) : null;
  const book = (row: NonNullable<typeof r>['missing'][number]) => {
    try {
      mutate(d => {
        if (row.bizNo && !d.books.partners.some(p => p.name === row.name)) addPartner(d, { name: row.name, bizNo: row.bizNo, kind: '매입처' });
        addTrade(d, { kind: '매입', date: row.date, partner: row.name, desc: row.item || '홈택스 매입 세금계산서', account: accounts[row.line] ?? '소모품비', supply: row.supply, settle: '외상', proof: '세금계산서' });
      }, `홈택스 대사 · ${row.name} 매입 등록`);
      toast(`${row.name} 매입을 장부에 넣었어요. 미지급금으로 잡혔어요.`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div className="p-4">
      <label htmlFor="hometax" className="text-caption font-medium text-ink-2">홈택스 › 전자세금계산서 › 목록조회(매입)에서 내려받은 표를 붙여 넣기 (작성일자, 공급자사업자등록번호, 상호, 공급가액, 세액, 품목명)</label>
      <textarea id="hometax" value={text} onChange={e => setText(e.target.value)} className={area} placeholder={'작성일자\t공급자사업자등록번호\t상호\t공급가액\t세액\t품목명\n2026-10-05\t133-81-22018\t한빛 공급\t900000\t90000\t온라인 광고 대행'} />
      {r?.error && <p className="mt-2 text-caption text-danger">{r.error}</p>}
      {r && !r.error && (
        <div className="mt-4 flex flex-col gap-4">
          <CardHead title={`장부에 없는 매입 ${r.missing.length}건`} sub={`일치 ${r.matched.length}건 · 장부에만 있음 ${r.extra.length}건`} />
          <DataTable
            headers={['작성일자', '공급자', '품목', '공급가액', '세액', '계정', '']}
            rows={r.missing.map(m => [
              m.date,
              <>{m.name}<CellSub>{m.bizNo || '사업자번호 없음'}</CellSub></>,
              m.item || '—',
              money(m.supply),
              money(m.vat),
              <select key="a" value={accounts[m.line] ?? '소모품비'} onChange={e => setAccounts(a => ({ ...a, [m.line]: e.target.value }))} className="h-8 rounded-md border border-line bg-surface px-2 text-caption">
                {[...expenseAccounts(state), '재고자산', '유형자산'].map(a => <option key={a}>{a}</option>)}
              </select>,
              <Button key="b" variant="primary" onClick={() => book(m)}>매입 등록</Button>,
            ])}
          />
          {r.extra.length > 0 && (
            <>
              <CardHead title="장부에만 있는 매입 계산서" sub="홈택스에 없으면 아직 발급 전이거나, 사업자번호 · 금액이 다를 수 있어요. 공급자에게 확인하세요." />
              <DataTable foot={false} headers={['작성일', '공급자', '내용', '공급가액', '세액']} rows={r.extra.map(i => [i.date, i.partner, i.desc, money(i.supply), money(i.vat)])} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
