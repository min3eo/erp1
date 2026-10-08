'use client';

import { useState } from 'react';
import { Options } from '@/components/books-ui';
import { useOpenDetail } from '@/components/details';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, Suggestions } from '@/components/form-kit';
import { Avatar, Button, ButtonLink, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { contractPhase, monthOf } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { depts, employed, hire, retire, severanceFor, updateEmployee, type Employee } from '@/lib/hr';
import { money } from '@/lib/format';
import { href } from '@/lib/nav';

type Dialog = null | { kind: 'hire' } | { kind: 'edit' | 'retire'; e: Employee };
const ROLES = ['사원', '매니저', '팀장', '관리자', '이사'];

export default function PeoplePage() {
  const { state } = useErp();
  const openDetail = useOpenDetail();
  const list = useListFilter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const today = date();
  const month = monthOf(today);
  const contractOf = (name: string) => state.books.contracts.find(c => c.side === '근로' && c.partner === name && contractPhase(c, today) !== '만료');
  const active = state.employees.filter(e => employed(e, today));
  const missing = active.filter(e => contractOf(e.name)?.sign !== '서명 완료');
  const status = (e: Employee) => (e.left && e.left < today ? '퇴사' : '재직');

  const rows = state.employees
    .filter(e => (list.filter === '전체' || status(e) === list.filter) && list.matches(e.name, e.dept, e.role, e.type))
    .sort((a, b) => Number(!!a.left) - Number(!!b.left) || a.joined.localeCompare(b.joined))
    .map(e => {
      const c = contractOf(e.name);
      return [
        <button key="n" type="button" onClick={() => openDetail('employee', e.name)} className="flex items-center gap-2.5 text-left hover:text-accent">
          <Avatar name={e.name} className="size-7.5" /><span><strong>{e.name}</strong><CellSub>{e.email || '—'}</CellSub></span>
        </button>,
        e.dept, e.role, e.type,
        <>{e.joined}{e.left && <CellSub className="text-danger">퇴사 {e.left}</CellSub>}</>,
        e.left ? <Pill key="c" tone="neutral">퇴사</Pill> : c ? <Pill key="c">{c.sign}</Pill> : <Pill key="c">미작성</Pill>,
        e.left ? '—' : <Pill key="s">{e.today}</Pill>,
        <span key="a" className="flex gap-1.5">
          <Button onClick={() => openDetail('employee', e.name)}>인사카드</Button>
          {!e.left && <Button variant="text" onClick={() => setDialog({ kind: 'edit', e })}>수정 · 발령</Button>}
          {!e.left && <Button variant="text" onClick={() => setDialog({ kind: 'retire', e })}>퇴사</Button>}
        </span>,
      ];
    });

  return (
    <>
      <PageHead
        title="인사관리"
        sub="입사 · 발령 · 퇴사를 등록하면 급여, 4대보험 취득 · 상실, 연차, 근로계약, 조직도에 바로 이어져요."
        action={
          <>
            <ButtonLink href={href('laborContracts')}>전자근로계약 →</ButtonLink>
            <Button variant="primary" onClick={() => setDialog({ kind: 'hire' })}>입사 등록</Button>
          </>
        }
      />
      <Stats>
        <Stat label="재직 인원" value={active.length} unit="명" foot={`정규 ${active.filter(e => e.type === '정규직').length} · 계약 ${active.filter(e => e.type === '계약직').length} · 단시간 ${active.filter(e => e.type === '단시간').length}`} tone="info" />
        <Stat label="이번 달 입사" value={state.employees.filter(e => monthOf(e.joined) === month).length} unit="명" foot="4대보험 취득 신고 대상" />
        <Stat label="이번 달 퇴사" value={state.employees.filter(e => e.left && monthOf(e.left) === month).length} unit="명" foot="4대보험 상실 · 퇴직금 정산" />
        <Stat label="근로계약 미체결" value={missing.length} unit="명" foot={missing.map(e => e.name).join(', ') || '모두 체결'} tone={missing.length ? 'warn' : 'ok'} />
      </Stats>
      {missing.length > 0 && <Hint>근로계약서가 체결되지 않은 직원: {missing.map(e => e.name).join(', ')}. 전자근로계약에서 작성 · 서명 요청을 할 수 있어요.</Hint>}
      <Card>
        <FilterToolbar tabs={['재직', '퇴사', '전체']} list={list} placeholder="이름, 부서, 직책 검색" />
        <DataTable headers={['구성원', '부서', '직책', '고용 형태', '입사일', '근로계약', '오늘 근무', '처리']} rows={rows} />
      </Card>

      <ModalForm
        open={dialog?.kind === 'hire'}
        onClose={close}
        title="입사 등록"
        submitLabel="등록"
        done="입사를 등록했어요. 4대보험 취득 신고와 근로계약서 작성을 잊지 마세요."
        run={(d, f) => hire(d, f)}
      >
        <EmployeeFields />
        <div className="grid grid-cols-3 gap-3">
          <Field name="base" label="기본급 (월)" type="number" defaultValue={3000000} />
          <Field name="allowance" label="고정 수당" type="number" min={0} defaultValue={0} />
          <Field name="dependents" label="부양가족 (본인 포함)" type="number" defaultValue={1} />
        </div>
        <Field name="joined" label="입사일" type="date" defaultValue={today} />
      </ModalForm>

      {dialog?.kind === 'edit' && (
        <ModalForm open onClose={close} title={`${dialog.e.name} 수정 · 발령`} submitLabel="저장" done="저장했어요. 부서 · 직책이 바뀌면 인사 이력에 발령으로 남아요." run={(d, f) => updateEmployee(d, dialog.e.name, f)}>
          <EmployeeFields e={dialog.e} />
        </ModalForm>
      )}

      {dialog?.kind === 'retire' && <RetireForm e={dialog.e} onClose={close} />}
    </>
  );
}

function EmployeeFields({ e }: { e?: Employee }) {
  const { state } = useErp();
  return (
    <>
      {!e && <Field name="name" label="이름" />}
      <div className="grid grid-cols-2 gap-3">
        <Field name="dept" label="부서" list="dept-list" defaultValue={e?.dept} />
        <Select name="role" label="직책" defaultValue={e?.role ?? '사원'}><Options values={[...new Set([...ROLES, ...(e ? [e.role] : [])])]} /></Select>
      </div>
      <Suggestions id="dept-list" values={depts(state)} />
      <div className="grid grid-cols-2 gap-3">
        <Select name="type" label="고용 형태" defaultValue={e?.type ?? '정규직'}><Options values={['정규직', '계약직', '단시간']} /></Select>
        <Select name="pension" label="퇴직연금" defaultValue={e?.pension ?? 'DB'}><Options values={['DB', 'DC', '없음']} /></Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="email" label="이메일" type="email" defaultValue={e?.email} optional />
        <Field name="phone" label="연락처" defaultValue={e?.phone} optional />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="bank" label="급여 은행" defaultValue={e?.bank} optional />
        <Field name="account" label="계좌번호" defaultValue={e?.account} optional />
      </div>
    </>
  );
}

function RetireForm({ e, onClose }: { e: Employee; onClose: () => void }) {
  const { state } = useErp();
  const [when, setWhen] = useState(date());
  const s = severanceFor(state, e.name, when);
  return (
    <ModalForm open onClose={onClose} title={`${e.name} 퇴사 처리`} submitLabel="퇴사 확정" done="퇴사 처리했어요. 4대보험 상실 신고와 퇴직금 지급을 확인하세요." run={(d, f) => retire(d, e.name, { date: f.date, reason: f.reason })}>
      <label className="my-3 block text-caption font-medium text-ink-2">
        퇴사일
        <input name="date" type="date" required value={when} onChange={x => setWhen(x.target.value)} className="mt-1.5 block h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-body" />
      </label>
      <Select name="reason" label="퇴사 사유" defaultValue="개인 사정 (자발적)"><Options values={['개인 사정 (자발적)', '계약 기간 만료', '권고사직', '정년', '기타']} /></Select>
      <div className="rounded-lg border border-line bg-surface-2 p-3 text-caption text-muted">
        재직 {s.days.toLocaleString()}일 · {s.eligible ? <>퇴직금 <strong className="text-ink">{money(s.amount)}</strong> (퇴직소득세 {money(s.tax + s.local)})</> : '1년 미만이라 퇴직금 대상이 아니에요.'}
        {e.pension === 'DC' && ' · DC형은 퇴직연금 계좌에서 지급돼 회사 지급액이 없어요.'}
      </div>
    </ModalForm>
  );
}
