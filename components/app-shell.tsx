'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { groupTabLabel, href, navGroups, navSections, pageFromPath, pageNames } from '@/lib/nav';
import { companies, type CompanyId } from '@/lib/seed';
import { CommandPalette, OPEN_SEARCH_EVENT } from './command-palette';
import { useErp } from './erp-provider';
import { FormDialog } from './forms';
import { Logo } from './logo';
import { ThemeSwitch } from './theme';
import { useModalDialog } from './use-modal-dialog';
import { Avatar, cx, Icon } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  const { company, state, companyInfo, switchCompany, pending, toast } = useErp();
  const router = useRouter();
  const page = pageFromPath(usePathname());
  const groups = navGroups(state.modules).filter(([, ids]) => ids.length);
  const group = groups.find(([, ids]) => ids.includes(page))?.[0] ?? groups[0][0];
  const sections = navSections(group);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    const onSearch = () => setPaletteOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onSearch);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onSearch);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-3 border-b border-line bg-canvas/90 backdrop-blur print:hidden">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="tessel 홈" className="shrink-0"><Logo /></Link>

          <div className="mx-auto flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 w-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-body text-subtle hover:border-line-strong sm:w-64 lg:w-80"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 shrink-0" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span className="hidden sm:inline">검색...</span>
              <kbd className="ml-auto hidden font-mono text-tiny sm:inline">Ctrl K</kbd>
            </button>
            <label className="hidden h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-body text-ink-2 hover:border-line-strong md:flex">
              <span className="grid size-4 place-items-center rounded-sm bg-ink text-[9px] font-bold text-canvas">{companyInfo.tile}</span>
              <select
                value={company}
                onChange={e => {
                  switchCompany(e.target.value as CompanyId);
                  router.push('/');
                  toast('워크스페이스를 전환했어요.');
                }}
                aria-label="회사 선택"
                className="appearance-none bg-transparent pr-1 outline-none"
              >
                {(Object.keys(companies) as CompanyId[]).map(id => <option key={id} value={id}>{companies[id].name}</option>)}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3 text-subtle" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </label>
          </div>

          <nav className="flex shrink-0 items-center gap-1 text-body text-ink-2" aria-label="바로가기">
            <Link href={href('approval')} className="hidden h-8 items-center gap-1.5 rounded-md px-2 hover:bg-surface-2 sm:flex">
              결재함
              {pending > 0 && <span className="rounded-full bg-accent px-1.5 text-micro leading-4 font-semibold text-on-accent">{pending}</span>}
            </Link>
            <Link href={href('reports')} className="hidden h-8 items-center rounded-md px-2 hover:bg-surface-2 lg:flex">리포트</Link>
            <Link href={href('settings')} className="hidden h-8 items-center rounded-md px-2 hover:bg-surface-2 lg:flex">설정</Link>
            <Avatar name="민" className="ml-1 size-7" />
          </nav>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 sm:px-4 lg:px-6" aria-label="모듈">
          {groups.map(([g, ids]) => (
            <Link
              key={g}
              href={href(ids[0])}
              aria-current={g === group ? 'page' : undefined}
              className={cx(
                'relative shrink-0 px-2 py-2.5 text-body whitespace-nowrap transition-colors',
                g === group ? 'font-medium text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-ink' : 'text-muted hover:text-ink',
              )}
            >
              {groupTabLabel[g] ?? g}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-[97px] hidden h-[calc(100dvh-97px)] w-60 shrink-0 flex-col border-r border-line bg-surface-2/50 md:flex print:hidden">
          <nav className="flex-1 overflow-auto px-3 py-5" aria-label={group}>
            {sections.map(([title, ids], i) => {
              const visible = ids.filter(id => navGroups(state.modules).some(([, gIds]) => gIds.includes(id)));
              if (!visible.length) return null;
              return (
                <section key={title} className={cx(i > 0 && 'mt-5 border-t border-line pt-5')}>
                  <h2 className="mb-1.5 px-2.5 text-tiny text-subtle">{title}</h2>
                  <ul className="flex flex-col gap-px">
                    {visible.map(id => (
                      <li key={id}>
                        <Link
                          href={href(id)}
                          aria-current={page === id ? 'page' : undefined}
                          className={cx(
                            'flex h-8.5 items-center gap-2.5 rounded-md px-2.5 text-body',
                            page === id ? 'font-medium text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
                          )}
                        >
                          <Icon page={id} className={page === id ? 'text-ink' : 'text-subtle'} />
                          {pageNames[id]}
                          {id === 'approval' && pending > 0 && <span className="ml-auto text-tiny text-accent">{pending}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </nav>
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <code className="font-mono text-tiny text-subtle">({companyInfo.code})</code>
            <ThemeSwitch />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Small screens: the sidebar's pages become a chip row. */}
          <nav className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2 md:hidden print:hidden" aria-label={group}>
            {sections.flatMap(([, ids]) => ids).map(id => (
              <Link key={id} href={href(id)} className={cx('shrink-0 rounded-full border px-3 py-1 text-caption', page === id ? 'border-ink bg-ink text-canvas' : 'border-line text-muted')}>
                {pageNames[id]}
              </Link>
            ))}
          </nav>
          {/* Keyed by company so list filters and tabs reset when the workspace changes. */}
          <main key={company} className="mx-auto max-w-[1180px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12 print:max-w-none print:p-0">
            <div key={page} className="animate-page">{children}</div>
          </main>
          <footer className="mx-auto flex max-w-[1180px] print:hidden flex-wrap items-center justify-between gap-3 px-4 pb-10 text-tiny text-subtle sm:px-8 lg:px-12">
            <span>tessel · 프론트 시안 · 표시된 정보는 샘플 데이터입니다.</span>
            <span className="md:hidden"><ThemeSwitch /></span>
          </footer>
        </div>
      </div>

      <FormDialog />
      <Drawer />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toast />
    </>
  );
}

function Drawer() {
  const { drawer, closeDrawer } = useErp();
  const ref = useModalDialog(!!drawer);
  return (
    <dialog
      ref={ref}
      onClose={closeDrawer}
      className="my-0 mr-0 ml-auto h-dvh max-h-dvh w-130 max-w-[92vw] border-l border-line bg-surface px-6 py-5 text-ink shadow-pop open:animate-drawer"
    >
      {drawer && (
        <>
          <div className="mb-5 flex items-center justify-between border-b border-line pb-4">
            <h2 className="text-[20px] font-medium tracking-tight">{drawer.title}</h2>
            <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" onClick={closeDrawer} aria-label="상세 닫기">✕</button>
          </div>
          {drawer.body}
        </>
      )}
    </dialog>
  );
}

function Toast() {
  const { toastMessage } = useErp();
  if (!toastMessage) return null;
  const { tone } = toastMessage;
  return (
    <div
      key={toastMessage.key}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className="pointer-events-none fixed bottom-6 left-1/2 z-20 flex w-max max-w-[90%] animate-toast items-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 pr-4 pl-3 text-body text-ink shadow-pop"
    >
      <span
        aria-hidden
        className={cx(
          'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
          tone === 'success' && 'bg-ok-soft text-ok',
          tone === 'error' && 'bg-danger-soft text-danger',
          tone === 'info' && 'bg-surface-2 text-muted',
        )}
      >
        {tone === 'success' ? '✓' : tone === 'error' ? '!' : 'i'}
      </span>
      {toastMessage.text}
    </div>
  );
}
