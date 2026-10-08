'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, ButtonLink, Card, CellSub, DataTable, FilterToolbar, Hint, PageHead, Pill, Stat, Stats, useListFilter } from '@/components/ui';
import { advanceSign, cancelSign, monthOf, remindSign, requestSign, type Contract } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { href } from '@/lib/nav';

const days = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000));
const requestedAt = (c: Contract) => [...(c.signLog ?? [])].reverse().find(l => l.text.includes('서명 요청'))?.date;
const tab = (c: Contract) => (c.sign === '서명 요청' ? '서명 대기' : c.sign === '서명 완료' ? '체결 완료' : '작성 중');

export default function EsignPage() {
  const { state, openDrawer } = useErp();
  const act = useAction();
  const list = useListFilter();
  const [sending, setSending] = useState<string | null>(null);
  const today = date();
  const contracts = state.books.contracts.filter(c => c.side !== '근로');
  const pending = contracts.filter(c => c.sign === '서명 요청');
  const drafts = contracts.filter(c => c.sign === '작성' && (c.side === '근로' || c.approvedBy));
  const signedThisMonth = contracts.filter(c => c.signedAt && monthOf(c.signedAt) === monthOf(today));
  const leadTimes = contracts.filter(c => c.signedAt && requestedAt(c)).map(c => days(requestedAt(c)!, c.signedAt!));
  const avg = leadTimes.length ? Math.round(leadTimes.reduce((t, d) => t + d, 0) / leadTimes.length) : 0;

  const history = (c: Contract) => openDrawer(`${c.title} · 서명 이력`, (
    <ol className="relative ml-2 border-l border-line">
      {(c.signLog ?? []).map((l, i) => (
        <li key={i} className="mb-4 ml-4">
          <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-surface bg-accent" />
          <p className="text-body text-ink">{l.text}</p>
          <p className="text-tiny text-subtle">{l.date}</p>
        </li>
      ))}
      {!c.signLog?.length && <li className="ml-4 text-body text-subtle">아직 서명 요청을 보내지 않았어요.</li>}
    </ol>
  ));

  return (
    <>
      <PageHead
        title="전자계약"
        sub="계약관리에서 작성한 매출 · 매입 계약서를 거래처 담당자에게 전자서명으로 보내고, 서명 진행 상황과 이력을 관리해요. 서명이 끝나면 계약이 체결되고 청구 · 정산이 열려요."
        action={
          <>
            <ButtonLink href={href('contracts')}>계약 작성 →</ButtonLink>
            <Button variant="primary" disabled={!drafts.length} onClick={() => setSending(drafts[0].id)}>서명 요청 보내기</Button>
          </>
        }
      />
      <Stats>
        <Stat label="서명 대기" value={pending.length} unit="건" foot={pending.length ? `가장 오래된 요청 ${Math.max(...pending.map(c => days(requestedAt(c) ?? today, today)))}일 경과` : '없음'} tone={pending.length ? 'warn' : undefined} />
        <Stat label="보내기 전" value={drafts.length} unit="건" foot="작성만 된 계약" />
        <Stat label="이번 달 체결" value={signedThisMonth.length} unit="건" foot={money(signedThisMonth.reduce((t, c) => t + c.amount, 0)) + ' · 공급가'} tone="ok" />
        <Stat label="평균 서명 소요" value={avg} unit="일" foot={`체결 ${leadTimes.length}건 기준`} tone="info" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', '서명 대기', '작성 중', '체결 완료']} list={list} placeholder="계약명, 거래처, 서명자 검색" />
        <DataTable
          headers={['계약', '서명자', '요청일', '경과', '상태', '처리']}
          rows={contracts
            .filter(c => (list.filter === '전체' || tab(c) === list.filter) && list.matches(c.title, c.partner, c.signer))
            .map(c => {
              const req = requestedAt(c);
              return [
                <><strong className="font-medium text-ink">{c.title}</strong><CellSub>{c.partner} · {c.side} · {money(c.amount)}{c.cycle === '월 정기' ? '/월' : ''}</CellSub></>,
                c.signer ?? '—',
                c.sign === '작성' ? '—' : req ?? '—',
                c.sign === '서명 요청' && req ? <span key="d" className={days(req, today) >= 7 ? 'text-warn' : ''}>{days(req, today)}일</span> : c.signedAt && req ? <span key="d" className="text-subtle">{days(req, c.signedAt)}일 만에 체결</span> : '—',
                <span key="s" className="flex items-center gap-1.5"><Pill>{c.sign === '서명 요청' ? '서명 대기' : c.sign}</Pill>{c.signedAt && <span className="text-tiny text-subtle">{c.signedAt}</span>}</span>,
                <span key="a" className="flex flex-wrap gap-1.5">
                  {c.sign === '작성' && (c.side === '근로' || c.approvedBy ? <Button variant="primary" onClick={() => setSending(c.id)}>서명 요청</Button> : <span className="text-caption text-warn">{c.rejectedAt ? '결재 반려' : '결재 대기'}</span>)}
                  {c.sign === '서명 요청' && (
                    <>
                      <Button onClick={() => act(d => remindSign(d, c.id), `${c.signer}에게 다시 보냈어요.`)}>재전송</Button>
                      <Button onClick={() => act(d => cancelSign(d, c.id), '서명 요청을 취소했어요. 계약을 고친 뒤 다시 보낼 수 있어요.')}>요청 취소</Button>
                      <Button variant="primary" onClick={() => act(d => advanceSign(d, c.id), '상대방 서명이 들어와 계약이 체결됐어요.')}>서명 완료 반영</Button>
                    </>
                  )}
                  {c.sign === '서명 완료' && <ButtonLink href={`/print/contract/${c.id}`}>계약서</ButtonLink>}
                  <Button variant="text" onClick={() => history(c)}>이력</Button>
                </span>,
              ];
            })}
        />
      </Card>
      <Hint className="mt-4">
        시안에서는 실제 메일 · 문자를 보내지 않아요. 상대방이 서명하면 들어오는 결과를 ‘서명 완료 반영’ 버튼으로 대신해요. 근로계약서는 인사 · 세무 › 전자근로계약에서 보내요.
      </Hint>

      <SendForm key={sending ?? ''} contractId={sending} drafts={drafts} onClose={() => setSending(null)} />
    </>
  );
}

function SendForm({ contractId, drafts, onClose }: { contractId: string | null; drafts: Contract[]; onClose: () => void }) {
  const [id, setId] = useState(contractId ?? '');
  const c = drafts.find(x => x.id === id);
  return (
    <ModalForm open={!!contractId} onClose={onClose} title="전자서명 요청" submitLabel="서명 요청 보내기" done="서명 요청을 보냈어요." run={(d, f) => requestSign(d, f.contract, f.signer)}>
      <Select name="contract" label="계약" value={id} onChange={setId}>
        {drafts.map(x => <option key={x.id} value={x.id}>{x.title} · {x.partner}</option>)}
      </Select>
      <Field key={id} name="signer" label="서명자 (이메일 또는 휴대폰)" defaultValue={c?.signer ?? ''} placeholder="예) manager@partner.co.kr" />
      {c && <p className="text-tiny text-subtle">{c.partner} · {c.start} ~ {c.end || '기간 없음'} · {money(c.amount)}{c.cycle === '월 정기' ? '/월' : ''}</p>}
    </ModalForm>
  );
}
