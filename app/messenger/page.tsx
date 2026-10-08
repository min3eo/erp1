'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCollab } from '@/components/collab-ui';
import { Avatar, Button, PageHead, cx } from '@/components/ui';
import * as C from '@/lib/collab';

export default function MessengerPage() {
  const { collab, run } = useCollab();
  const [roomId, setRoomId] = useState(collab.rooms[0]?.id);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const room = collab.rooms.find(r => r.id === roomId);

  // Opening a room marks it read.
  useEffect(() => {
    if (room?.unread) run(c => C.readRoom(c, room.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [roomId, room?.messages.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!room) return;
    let ok = false;
    run(c => { C.sendMessage(c, room.id, text); ok = true; });
    if (ok) setText('');
  };

  return (
    <>
      <PageHead title="메신저" sub="프로젝트 대화방과 1:1 대화를 한곳에서 이어 가세요." />
      <div className="grid h-[calc(100dvh-300px)] min-h-[440px] overflow-hidden rounded-card border border-line bg-surface md:grid-cols-[280px_minmax(0,1fr)]">
        <ul className="overflow-auto border-b border-line md:border-r md:border-b-0" aria-label="대화방">
          {collab.rooms.map(r => {
            const last = r.messages[r.messages.length - 1];
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setRoomId(r.id)}
                  aria-current={r.id === roomId}
                  className={cx('flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left', r.id === roomId ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-caption font-semibold text-canvas">{r.name[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <strong className="truncate text-body font-medium">{r.name}</strong>
                      <span className="shrink-0 text-tiny text-subtle">{last?.time}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-caption text-muted">{last ? `${last.author}: ${last.text}` : '대화를 시작해 보세요'}</span>
                      {r.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-micro leading-4.5 font-semibold text-on-accent">{r.unread}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {room ? (
          <section className="flex min-h-0 flex-col" aria-label={`${room.name} 대화`}>
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <div>
                <h2 className="text-title font-medium">{room.name}</h2>
                <p className="text-tiny text-subtle">{room.members.join(', ')}</p>
              </div>
            </header>
            <div className="flex-1 overflow-auto px-5 py-4">
              <ol className="flex flex-col gap-3">
                {room.messages.map((m, i) => {
                  const mine = m.author === C.ME;
                  return (
                    <li key={i} className={cx('flex items-end gap-2', mine && 'flex-row-reverse')}>
                      {!mine && <Avatar name={m.author} className="size-7 text-[10px]" />}
                      <div className={cx('max-w-[70%]', mine && 'text-right')}>
                        {!mine && <span className="mb-0.5 block text-tiny text-muted">{m.author}</span>}
                        <p className={cx('inline-block rounded-2xl px-3.5 py-2 text-left text-body', mine ? 'rounded-br-md bg-ink text-canvas' : 'rounded-bl-md bg-surface-2 text-ink')}>{m.text}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-subtle">{m.time}</span>
                    </li>
                  );
                })}
              </ol>
              <div ref={end} />
            </div>
            <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
              <label htmlFor="message" className="sr-only">메시지</label>
              <input
                id="message"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={`${room.name}에 메시지 보내기`}
                autoComplete="off"
                className="h-9 flex-1 rounded-md border border-line bg-surface px-3 text-body outline-none placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <Button type="submit" variant="primary" disabled={!text.trim()}>보내기</Button>
            </form>
          </section>
        ) : (
          <p className="grid place-items-center text-body text-subtle">대화방을 골라 주세요.</p>
        )}
      </div>
      <p className="mt-2 text-caption text-subtle">시안에서는 메시지가 이 브라우저에만 저장되고 다른 사람에게 전송되지 않아요.</p>
    </>
  );
}
