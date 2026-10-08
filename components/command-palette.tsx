'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { href, navGroups, pageNames, type PageId } from '@/lib/nav';
import { useOpenDetail } from './details';
import { useErp } from './erp-provider';
import { useModalDialog } from './use-modal-dialog';
import { Icon, Pill, cx } from './ui';

export const OPEN_SEARCH_EVENT = 'tessel:search';
/** Opens the search palette from anywhere on the page. */
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

interface Result { key: string; group: string; label: string; sub?: string; status?: string; page: PageId; run: () => void }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useErp();
  const router = useRouter();
  const openDetail = useOpenDetail();
  const ref = useModalDialog(open);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const go = (path: string) => () => { onClose(); router.push(path); };
    const q = query.trim().toLowerCase();
    const hit = (...v: (string | number)[]) => !q || v.join(' ').toLowerCase().includes(q);
    const pages: Result[] = navGroups(state.modules).flatMap(([group, ids]) =>
      ids.filter(id => hit(pageNames[id], group)).map(id => ({ key: 'p' + id, group: '메뉴', label: pageNames[id], sub: group, page: id, run: go(href(id)) })),
    );
    if (!q) return pages.slice(0, 8);
    const orders: Result[] = state.orders.filter(o => hit(o.id, o.name, o.vendor)).map(o => ({
      key: 'o' + o.id, group: '구매 발주', label: `${o.id} · ${o.name}`, sub: o.vendor, status: o.status, page: 'purchase', run: go('/documents/' + encodeURIComponent(o.id)),
    }));
    const sales: Result[] = state.sales.filter(s => hit(s.id, s.name, s.customer)).map(s => ({
      key: 's' + s.id, group: '판매 주문', label: `${s.id} · ${s.name}`, sub: s.customer, status: s.status, page: 'sales', run: go(href('sales')),
    }));
    const items: Result[] = state.items.filter(i => hit(i[0], i[1])).map(i => ({
      key: 'i' + i[0], group: '품목', label: i[1], sub: `${i[0]} · ${i[3]} · 재고 ${i[4]}`, page: 'inventory', run: () => { onClose(); openDetail('item', i[0]); },
    }));
    const projects: Result[] = state.collab.projects.filter(x => hit(x.name, x.desc)).map(x => ({
      key: 'pj' + x.id, group: '프로젝트', label: x.name, sub: x.desc, page: 'projects', run: go('/projects/' + x.id),
    }));
    const tasks: Result[] = state.collab.tasks.filter(t => hit(t.title, t.assignee)).map(t => ({
      key: 't' + t.id, group: '업무', label: t.title, sub: `${state.collab.projects.find(x => x.id === t.projectId)?.name ?? ''} · ${t.assignee}`, status: t.status, page: 'tasks', run: go('/projects/' + t.projectId),
    }));
    const quotes: Result[] = state.quotes.filter(x => hit(x.id, x.customer, x.name)).map(x => ({
      key: 'q' + x.id, group: '견적', label: x.id + ' · ' + x.name, sub: x.customer, status: x.status, page: 'quotes', run: go(href('quotes')),
    }));
    const partners: Result[] = state.books.partners.filter(p => hit(p.name, p.bizNo, p.contact)).map(p => ({
      key: 'pt' + p.name, group: '거래처', label: p.name, sub: [p.kind, p.bizNo, p.contact].filter(Boolean).join(' · '), page: 'acctSetup', run: go(href('acctSetup')),
    }));
    const invoices: Result[] = state.books.invoices.filter(i => hit(i.id, i.partner, i.desc, i.ref)).map(i => ({
      key: 'ti' + i.id, group: '세금계산서', label: `${i.partner} · ${i.desc}`, sub: `${i.kind} · ${i.date} · ₩${(i.supply + i.vat).toLocaleString()}`, status: i.status, page: 'taxInvoices', run: go('/print/taxinvoice/' + i.id),
    }));
    const contracts: Result[] = state.books.contracts.filter(c => hit(c.title, c.partner, c.id)).map(c => ({
      key: 'ct' + c.id, group: '계약', label: c.title, sub: `${c.partner} · ${c.start} ~ ${c.end || ''}`, status: c.sign, page: c.side === '근로' ? 'laborContracts' : 'contracts', run: go(href(c.side === '근로' ? 'laborContracts' : 'contracts')),
    }));
    const vouchers: Result[] = state.books.vouchers.filter(v => hit(v.desc, v.partner, v.project ?? '', ...v.lines.map(l => l.account))).map(v => ({
      key: 'jv' + v.id, group: '전표', label: v.desc, sub: `${v.date} · ${v.kind} · ₩${v.lines.reduce((t, l) => t + l.debit, 0).toLocaleString()}`, status: v.approvedBy ? '승인' : '미승인', page: 'vouchers', run: go(href('vouchers')),
    }));
    const people: Result[] = state.employees.filter(e => hit(e.name, e.dept, e.role)).map(e => ({
      key: 'em' + e.name, group: '직원', label: e.name, sub: `${e.dept} · ${e.role}`, status: e.left ? '퇴사' : undefined, page: 'people', run: () => { onClose(); openDetail('employee', e.name); },
    }));
    const fx: Result[] = state.books.fxDeals.filter(d => hit(d.partner, d.desc, d.currency)).map(d => ({
      key: 'fx' + d.id, group: '수출입', label: `${d.partner} · ${d.desc}`, sub: `${d.kind} · ${d.amount.toLocaleString()} ${d.currency}`, page: 'forex', run: go(href('forex')),
    }));
    const loans: Result[] = state.books.loans.filter(l => hit(l.lender, l.desc)).map(l => ({
      key: 'ln' + l.id, group: '차입금', label: `${l.lender} ${l.desc}`, sub: `₩${l.principal.toLocaleString()} · 연 ${l.rate}%`, page: 'loans', run: go(href('loans')),
    }));
    return [...pages, ...partners, ...people, ...items, ...orders, ...sales, ...quotes, ...invoices, ...contracts, ...vouchers, ...fx, ...loans, ...projects, ...tasks].slice(0, 40);
  }, [query, state, router, onClose, openDetail]);

  const choose = (r?: Result) => r?.run();

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="mx-auto mt-[12vh] w-[min(560px,calc(100%-32px))] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-pop open:animate-pop"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 text-subtle" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          ref={input}
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
          }}
          placeholder="메뉴, 발주 번호, 품목, 거래처 검색"
          aria-label="검색어"
          className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
        />
        <kbd className="rounded border border-line px-1.5 font-mono text-micro text-subtle">Esc</kbd>
      </div>
      <ul className="max-h-[50vh] overflow-auto p-2" role="listbox" aria-label="검색 결과">
        {results.length === 0 && <li className="px-3 py-8 text-center text-body text-subtle">‘{query}’에 맞는 결과가 없어요.</li>}
        {results.map((r, i) => (
          <li key={r.key} role="option" aria-selected={i === active}>
            {(i === 0 || results[i - 1].group !== r.group) && <div className="px-2.5 pt-2 pb-1 text-tiny font-semibold text-subtle">{r.group}</div>}
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
              className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === active ? 'bg-accent-soft' : '')}
            >
              <Icon page={r.page} className={i === active ? 'text-accent' : 'text-subtle'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{r.label}</span>
                {r.sub && <span className="block truncate text-tiny text-subtle">{r.sub}</span>}
              </span>
              {r.status && <Pill>{r.status}</Pill>}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-4 border-t border-line px-4 py-2 text-tiny text-subtle">
        <span><kbd className="font-mono">↑↓</kbd> 이동</span>
        <span><kbd className="font-mono">Enter</kbd> 열기</span>
      </div>
    </dialog>
  );
}
