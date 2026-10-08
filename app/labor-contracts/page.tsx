'use client';

import { useState } from 'react';
import { Options, SignCell } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select } from '@/components/form-kit';
import { Avatar, Button, ButtonLink, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { addContract, contractPhase } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { staff } from '@/lib/hr';

export default function LaborContractsPage() {
  const { state } = useErp();
  const list = useListFilter();
  const [writing, setWriting] = useState<string | null>(null);
  const today = date();
  const people = staff(state, today);
  const labor = state.books.contracts.filter(c => c.side === '근로');
  const current = (name: string) => labor.find(c => c.partner === name && contractPhase(c, today) !== '만료');
  const signed = people.filter(p => current(p[0])?.sign === '서명 완료');
  const waiting = labor.filter(c => c.sign === '서명 요청');
  const missing = people.filter(p => !current(p[0]));
  const expiring = labor.filter(c => contractPhase(c, today) === '만료 예정');
  const status = (sign: string) => (sign === '서명 완료' ? '서명 완료' : '서명 대기');

  return (
    <>
      <PageHead
        title="전자근로계약"
        sub="근로계약서를 작성해 전자서명으로 보내고, 서명이 끝난 계약서를 보관해요. 직원별 계약 상태와 만료일을 한눈에 확인할 수 있어요."
        action={<Button variant="primary" onClick={() => setWriting(missing[0]?.[0] ?? people[0][0])}>근로계약서 작성</Button>}
      />
      <Stats>
        <Stat label="체결 완료" value={signed.length} unit={`/ ${people.length}명`} foot="서명이 끝난 직원" tone="ok" />
        <Stat label="서명 대기" value={waiting.length} unit="건" foot={waiting.map(c => c.partner).join(', ') || '없음'} tone={waiting.length ? 'warn' : undefined} />
        <Stat label="미작성" value={missing.length} unit="명" foot={missing.map(p => p[0]).join(', ') || '모두 작성됨'} tone={missing.length ? 'danger' : undefined} />
        <Stat label="30일 안에 만료" value={expiring.length} unit="건" foot="계약직 재계약 확인" tone={expiring.length ? 'warn' : undefined} />
      </Stats>
      {missing.length > 0 && <Hint>근로계약서 작성 · 교부는 법적 의무예요. 근로계약서가 없는 직원: {missing.map(p => p[0]).join(', ')}</Hint>}
      <Card>
        <FilterToolbar tabs={['전체', '서명 완료', '서명 대기', '미작성']} list={list} placeholder="이름 검색" />
        <DataTable
          headers={['근로자', '고용 형태', '계약 기간', '월 기본급', '전자서명', '']}
          rows={[
            ...labor
              .filter(c => (list.filter === '전체' || status(c.sign) === list.filter) && list.matches(c.partner, c.category))
              .map(c => [
                <div key="n" className="flex items-center gap-2.5"><Avatar name={c.partner} className="size-7.5" /><strong>{c.partner}</strong></div>,
                c.category,
                <>{c.start} ~ {c.end || '기간 없음'}<CellSub><Pill>{contractPhase(c, today)}</Pill></CellSub></>,
                money(c.amount),
                <SignCell key="s" c={c} />,
                c.sign === '서명 완료' ? <ButtonLink key="p" href={`/print/labor/${c.id}`}>계약서</ButtonLink> : '',
              ]),
            ...missing
              .filter(p => (list.filter === '전체' || list.filter === '미작성') && list.matches(p[0]))
              .map(p => [
                <div key="n" className="flex items-center gap-2.5"><Avatar name={p[0]} className="size-7.5" /><strong>{p[0]}</strong></div>,
                '—', '—', '—',
                <Pill key="s">미작성</Pill>,
                <Button key="w" variant="text" onClick={() => setWriting(p[0])}>작성</Button>,
              ]),
          ]}
        />
      </Card>
      <Hint className="mt-4">시안에서는 서명 링크를 실제로 보내지 않고 상태만 바꿔요. 서명이 끝난 계약서는 인쇄하거나 PDF로 저장해 직원에게 교부하세요.</Hint>

      <LaborForm key={writing ?? ''} name={writing} onClose={() => setWriting(null)} />
    </>
  );
}

function LaborForm({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { state } = useErp();
  const people = staff(state);
  const [person, setPerson] = useState(name ?? people[0][0]);
  const [kind, setKind] = useState('정규직');
  const base = state.salaries.find(s => s.name === person)?.base ?? 3000000;
  const joined = state.employees.find(e => e.name === person)?.joined ?? date();
  return (
    <ModalForm
      open={!!name}
      onClose={onClose}
      title="근로계약서 작성"
      submitLabel="작성"
      done="근로계약서를 작성했어요. 전자서명을 요청하세요."
      run={(d, f) => addContract(d, { title: `${f.partner} 근로계약`, partner: f.partner, side: '근로', category: f.category, start: f.start, end: f.end, amount: f.amount, cycle: '월 정기' })}
    >
      <Select name="partner" label="근로자" value={person} onChange={setPerson}><Options values={people.map(p => p[0])} /></Select>
      <Select name="category" label="고용 형태" value={kind} onChange={setKind}><Options values={['정규직', '계약직', '단시간']} /></Select>
      <div className="grid grid-cols-2 gap-3">
        <Field key={'s' + person} name="start" label="근로 시작일" type="date" defaultValue={joined} />
        <Field name="end" label="종료일" type="date" optional={kind === '정규직'} />
      </div>
      <Field key={person} name="amount" label="월 기본급 (원)" type="number" defaultValue={base} />
      <p className="text-tiny text-subtle">근무 장소 · 업무 · 근로시간 · 휴일 · 연차는 회사 표준 조항으로 들어가요.</p>
    </ModalForm>
  );
}
