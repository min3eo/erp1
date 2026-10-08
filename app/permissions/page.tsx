'use client';

import { useState } from 'react';
import { Options } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, Card, CardHead, DataTable, Hint, PageHead, Pill, Switch, cx } from '@/components/ui';
import { ALL_GROUPS, ROLES, addUser, currentUser, setUserRole, toggleAccess, type Role } from '@/lib/admin';
import { groupTabLabel } from '@/lib/nav';

export default function PermissionsPage() {
  const { state } = useErp();
  const act = useAction();
  const [role, setRole] = useState<Role>('경리');
  const [adding, setAdding] = useState(false);
  const me = currentUser(state);
  const isAdmin = me?.role === '관리자';
  const allowed = role === '관리자' ? ALL_GROUPS : state.admin.access[role] ?? [];

  return (
    <>
      <PageHead
        title="권한 설정"
        sub="사용자마다 역할을 정하고, 역할마다 열 수 있는 메뉴를 정해요. 바꾸면 위쪽 메뉴와 화면 접근에 바로 반영돼요. 시안에서는 오른쪽 위 이름을 눌러 사용자를 바꿔 볼 수 있어요."
        action={<Button variant="primary" disabled={!isAdmin} onClick={() => setAdding(true)}>사용자 추가</Button>}
      />
      {!isAdmin && <Hint>권한은 관리자만 바꿀 수 있어요. 지금은 {me?.name} ({me?.role})으로 보고 있어요.</Hint>}
      <div className="grid gap-5 md:grid-cols-[230px_minmax(0,1fr)]">
        <Card className="flex h-fit flex-wrap items-center gap-1.25 p-3 md:block md:p-5.5">
          <h2 className="mb-4.25 hidden text-title font-semibold md:block">역할</h2>
          {ROLES.map(r => (
            <button key={r} type="button" onClick={() => setRole(r)} className={cx('mb-1.5 block rounded-lg p-3.5 text-left md:w-full', role === r && 'bg-accent-soft text-accent')}>
              <span>{r}</span>
              <small className="mt-0.75 block text-tiny text-muted">{state.admin.users.filter(u => u.role === r).map(u => u.name).join(', ') || '사용자 없음'}</small>
            </button>
          ))}
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHead title={`${role} · 메뉴 권한`} sub={role === '관리자' ? '관리자는 모든 메뉴를 열고 권한 · 마감을 바꿀 수 있어요.' : '켜진 메뉴만 위쪽 탭에 보이고 열 수 있어요.'} />
            <DataTable
              foot={false}
              headers={['메뉴', '접근']}
              rows={ALL_GROUPS.map(g => [
                groupTabLabel[g] ?? g,
                <Switch
                  key="s"
                  checked={allowed.includes(g) || g === '워크스페이스'}
                  disabled={!isAdmin || role === '관리자' || g === '워크스페이스'}
                  onChange={() => act(d => toggleAccess(d, role, g), `${role} · ${groupTabLabel[g] ?? g} 권한을 바꿨어요.`)}
                  aria-label={`${g} 접근`}
                />,
              ])}
            />
          </Card>
          <Card>
            <CardHead title="사용자" sub="각 사용자의 역할을 바꿀 수 있어요." />
            <DataTable
              foot={false}
              headers={['이름', '역할', '상태']}
              rows={state.admin.users.map(u => [
                <strong key="n" className="font-medium text-ink">{u.name}</strong>,
                <select key="r" value={u.role} disabled={!isAdmin} onChange={e => act(d => setUserRole(d, u.id, e.target.value as Role), `${u.name}님 역할을 ${e.target.value}(으)로 바꿨어요.`)} className="h-8 rounded-md border border-line bg-surface px-2 text-caption">
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>,
                u.id === me?.id ? <Pill key="s" tone="accent">지금 로그인</Pill> : <Pill key="s" tone="neutral">사용 중</Pill>,
              ])}
            />
          </Card>
        </div>
      </div>
      <ModalForm open={adding} onClose={() => setAdding(false)} title="사용자 추가" submitLabel="추가" done="사용자를 추가했어요." run={(d, f) => addUser(d, { name: f.name, role: f.role })}>
        <Field name="name" label="이름" />
        <Select name="role" label="역할" defaultValue="영업"><Options values={ROLES} /></Select>
      </ModalForm>
    </>
  );
}
