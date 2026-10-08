'use client';

import { useState } from 'react';
import { ToolbarField } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, useAction } from '@/components/form-kit';
import { Button, Card, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { monthOf } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { insuranceMonth, markInsuranceReport, payInsurance, reportDue } from '@/lib/hr';

export default function InsurancePage() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const [tab, setTab] = useState<'월별 보험료' | '취득 · 상실 신고' | '설정'>('월별 보험료');
  const confirmed = state.payrolls.map(r => r.month).sort().reverse();
  const [month, setMonth] = useState(confirmed.find(m => !state.hr.insurancePaid[m]) ?? confirmed[0] ?? monthOf(today));
  const [settings, setSettings] = useState(false);
  const s = insuranceMonth(state, month);
  const pendingReports = state.hr.insuranceReports.filter(r => r.status === '신고 대기');
  const unpaid = confirmed.filter(m => !state.hr.insurancePaid[m]);

  return (
    <>
      <PageHead
        title="4대보험"
        sub="급여에서 뗀 근로자 몫과 회사가 내는 사업주 몫을 함께 계산하고, 다음 달 10일 납부를 장부에 기록해요. 입사 · 퇴사 때 생긴 취득 · 상실 신고도 여기서 챙겨요."
      />
      <Stats>
        <Stat label={`${month} 근로자 부담`} value={money(s.employee)} unit="" foot="급여에서 공제한 금액" tone="info" />
        <Stat label={`${month} 사업주 부담`} value={money(s.employer)} unit="" foot="회사 비용 (산재 포함)" />
        <Stat label="납부할 합계" value={money(s.employee + s.employer)} unit="" foot={s.paid ? `${s.paid.date} 납부` : `납부 기한 ${s.due}`} tone={s.paid ? 'ok' : 'warn'} />
        <Stat label="신고 대기" value={pendingReports.length} unit="건" foot={unpaid.length ? `미납 월 ${unpaid.join(', ')}` : '취득 · 상실 신고'} tone={pendingReports.length || unpaid.length ? 'warn' : 'ok'} />
      </Stats>
      <Card>
        <Toolbar>
          <Tabs options={['월별 보험료', '취득 · 상실 신고', '설정'] as const} value={tab} onChange={setTab} />
          {tab === '월별 보험료' && (
            <span className="flex items-center gap-2">
              <ToolbarField label="귀속 월">
                <select value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent outline-none">
                  {[...new Set([...confirmed, monthOf(today)])].map(m => <option key={m} value={m}>{m}{state.hr.insurancePaid[m] ? ' · 납부' : ''}</option>)}
                </select>
              </ToolbarField>
              <Button variant="primary" disabled={!!s.paid || !state.payrolls.some(r => r.month === month)} onClick={() => act(d => payInsurance(d, month), `${month} 4대보험 납부를 장부에 기록했어요.`)}>
                {s.paid ? '납부 완료' : '납부 처리'}
              </Button>
            </span>
          )}
          {tab === '설정' && <Button onClick={() => setSettings(true)}>요율 수정</Button>}
        </Toolbar>
        {tab === '월별 보험료' && (
          <DataTable
            headers={['구성원', '보수월액', '국민연금', '건강 · 장기요양', '고용 (근로자 / 사업주)', '산재 (사업주)', '근로자 합계', '사업주 합계']}
            rows={[
              ...s.rows.map(r => [
                <strong key="n" className="font-medium text-ink">{r.name}</strong>,
                money(r.taxable),
                <>{money(r.pension)}<CellSub>× 2 (노사 각각)</CellSub></>,
                <>{money(r.health)}<CellSub>× 2 (노사 각각)</CellSub></>,
                `${money(r.employment)} / ${money(r.employerEmployment)}`,
                money(r.accident),
                money(r.employee),
                <strong key="e" className="font-medium text-ink">{money(r.employer)}</strong>,
              ]),
              [<strong key="t">합계</strong>, '', '', '', '', '', <strong key="a">{money(s.employee)}</strong>, <strong key="b">{money(s.employer)}</strong>],
            ]}
          />
        )}
        {tab === '취득 · 상실 신고' && (
          <DataTable
            headers={['구성원', '신고 구분', '사유 발생일', '신고 기한', '상태', '']}
            rows={state.hr.insuranceReports.map(r => [
              <strong key="n" className="font-medium text-ink">{r.name}</strong>,
              <Pill key="k" tone={r.kind === '취득' ? 'info' : 'neutral'}>{r.kind}</Pill>,
              r.date,
              <span key="d" className={r.status === '신고 대기' && reportDue(r.date) < today ? 'text-danger' : ''}>{reportDue(r.date)}</span>,
              <Pill key="s">{r.status === '신고 완료' ? '신고 완료' : '미신고'}</Pill>,
              r.status === '신고 대기' ? <Button key="b" variant="primary" onClick={() => act(d => markInsuranceReport(d, r.id), `${r.name} ${r.kind} 신고를 완료로 표시했어요.`)}>신고 완료</Button> : '',
            ])}
          />
        )}
        {tab === '설정' && (
          <DataTable
            foot={false}
            headers={['보험', '근로자', '사업주', '비고']}
            rows={[
              ['국민연금', '4.75%', '4.75%', '2026년 9.5% (노사 반반)'],
              ['건강보험', '3.595%', '3.595%', '장기요양은 건강보험료의 13.14%'],
              ['고용보험', '0.9%', '1.15%', '사업주: 실업급여 0.9% + 고용안정 0.25% (150인 미만)'],
              ['산재보험', '—', `${(state.hr.settings.accidentRate * 100).toFixed(2)}%`, '업종별 요율 · 사업주 전액'],
              ['최저시급', '—', money(state.hr.settings.minWage), '근태관리에서 미달 여부를 확인해요'],
              ['5인 미만 사업장', '—', state.hr.settings.smallBusiness ? '예' : '아니요', '예면 연장 · 야간 · 휴일 가산수당을 계산하지 않아요'],
            ]}
          />
        )}
      </Card>
      <Hint className="mt-4">
        사업주 부담분은 납부할 때 국민연금은 세금과공과, 나머지는 복리후생비로 장부에 들어가요. 매년 3월 보수총액신고(건강 3/10, 고용 · 산재 3/15)를 잊지 마세요. 요율은 해마다 바뀌니 고시를 확인하세요.
      </Hint>

      <ModalForm
        open={settings}
        onClose={() => setSettings(false)}
        title="보험 · 노무 설정"
        submitLabel="저장"
        done="설정을 저장했어요."
        run={(d, f) => {
          const rate = Number(f.accident) / 100, wage = Number(f.minWage);
          if (!(rate >= 0 && rate < 0.2)) throw Error('산재보험료율을 확인해 주세요.');
          if (!(wage > 0)) throw Error('최저시급을 확인해 주세요.');
          d.hr.settings = { accidentRate: rate, minWage: wage, smallBusiness: f.small === 'on' };
        }}
      >
        <Field name="accident" label="산재보험료율 (%)" type="number" step="0.01" min={0} defaultValue={(state.hr.settings.accidentRate * 100).toFixed(2)} />
        <Field name="minWage" label="최저시급 (원)" type="number" defaultValue={state.hr.settings.minWage} />
        <label className="my-3 flex items-center gap-2 text-caption font-medium text-ink-2">
          <input type="checkbox" name="small" defaultChecked={state.hr.settings.smallBusiness} className="size-4 accent-accent" />
          상시 근로자 5인 미만 사업장
        </label>
      </ModalForm>
    </>
  );
}

