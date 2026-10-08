'use client';

import { useState, type ReactNode } from 'react';
import { useOpenDetail } from '@/components/details';
import { useErp } from '@/components/erp-provider';
import { Button, Card, DataTable, Icon, PageHead, Pill, SearchInput, Subtitle, Tabs, Toolbar } from '@/components/ui';
import { unit } from '@/lib/flow-core';
import { masterVendors, masterWarehouses } from '@/lib/masters';

const masterTabs = ['품목', '거래처', '창고', '거래처별 단가'] as const;

export default function MastersPage() {
  const { state } = useErp();
  const openDetail = useOpenDetail();
  const [tab, setTab] = useState<(typeof masterTabs)[number]>('품목');
  const [query, setQuery] = useState('');
  const matches = (...values: (string | number)[]) => values.join(' ').includes(query);

  let content: ReactNode;
  if (tab === '품목') {
    content = (
      <DataTable
        headers={['품목 코드', '품목명', '유형', '기본 단위', '안전재고', '상태', '상세']}
        rows={state.items.filter(i => matches(...i)).map(i => [
          i[0], <strong key="n">{i[1]}</strong>, i[2], unit(i), i[5], <Pill key="s">사용 중</Pill>,
          <Button key="d" onClick={() => openDetail('item', i[0])}>상세 보기</Button>,
        ])}
      />
    );
  } else if (tab === '거래처') {
    content = (
      <DataTable
        headers={['거래처 코드', '거래처명', '유형', '담당자', '결제 조건', '상태', '상세']}
        rows={masterVendors(state).filter(v => matches(...Object.values(v))).map(v => [
          v.code, <strong key="n">{v.name}</strong>, v.type, v.owner, v.terms, <Pill key="s">{v.status}</Pill>,
          <Button key="d" onClick={() => openDetail('vendor', v.code)}>상세 보기</Button>,
        ])}
      />
    );
  } else if (tab === '거래처별 단가') {
    // Latest price per partner and item, taken from sales, quotes and purchase orders.
    const latest = new Map<string, { side: string; partner: string; code: string; name: string; price: number; date: string; source: string }>();
    const add = (side: string, partner: string, code: string, name: string, price: number, date: string, source: string) => {
      const key = side + partner + code;
      const d = date.replace(/./g, '-');
      if (!latest.has(key) || latest.get(key)!.date < d) latest.set(key, { side, partner, code, name, price, date: d, source });
    };
    state.sales.forEach(x => add('판매', x.customer, x.itemCode, x.name, x.price, x.date, x.id));
    state.quotes.filter(q => q.status !== '거절').forEach(x => add('판매', x.customer, x.itemCode, x.name, x.price, x.date, x.id));
    state.orders.forEach(x => add('구매', x.vendor, x.itemCode, x.name, x.price, x.date, x.id));
    content = (
      <DataTable
        headers={['구분', '거래처', '품목', '최근 단가', '기준 단가 대비', '최근 거래', '일자']}
        rows={[...latest.values()].filter(r => matches(r.partner, r.name, r.code)).sort((a, b) => a.side.localeCompare(b.side) || a.partner.localeCompare(b.partner)).map(r => {
          const std = state.items.find(i => i[0] === r.code)?.[6] ?? 0;
          const diff = std ? Math.round(((r.price - std) / std) * 100) : 0;
          return [
            <Pill key="s" tone={r.side === '판매' ? 'info' : 'neutral'}>{r.side}</Pill>,
            <strong key="p" className="font-medium text-ink">{r.partner}</strong>,
            <span key="n">{r.name}<span className="ml-1.5 text-tiny text-subtle">{r.code}</span></span>,
            r.price.toLocaleString() + '원',
            <span key="d" className={diff > 0 ? 'text-ok' : diff < 0 ? 'text-warn' : 'text-muted'}>{diff > 0 ? '+' : ''}{diff}%</span>,
            <span key="r" className="font-mono text-caption">{r.source}</span>,
            r.date,
          ];
        })}
      />
    );
  } else {
    content = (
      <div className="grid gap-4.5 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        {masterWarehouses(state).filter(w => w.name.includes(query)).map(w => (
          <button
            key={w.code}
            type="button"
            onClick={() => openDetail('warehouse', w.code)}
            className="rounded-card border border-accent-line bg-surface p-5.5 text-left transition hover:border-line-strong hover:shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-9.75 place-items-center rounded-card bg-accent-soft text-accent"><Icon page="inventory" /></span>
              <Pill>운영 중</Pill>
            </div>
            <h2 className="mt-5 text-title font-semibold">{w.name}</h2>
            <p className="text-caption text-muted">{w.code} · {w.type}</p>
            <div className="mt-3 flex flex-col gap-2.5 border-t border-line py-4 text-caption text-muted">
              <span className="flex justify-between">관리 부서 <b className="font-medium text-ink-2">{w.owner}</b></span>
              <span className="flex justify-between">보관 품목 <b className="font-medium text-ink-2">{w.count}개</b></span>
            </div>
            <span className="text-caption text-accent">창고 상세 →</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHead title="기준정보 관리" sub="회사 업무의 기준이 되는 품목·거래처·창고 정보를 확인하세요." />
      <Card>
        <Toolbar>
          <Tabs options={masterTabs} value={tab} onChange={t => { setTab(t); setQuery(''); }} />
          <SearchInput value={query} onChange={setQuery} placeholder="기준정보 검색" />
        </Toolbar>
        {content}
      </Card>
      <Subtitle>담당자·결제 조건·상세 설정은 화면 구성 예시입니다.</Subtitle>
    </>
  );
}
