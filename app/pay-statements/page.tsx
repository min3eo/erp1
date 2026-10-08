'use client';

import { useState } from 'react';
import { ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { useAction } from '@/components/form-kit';
import { Button, Card, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { markStatement, statementSchedule } from '@/lib/hr';

export default function PayStatementsPage() {
  const { state } = useErp();
  const act = useAction();
  const list = useListFilter();
  const today = date();
  const [year, setYear] = useState(today.slice(0, 4));
  const rows = statementSchedule(state, year);
  const open = rows.filter(r => !r.submitted);
  const overdue = open.filter(r => r.due < today);
  const soon = open.filter(r => r.due >= today && Date.parse(r.due) - Date.parse(today) <= 30 * 86400000);

  return (
    <>
      <PageHead
        title="지급명세서"
        sub="누구에게 얼마를 지급했는지 국세청에 내는 자료예요. 급여 · 일용 노임 · 프리랜서 · 강사료 · 이자 · 배당 · 퇴직금 지급 기록에서 제출 대상과 기한을 자동으로 정리해요."
        action={
          <ToolbarField label="지급 연도">
            <select value={year} onChange={e => setYear(e.target.value)} className={bareSelect}>
              {[today.slice(0, 4), String(Number(today.slice(0, 4)) - 1)].map(y => <option key={y}>{y}</option>)}
            </select>
          </ToolbarField>
        }
      />
      <Stats>
        <Stat label="제출 대상" value={rows.length} unit="건" foot={`제출 완료 ${rows.length - open.length}건`} tone="info" />
        <Stat label="기한 지남" value={overdue.length} unit="건" foot="미제출 가산세 대상" tone={overdue.length ? 'danger' : 'ok'} />
        <Stat label="30일 안에 기한" value={soon.length} unit="건" foot={soon.map(r => r.kind).join(', ') || '없음'} tone={soon.length ? 'warn' : undefined} />
        <Stat label="총 지급액" value={money(rows.filter(r => r.kind === '근로소득' || r.kind === '일용근로' || r.kind.startsWith('사업소득 간이') || r.kind === '기타소득').reduce((t, r) => t + r.amount, 0))} unit="" foot="근로 · 일용 · 사업 · 기타" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '미제출', '제출 완료']} list={list} placeholder="소득 구분 검색" />
        <DataTable
          headers={['소득 구분', '지급 기간', '인원', '지급액', '제출 기한', '상태', '']}
          rows={rows
            .filter(r => (list.filter === '전체' || (list.filter === '미제출') === !r.submitted) && list.matches(r.kind, r.period))
            .map(r => [
              <strong key="k" className="font-medium text-ink">{r.kind}</strong>,
              r.period,
              `${r.people}명`,
              money(r.amount),
              <span key="d" className={!r.submitted && r.due < today ? 'text-danger' : ''}>{r.due}</span>,
              <Pill key="s">{r.submitted ? '제출 완료' : r.due < today ? '기한 지남' : '미제출'}</Pill>,
              r.submitted ? <span key="b" className="text-tiny text-subtle">{r.submitted}</span> : <Button key="b" variant="primary" onClick={() => act(d => markStatement(d, r.key), `${r.kind} ${r.period} 제출을 표시했어요.`)}>제출 완료</Button>,
            ])}
        />
      </Card>
      <Hint className="mt-4">
        일용근로 · 사업소득 간이지급명세서는 지급한 달의 다음 달 말일까지, 근로 · 퇴직 · 사업소득 지급명세서는 다음 해 3월 10일, 기타 · 이자 · 배당은 2월 말일까지예요. 제출 주기는 법 개정으로 바뀔 수 있으니 세무 대리인과 확인하세요.
      </Hint>
    </>
  );
}
