'use client';

import type { ReactNode } from 'react';
import { approverFor, assertApprover, currentUser, type ApprovalKind, type Role } from '@/lib/admin';
import { approveVoucher, contractValue, decideContract, decideExpense, deleteVoucher, fundById } from '@/lib/books';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { useErp } from './erp-provider';
import { CellSub } from './ui';

export interface ApprovalEntry {
  key: string;
  kind: '구매' | '휴가' | '재고 조정' | '경비' | '전표' | '계약';
  title: string;
  person: string;
  /** One-line summary for compact lists. */
  summary: string;
  detail: ReactNode;
  decide: (draft: F.ErpState, approved: boolean) => void;
  done: (approved: boolean) => string;
  amount: number;
  /** Role that must approve, from the 전결 규정. */
  approver: Role;
}

type Raw = Omit<ApprovalEntry, 'approver'>;

const pendingOnly = (status: string) => {
  if (status !== '승인 대기') throw Error('이미 처리한 요청입니다.');
};
const decided = (approved: boolean) => (approved ? '승인' : '반려') + ' 처리했어요.';

/** Every pending purchase, leave and stock-adjustment request, in one list. */
export function approvalEntries(state: F.ErpState): ApprovalEntry[] {
  const kindOf: Record<ApprovalEntry['kind'], ApprovalKind> = { 구매: '구매', 휴가: '휴가', '재고 조정': '재고 조정', 경비: '경비', 전표: '전표', 계약: '계약' };
  const me = (d: F.ErpState) => { const u = currentUser(d); return { name: u?.name ?? '', role: u?.role ?? '' }; };
  const raw: Raw[] = [
    ...state.orders
      .filter(o => o.status === '승인 대기')
      .map((o): Raw => ({
        key: 'order:' + o.id,
        kind: '구매',
        title: o.name + ' 구매 요청',
        person: '구매팀',
        summary: `${o.vendor} · ${money(o.qty * o.price)}`,
        detail: money(o.qty * o.price),
        amount: o.qty * o.price,
        decide: (d, approved) => {
          if (approved) return void F.approve(d, o.id);
          const order = d.orders.find(x => x.id === o.id)!;
          pendingOnly(order.status);
          order.status = '반려';
        },
        done: decided,
      })),
    ...state.leaves.flatMap((l, index): Raw[] =>
      l.status !== '승인 대기'
        ? []
        : [{
            key: 'leave:' + index,
            kind: '휴가',
            title: l.type + ' 신청',
            person: l.name,
            summary: `${l.name} · ${l.date} · ${l.days}일`,
            detail: `${l.date} · ${l.days}일`,
            amount: 0,
            decide: (d, approved) => {
              pendingOnly(d.leaves[index].status);
              d.leaves[index].status = approved ? '승인 완료' : '반려';
            },
            done: decided,
          }],
    ),
    ...state.adjustments
      .filter(a => a.status === '승인 대기')
      .map((a): Raw => ({
        key: 'adjust:' + a.id,
        kind: '재고 조정',
        title: a.name + ' 재고 조정',
        person: '실사 담당',
        summary: `${a.expected} → ${a.actual} ${a.unit} · ${a.reason}`,
        detail: (
          <>
            {a.expected} → {a.actual} {a.unit}
            <CellSub>{a.reason}</CellSub>
          </>
        ),
        amount: Math.abs(a.delta) * (state.items.find(i => i[0] === a.code)?.[6] ?? 0),
        decide: (d, approved) => void F.decideAdjustment(d, a.id, approved),
        done: approved => (approved ? '조정을 승인하고 재고에 반영했어요.' : '조정 요청을 반려했어요.'),
      })),
    ...state.books.expenses
      .filter(e => e.status === '승인 대기')
      .map((e): Raw => ({
        key: 'expense:' + e.id,
        kind: '경비',
        title: `${e.account} 경비 청구`,
        person: e.person,
        summary: `${e.desc} · ${money(e.amount)} · ${e.method}`,
        detail: (
          <>
            {money(e.amount)}
            <CellSub>{e.desc} · {e.method}</CellSub>
          </>
        ),
        amount: e.amount,
        decide: (d, approved) => void decideExpense(d, e.id, approved),
        done: approved => (approved ? '경비를 승인하고 장부에 반영했어요.' : '경비 청구를 반려했어요.'),
      })),
    ...state.books.vouchers
      .filter(v => !v.approvedBy && v.origin !== '결산' && !v.reversalOf)
      .map((v): Raw => {
        const total = v.lines.reduce((t, l) => t + l.debit, 0);
        const sides = (debit: boolean) => v.lines.filter(l => (debit ? l.debit : l.credit)).map(l => (l.fund ? fundById(state, l.fund)?.name ?? l.account : l.account)).join(', ');
        return {
          key: 'voucher:' + v.id,
          kind: '전표',
          title: `${v.kind} 전표 · ${v.desc}`,
          person: v.origin,
          summary: `${v.date} · ${sides(true)} / ${sides(false)} · ${money(total)}`,
          detail: (
            <>
              {money(total)}
              <CellSub>{v.date} · {sides(true)} / {sides(false)}{v.evidence ? ` · ${v.evidence}` : ''}</CellSub>
            </>
          ),
          amount: total,
          decide: (d, approved) => void (approved ? approveVoucher(d, v.id, me(d)) : deleteVoucher(d, v.id)),
          done: approved => (approved ? '전표를 승인했어요. 이제 역분개로만 취소돼요.' : '전표를 반려해 지웠어요. 계좌/카드 내역은 미처리로 돌아가요.'),
        };
      }),
    ...state.books.contracts
      .filter(c => c.side !== '근로' && c.sign === '작성' && !c.approvedBy && !c.rejectedAt)
      .map((c): Raw => ({
        key: 'contract:' + c.id,
        kind: '계약',
        title: `${c.side} 계약 · ${c.title}`,
        person: c.partner,
        summary: `${c.start} ~ ${c.end || '기간 없음'} · ${money(c.amount)}${c.cycle === '월 정기' ? '/월' : ''}`,
        detail: (
          <>
            {money(contractValue(c))}
            <CellSub>{c.cycle === '월 정기' ? `월 ${money(c.amount)} × 12개월` : '일시'} · {c.category}</CellSub>
          </>
        ),
        amount: contractValue(c),
        decide: (d, approved) => void decideContract(d, c.id, approved, me(d)),
        done: approved => (approved ? '계약을 승인했어요. 이제 서명 요청을 보낼 수 있어요.' : '계약을 반려했어요.'),
      })),
  ];
  // Every decision first checks the 전결 규정 against whoever is signed in.
  return raw.map(e => ({
    ...e,
    approver: approverFor(state, kindOf[e.kind], e.amount),
    decide: (d: F.ErpState, approved: boolean) => {
      assertApprover(d, kindOf[e.kind], e.amount);
      e.decide(d, approved);
    },
  }));
}

/** Applies one decision and reports the outcome as a toast. */
export function useDecide() {
  const { mutate, toast } = useErp();
  return (entry: ApprovalEntry, approved: boolean) => {
    try {
      mutate(d => entry.decide(d, approved), `결재 · ${entry.title} ${approved ? '승인' : '반려'}`);
      toast(entry.done(approved));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
}
