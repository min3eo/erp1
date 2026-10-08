'use client';

import { useErp } from '@/components/erp-provider';
import { Card, DataTable, FilterToolbar, Hint, PageHead, Pill, useListFilter } from '@/components/ui';
import { pageFromPath, pageNames } from '@/lib/nav';

export default function AuditLogPage() {
  const { state } = useErp();
  const list = useListFilter();
  const users = [...new Set(state.admin.audit.map(a => a.user.split(' ')[0]))];
  const rows = state.admin.audit.filter(a => (list.filter === '전체' || a.user.startsWith(list.filter)) && list.matches(a.text, a.user, a.page));

  return (
    <>
      <PageHead title="변경 이력" sub="누가 언제 어떤 화면에서 무엇을 바꿨는지 자동으로 남아요. 지울 수 없고, 최근 500건까지 보관해요." />
      <Card>
        <FilterToolbar tabs={['전체', ...users]} list={list} placeholder="내용, 화면 검색" />
        <DataTable
          headers={['일시', '사용자', '화면', '내용']}
          rows={rows.map(a => [
            new Date(a.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'medium' }),
            a.user,
            <Pill key="p" tone="neutral">{pageNames[pageFromPath(a.page)] ?? a.page}</Pill>,
            a.text,
          ])}
        />
      </Card>
      <Hint className="mt-4">국세 관련 장부와 증빙은 법정 신고기한부터 5년간 보관해야 해요. 실제 서비스에서는 이력을 서버에 따로 보관해야 해요.</Hint>
    </>
  );
}
