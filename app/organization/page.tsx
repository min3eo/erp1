'use client';

import { useOpenDetail } from '@/components/details';
import { useErp } from '@/components/erp-provider';
import { Avatar, Card, PageHead, PreviewNotice } from '@/components/ui';
import { people } from '@/lib/seed';

/** Team name and the indexes of `people` that belong to it. */
const teams: [string, number[]][] = [
  ['경영지원팀', [0]],
  ['구매 · 물류', [2, 3]],
  ['운영 · 상품', [1, 4]],
  ['개발팀', [5]],
];

export default function OrganizationPage() {
  const { companyInfo } = useErp();
  const openDetail = useOpenDetail();
  return (
    <>
      <PageHead title="조직도" sub="부서와 구성원, 승인 관계를 확인하세요." />
      <PreviewNotice />
      <Card className="overflow-auto p-8.75">
        <div className="mx-auto w-57.5 rounded-card border border-accent-line bg-surface-2 p-5 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent-soft text-[23px] font-bold text-accent">{companyInfo.tile}</span>
          <h2 className="text-title font-semibold">{companyInfo.name}</h2>
          <small className="text-caption text-muted">본사 · {people.length}명</small>
        </div>
        <div className="mx-auto h-10 w-px border-l border-accent-line" />
        <div className="grid min-w-170 grid-cols-4 gap-4.5 border-t border-accent-line pt-6.25">
          {teams.map(([name, members]) => (
            <div key={name} className="rounded-card border border-accent-line p-4">
              <h3 className="mb-4.5 text-xs font-bold">{name}</h3>
              {members.map(i => (
                <button key={i} type="button" onClick={() => openDetail('employee', i)} className="flex w-full items-center gap-2.5 py-2.5 text-left hover:text-accent">
                  <Avatar name={people[i][0]} />
                  <span>
                    <strong className="block text-caption">{people[i][0]}</strong>
                    <small className="block text-micro text-subtle">{people[i][2]} · {people[i][1]}</small>
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
