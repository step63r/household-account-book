import { NavLink, Outlet } from 'react-router-dom';
import { Wallet } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Footer } from './Footer';
import { NAV_ITEMS } from './nav-items';

export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      {/* デスクトップ: サイドバー */}
      <aside className="hidden shrink-0 border-r border-border md:flex md:w-60 md:flex-col md:gap-1 md:p-4">
        <div className="mb-4 flex items-center gap-2 px-2 py-1">
          <Wallet className="size-6 text-primary" aria-hidden="true" />
          <span className="text-lg font-semibold">家計簿</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* モバイル: 上部ヘッダー */}
      <header className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
        <Wallet className="size-5 text-primary" aria-hidden="true" />
        <span className="text-base font-semibold">家計簿</span>
      </header>

      <main className="flex-1 overflow-x-hidden px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
          <Footer />
        </div>
      </main>

      {/* モバイル: 下部タブナビゲーション */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="size-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
