'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ErpState } from '@/lib/flow-core';
import { companies, loadState, saveState, seed, type CompanyId } from '@/lib/seed';

export type FormType = 'item' | 'purchase' | 'sale' | 'leave' | 'receipt' | 'ship' | 'cancelOrder' | 'cancelMovement' | 'saleReturn' | 'purchaseReturn' | 'adjustment' | 'task' | 'quote' | 'rejectQuote' | 'collect' | 'pay' | 'workOrder' | 'output' | 'salary';
export interface FormRequest { type: FormType; ref?: string; token: string; key: number }
export interface DrawerContent { title: string; body: ReactNode }
export type ToastTone = 'success' | 'error' | 'info';
export interface ToastMessage { text: string; tone: ToastTone; key: number }

interface ErpContext {
  company: CompanyId;
  companyInfo: (typeof companies)[CompanyId];
  state: ErpState;
  /** Runs fn on a copy of the state and commits it only if fn does not throw. */
  mutate: <T>(fn: (draft: ErpState) => T) => T;
  switchCompany: (company: CompanyId) => void;
  resetState: () => void;
  pending: number;
  /** Defaults to 'success'; pass 'error' for failures and 'info' for neutral notes. */
  toast: (text: string, tone?: ToastTone) => void;
  form: FormRequest | null;
  setForm: (form: FormRequest | null) => void;
  drawer: DrawerContent | null;
  openDrawer: (title: string, body: ReactNode) => void;
  closeDrawer: () => void;
  toastMessage: ToastMessage | null;
}

const Context = createContext<ErpContext | null>(null);

export function useErp() {
  const ctx = useContext(Context);
  if (!ctx) throw Error('useErp must be used inside ErpProvider');
  return ctx;
}

interface Workspace { company: CompanyId; state: ErpState }

export function ErpProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const ref = useRef<Workspace | null>(null);
  const [form, setForm] = useState<FormRequest | null>(null);
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const commit = useCallback((next: Workspace) => {
    ref.current = next;
    setWorkspace(next);
    saveState(next.company, next.state);
  }, []);

  // localStorage only exists in the browser, so the workspace loads after hydration.
  useEffect(() => {
    const company: CompanyId = 'epure';
    commit({ company, state: loadState(company) });
  }, [commit]);

  const mutate = useCallback(<T,>(fn: (draft: ErpState) => T): T => {
    const current = ref.current!;
    const draft = structuredClone(current.state);
    const result = fn(draft);
    commit({ company: current.company, state: draft });
    return result;
  }, [commit]);

  const switchCompany = useCallback((company: CompanyId) => {
    const state = loadState(company);
    ref.current = { company, state };
    setWorkspace(ref.current);
  }, []);

  const resetState = useCallback(() => {
    const company = ref.current!.company;
    commit({ company, state: seed(company) });
  }, [commit]);

  const toast = useCallback((text: string, tone: ToastTone = 'success') => setToastMessage({ text, tone, key: Date.now() }), []);
  const openDrawer = useCallback((title: string, body: ReactNode) => setDrawer({ title, body }), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const value = useMemo<ErpContext | null>(() => {
    if (!workspace) return null;
    const { state, company } = workspace;
    const pending =
      state.orders.filter(o => o.status === '승인 대기').length +
      state.leaves.filter(l => l.status === '승인 대기').length +
      state.adjustments.filter(a => a.status === '승인 대기').length;
    return {
      company, companyInfo: companies[company], state, mutate, switchCompany, resetState, pending,
      toast, toastMessage, form, setForm, drawer, openDrawer, closeDrawer,
    };
  }, [workspace, mutate, switchCompany, resetState, toast, toastMessage, form, drawer, openDrawer, closeDrawer]);

  if (!value) return <LoadingShell />;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Shown for the moment between first paint and loading saved data from this browser. */
function LoadingShell() {
  const bar = 'animate-shimmer rounded bg-surface-2';
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <div className="flex h-14 items-center gap-3 border-b border-line px-6">
        <div className={bar + ' h-5 w-24'} />
        <div className={bar + ' mx-auto h-8 w-80'} />
        <div className={bar + ' size-7 rounded-full'} />
      </div>
      <div className="flex">
        <div className="hidden h-[calc(100dvh-56px)] w-60 shrink-0 flex-col gap-2 border-r border-line p-5 md:flex">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className={bar + ' h-6'} />)}
        </div>
        <div className="mx-auto w-full max-w-[1180px] px-12 py-12">
          <div className={bar + ' h-9 w-64'} />
          <div className={bar + ' mt-8 h-24'} />
          <div className={bar + ' mt-4 h-64'} />
        </div>
      </div>
    </div>
  );
}
