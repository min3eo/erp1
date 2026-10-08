'use client';

import { useState } from 'react';
import { Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select } from '@/components/form-kit';
import { Button, Card, CardHead, DataTable, Hint, PageHead, Pill } from '@/components/ui';
import { ROLES, currentUser, setRule } from '@/lib/admin';
import { money } from '@/lib/format';

export default function ApprovalSettingsPage() {
  const { state } = useErp();
  const [editing, setEditing] = useState<number | null>(null);
  const isAdmin = currentUser(state)?.role === '관리자';
  const rule = editing == null ? null : state.admin.rules[editing];
  const kinds = [...new Set(state.admin.rules.map(r => r.kind))];

  return (
    <>
      <PageHead title="승인 절차 설정" sub="문서 종류와 금액에 따라 누가 승인할지(전결 규정)를 정해요. 결재함은 이 규칙으로 승인권자를 정하고, 다른 사람은 승인 버튼을 누를 수 없어요." />
      {!isAdmin && <Hint>전결 규정은 관리자만 바꿀 수 있어요.</Hint>}
      <div className="flex flex-col gap-4">
        {kinds.map(kind => (
          <Card key={kind}>
            <CardHead title={kind} sub="위에서부터 금액 한도에 맞는 첫 규칙이 적용돼요." />
            <DataTable
              foot={false}
              headers={['조건', '승인권자', '']}
              rows={state.admin.rules
                .map((r, i) => ({ r, i }))
                .filter(x => x.r.kind === kind)
                .map(({ r, i }, n, list) => [
                  r.limit == null ? (n === 0 ? '모든 금액' : `${money(list[n - 1].r.limit ?? 0)} 초과`) : `${money(r.limit)} 이하`,
                  <Pill key="a" tone="accent">{r.approver}</Pill>,
                  <Button key="e" variant="text" disabled={!isAdmin} onClick={() => setEditing(i)}>수정</Button>,
                ])}
            />
          </Card>
        ))}
      </div>
      <Hint className="mt-4">관리자는 모든 요청을 승인할 수 있어요. 승인 역할은 권한 설정에서 사용자에게 붙여요.</Hint>

      {rule && (
        <ModalForm open onClose={() => setEditing(null)} title={`${rule.kind} 승인 규칙`} submitLabel="저장" done="전결 규정을 저장했어요." run={(d, f) => setRule(d, editing!, { limit: f.limit, approver: f.approver })}>
          <Field name="limit" label="금액 한도 (원, 비우면 한도 없음)" type="number" min={1} defaultValue={rule.limit ?? ''} optional />
          <Select name="approver" label="승인권자" defaultValue={rule.approver}><Options values={ROLES} /></Select>
        </ModalForm>
      )}
    </>
  );
}
