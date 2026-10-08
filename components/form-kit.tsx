'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { ErpState } from '@/lib/flow-core';
import { useErp } from './erp-provider';
import { useModalDialog } from './use-modal-dialog';
import { Button } from './ui';

export type Values = Record<string, string>;

export const inputClass = 'mt-1.5 block h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-body text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft';

export function Field({ name, label, type = 'text', defaultValue, min, step, max, optional, placeholder, list }: {
  name: string; label: string; type?: string; defaultValue?: string | number; min?: string | number; step?: string; max?: number;
  optional?: boolean; placeholder?: string; list?: string;
}) {
  const numeric = type === 'number';
  return (
    <label className="my-3 block text-caption font-medium text-ink-2">
      {label}
      {optional && <span className="ml-1 font-normal text-subtle">(선택)</span>}
      <input
        name={name} type={type} defaultValue={defaultValue} required={!optional} min={min ?? (numeric ? 1 : undefined)} step={step ?? (numeric ? 1 : undefined)} max={max}
        placeholder={placeholder} list={list} autoComplete={list ? 'off' : undefined} className={inputClass}
      />
    </label>
  );
}

export function Select({ name, label, value, defaultValue, onChange, children }: { name: string; label: string; value?: string; defaultValue?: string; onChange?: (v: string) => void; children: ReactNode }) {
  return (
    <label className="my-3 block text-caption font-medium text-ink-2">
      {label}
      <select name={name} required value={value} defaultValue={defaultValue} onChange={onChange && (e => onChange(e.target.value))} className={inputClass}>
        {children}
      </select>
    </label>
  );
}

export function Summary({ title, sub, rows, children }: { title: string; sub?: string; rows?: [string, string][]; children?: ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-line bg-surface-2 p-3.5 text-body">
      <strong>{title}</strong>
      {sub && <p className="mt-1.25 mb-3 text-tiny text-muted">{sub}</p>}
      {rows?.map(([k, v]) => (
        <div key={k} className="mt-2 flex justify-between text-xs">
          <span className="text-muted">{k}</span>
          <b>{v}</b>
        </div>
      ))}
      {children && <span className="text-xs text-muted">{children}</span>}
    </div>
  );
}

/** Datalist of names for free-text inputs that suggest known values. */
export const Suggestions = ({ id, values }: { id: string; values: string[] }) => <datalist id={id}>{values.map(v => <option key={v} value={v} />)}</datalist>;

/**
 * Shared form chrome: runs `run` on a draft state; errors stay in the form, success closes and toasts.
 * Closes the global form dialog unless `onClose` is given.
 */
export function FormShell({ title, submitLabel = '등록하기', done = '등록했어요.', run, onClose, children }: {
  title: string; submitLabel?: string; done?: string; run: (draft: ErpState, f: Values) => unknown; onClose?: () => void; children: ReactNode;
}) {
  const { mutate, setForm, toast } = useErp();
  const [error, setError] = useState('');
  const close = onClose ?? (() => setForm(null));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Values;
    try {
      mutate(draft => run(draft, values), `${title} · ${done}`);
      close();
      toast(done);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="-mx-6 -mt-5 mb-4 flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="text-title font-semibold">{title}</h2>
        <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" onClick={close} aria-label="닫기">✕</button>
      </div>
      {children}
      <p className="min-h-4.5 text-caption text-danger" role="alert">{error}</p>
      <div className="-mx-6 -mb-5 mt-4 flex justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3">
        <Button onClick={close}>취소</Button>
        <Button variant="primary" type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

export const dialogClass = 'm-auto max-h-[90vh] w-[90%] overflow-auto rounded-xl border border-line bg-surface px-6 py-5 text-ink shadow-pop open:animate-pop sm:w-110';

/** A page-owned form dialog: the body mounts only while open, so each opening starts fresh. */
export function ModalForm({ open, onClose, ...shell }: Parameters<typeof FormShell>[0] & { open: boolean; onClose: () => void }) {
  const ref = useModalDialog(open);
  return (
    <dialog ref={ref} onClose={onClose} className={dialogClass}>
      {open && <FormShell {...shell} onClose={onClose} />}
    </dialog>
  );
}

/** Runs one state change from a button and reports the result as a toast. */
export function useAction() {
  const { mutate, toast } = useErp();
  return (fn: (draft: ErpState) => unknown, done: string) => {
    try {
      mutate(fn, done);
      toast(done);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
}
