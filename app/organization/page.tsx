'use client';

import { useOpenDetail } from '@/components/details';
import { useErp } from '@/components/erp-provider';
import { Avatar, ButtonLink, Card, PageHead } from '@/components/ui';
import { date } from '@/lib/flow-core';
import { employed } from '@/lib/hr';
import { href } from '@/lib/nav';

export default function OrganizationPage() {
  const { state, companyInfo } = useErp();
  const openDetail = useOpenDetail();
  const active = state.employees.filter(e => employed(e, date()));
  const teams = [...new Set(active.map(e => e.dept))].map(d => [d, active.filter(e => e.dept === d)] as const);
  return (
    <>
      <PageHead title="조직도" sub="부서와 구성원을 확인하세요. 입사 · 발령 · 퇴사는 인사관리에서 바꾸면 바로 반영돼요." action={<ButtonLink href={href('people')}>인사관리 →</ButtonLink>} />
      <Card className="overflow-auto p-8.75">
        <div className="mx-auto w-57.5 rounded-card border border-accent-line bg-surface-2 p-5 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent-soft text-[23px] font-bold text-accent">{companyInfo.tile}</span>
          <h2 className="text-title font-semibold">{companyInfo.name}</h2>
          <small className="text-caption text-muted">본사 · {active.length}명</small>
        </div>
        <div className="mx-auto h-10 w-px border-l border-accent-line" />
        <div className="grid gap-4.5 border-t border-accent-line pt-6.25" style={{ gridTemplateColumns: `repeat(${Math.min(4, teams.length)}, minmax(160px, 1fr))` }}>
          {teams.map(([name, members]) => (
            <div key={name} className="rounded-card border border-accent-line p-4">
              <h3 className="mb-4.5 text-xs font-bold">{name} <span className="font-normal text-subtle">{members.length}명</span></h3>
              {members.map(e => (
                <button key={e.name} type="button" onClick={() => openDetail('employee', e.name)} className="flex w-full items-center gap-2.5 py-2.5 text-left hover:text-accent">
                  <Avatar name={e.name} />
                  <span>
                    <strong className="block text-caption">{e.name}</strong>
                    <small className="block text-micro text-subtle">{e.role} · {e.type}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
