import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { ErpProvider } from '@/components/erp-provider';
import { themeBootScript } from '@/components/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'tessel', template: '%s · tessel' },
  description: '구매·재고·인사가 한 판에 맞물리는 업무 플랫폼 — tessel 프론트 시안',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/* Pretendard is not on Google Fonts; this is its official CDN build. */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>
        <ErpProvider>
          <AppShell>{children}</AppShell>
        </ErpProvider>
      </body>
    </html>
  );
}
