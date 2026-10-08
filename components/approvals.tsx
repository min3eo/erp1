'use client';

import type { ReactNode } from 'react';
import * as F from '@/lib/flow-core';
import { money } from '@/lib/format';
import { useErp } from './erp-provider';
import { CellSub } from './ui';

export interface ApprovalEntry {
  key: string;
  kind: '구매' | '휴가' | '재고 조정';
  title: string;
  person: string;
  /** One-line summary for compact lists. */
  summary: string;
  detail: ReactNode;
  decide: (draft: F.ErpState, approved: boolean) => void;
  done: (approved: boolean) => string;
}

const pendingOnly = (status: string) => {
  if (status !== '승인 대기') throw Error('이미 처리한 요청입니다.');
};
const decided = (approved: boolean) => (approved ? '승인' : '반려') + ' 처리했어요.';

/** Every pending purchase, leave and stock-adjustment request, in one list. */
export function approvalEntries(state: F.ErpState): ApprovalEntry[] {
  return [
    ...state.orders
      .filter(o => o.status === '승인 대기')
      .map((o): ApprovalEntry => ({
        key: 'order:' + o.id,
        kind: '구매',
        title: o.name + ' 구매 요청',
        person: '구매팀',
        summary: `${o.vendor} · ${money(o.qty * o.price)}`,
        detail: money(o.qty * o.price),
        decide: (d, approved) => {
          if (approved) return void F.approve(d, o.id);
          const order = d.orders.find(x => x.id === o.id)!;
          pendingOnly(order.status);
          order.status = '반려';
        },
        done: decided,
      })),
    ...state.leaves.flatMap((l, index): ApprovalEntry[] =>
      l.status !== '승인 대기'
        ? []
        : [{
            key: 'leave:' + index,
            kind: '휴가',
            title: l.type + ' 신청',
            person: l.name,
            summary: `${l.name} · ${l.date} · ${l.days}일`,
            detail: `${l.date} · ${l.days}일`,
            decide: (d, approved) => {
              pendingOnly(d.leaves[index].status);
              d.leaves[index].status = approved ? '승인 완료' : '반려';
            },
            done: decided,
          }],
    ),
    ...state.adjustments
      .filter(a => a.status === '승인 대기')
      .map((a): ApprovalEntry => ({
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
        decide: (d, approved) => void F.decideAdjustment(d, a.id, approved),
        done: approved => (approved ? '조정을 승인하고 재고에 반영했어요.' : '조정 요청을 반려했어요.'),
      })),
  ];
}

/** Applies one decision and reports the outcome as a toast. */
export function useDecide() {
  const { mutate, toast } = useErp();
  return (entry: ApprovalEntry, approved: boolean) => {
    try {
      mutate(d => entry.decide(d, approved));
      toast(entry.done(approved));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
}
