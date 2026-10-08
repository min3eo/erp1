'use client';

import { useState } from 'react';
import { approvalEntries, useDecide, type ApprovalEntry as Entry } from '@/components/approvals';
import { useErp } from '@/components/erp-provider';
import { currentUser } from '@/lib/admin';
import { href } from '@/lib/nav';
import { Button, ButtonLink, Card, CardHead, Checkbox, DataTable, Hint, PageHead, Pill } from '@/components/ui';

export default function ApprovalPage() {
  const { state, mutate, toast } = useErp();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const entries = approvalEntries(state);
  const decide = useDecide();
  const me = currentUser(state);
  const mine = (e: Entry) => me?.role === '관리자' || me?.role === e.approver;

  // Keep only selections that are still pending after a decision re-renders the list.
  const live = new Set(entries.map(e => e.key));
  const picked = entries.filter(e => selected.has(e.key));


  const decideAll = (approved: boolean) => {
    let ok = 0;
    const failed: string[] = [];
    for (const entry of picked) {
      try {
        mutate(d => entry.decide(d, approved));
        ok++;
      } catch (e) {
        failed.push(`${entry.title}: ${(e as Error).message}`);
      }
    }
    setSelected(new Set());
    toast(failed.length ? `${ok}건 ${approved ? '승인' : '반려'}, ${failed.length}건 실패 — ${failed[0]}` : `${ok}건을 ${approved ? '승인' : '반려'}했어요.`, failed.length ? 'error' : 'success');
  };

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set([...prev].filter(k => live.has(k)));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allPicked = entries.length > 0 && picked.length === entries.length;

  return (
    <>
      <PageHead title="결재함" sub="구매 · 휴가 · 재고 조정 · 경비 · 전표 · 계약 요청을 확인하고 승인하세요. 금액에 따라 승인권자가 정해져요 (전결 규정)." action={<ButtonLink href={href('approvalSettings')}>전결 규정 →</ButtonLink>} />
      <Hint>지금 {me?.name} ({me?.role})으로 로그인돼 있어요. 내가 승인할 수 없는 건은 버튼이 꺼져 있어요. 재고 조정은 승인하는 순간 수량이 반영됩니다. 요청 이후 재고가 바뀌었다면 반려하고 다시 실사해야 해요.</Hint>
      <Card>
        <CardHead title={<>승인 대기 <span className="ml-1 text-accent">{entries.length}</span></>} />
        {picked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-accent-line bg-accent-soft px-4 py-2 text-body">
            <strong className="text-accent">{picked.length}건 선택됨</strong>
            <span className="ml-auto flex gap-1.5">
              <Button onClick={() => decideAll(false)}>일괄 반려</Button>
              <Button variant="primary" onClick={() => decideAll(true)}>일괄 승인</Button>
            </span>
          </div>
        )}
        <DataTable
          headers={[
            <Checkbox key="all" aria-label="모두 선택" checked={allPicked} onChange={() => setSelected(allPicked ? new Set() : live)} />,
            '구분', '요청 내용', '요청자', '상세', '승인권자', '처리',
          ]}
          rows={entries.map(e => [
            <Checkbox key="c" aria-label={`${e.title} 선택`} checked={selected.has(e.key)} onChange={() => toggle(e.key)} />,
            <Pill key="k" tone="neutral">{e.kind}</Pill>,
            <strong key="t" className="font-semibold text-ink">{e.title}</strong>,
            e.person,
            e.detail,
            <Pill key="s" tone={mine(e) ? 'accent' : 'neutral'}>{e.approver}</Pill>,
            <span key="a" className="flex gap-1.5">
              <Button disabled={!mine(e)} onClick={() => decide(e, false)}>반려</Button>
              <Button variant="primary" disabled={!mine(e)} onClick={() => decide(e, true)}>승인</Button>
            </span>,
          ])}
        />
      </Card>
    </>
  );
}
