'use client';

import { Fragment } from 'react';
import { cx } from './ui';

const steps = ['구매 요청', '승인', '발주', '입고', '재고 반영', '판매 출고'];

export function FlowProgress({ active }: { active: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2 overflow-auto rounded-card border border-line bg-surface px-4 py-3 whitespace-nowrap shadow-card" aria-label="구매에서 판매까지 흐름">
      {steps.map((name, i) => (
        <Fragment key={name}>
          <li aria-current={i === active ? 'step' : undefined} className={cx('flex items-center gap-2 text-caption', i === active ? 'font-semibold text-ink' : i < active ? 'text-muted' : 'text-subtle')}>
            <b className={cx('grid size-5 place-items-center rounded-full text-micro', i === active ? 'bg-accent text-on-accent' : i < active ? 'bg-accent-soft text-accent' : 'border border-line-strong')}>
              {i < active ? '✓' : i + 1}
            </b>
            {name}
          </li>
          {i < steps.length - 1 && <li aria-hidden className={cx('h-px w-6 shrink-0 sm:flex-1', i < active ? 'bg-accent-line' : 'bg-line')} />}
        </Fragment>
      ))}
    </ol>
  );
}
