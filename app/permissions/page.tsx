'use client';

import { useState } from 'react';
import { Card, CardHead, DataTable, PageHead, Pill, PreviewNotice, SectionTitle, Subtitle, Switch, cx } from '@/components/ui';

const roles = ['관리자', '구매 담당자', '물류 담당자', '인사 담당자'] as const;
type Role = (typeof roles)[number];
const actions = ['조회', '등록', '수정', '승인', '내보내기'];
/** [업무 영역, 담당 영역] — a role owns the rows whose area its name starts with. */
const rules: [string, string][] = [
  ['품목 · 거래처', '공통'], ['구매 · 발주', '구매'], ['입고 · 출고', '물류'], ['재고 조정', '물류'],
  ['구성원 정보', '인사'], ['근태 · 휴가', '인사'], ['회사 · 권한 설정', '관리자'],
];

export default function PermissionsPage() {
  const [role, setRole] = useState<Role>('구매 담당자');
  const admin = role === '관리자';

  return (
    <>
      <PageHead title="권한 설정" sub="직무별로 접근 범위와 처리 권한을 구분하세요." />
      <PreviewNotice />
      <div className="grid gap-5 md:grid-cols-[230px_minmax(0,1fr)]">
        <Card className="flex h-fit flex-wrap items-center gap-1.25 p-3 md:block md:p-5.5">
          <h2 className="mb-4.25 hidden text-title font-semibold md:block">역할</h2>
          {roles.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cx('mb-1.5 block rounded-lg p-3.5 text-left md:w-full', role === r && 'bg-accent-soft text-accent')}
            >
              <span>{r}</span>
              <small className="mt-0.75 block text-tiny text-muted">{r === '관리자' ? '전체 업무 관리' : r.replace(' 담당자', '') + ' 업무 중심'}</small>
            </button>
          ))}
        </Card>
        <Card className="min-w-0">
          <CardHead title={role}>
            <Pill>역할 미리보기</Pill>
          </CardHead>
          <DataTable
            headers={['업무 영역', ...actions]}
            rows={rules.map(([title, area]) => {
              const own = admin || role.startsWith(area);
              return [title, ...[own || area === '공통', own, own, admin, own].map((v, n) => <Switch key={n} checked={v} disabled readOnly aria-label={`${title} ${actions[n]}`} />)];
            })}
          />
          <div className="p-4 sm:p-6">
            <SectionTitle>데이터 접근 범위</SectionTitle>
            <div className="flex flex-wrap gap-2.25">
              {['회사 전체', '소속 부서', '본인 담당 건'].map(s => (
                <span key={s} className={cx('rounded-md border px-3.75 py-1.75 text-caption', s === '소속 부서' ? 'border-accent-line bg-accent-soft text-accent' : 'border-accent-line text-muted')}>{s}</span>
              ))}
            </div>
            <Subtitle>민감한 직원 정보와 원가 정보는 별도 권한으로 분리하는 예시입니다.</Subtitle>
          </div>
        </Card>
      </div>
    </>
  );
}
