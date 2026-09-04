import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Menu, Wallet } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Footer } from './Footer';
import { MOBILE_TAB_ITEMS, NAV_ITEMS } from './nav-items';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-svh flex-col bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:flex-row">
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

      <main className="flex-1 overflow-x-hidden px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-8">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
          <Footer />
        </div>
      </main>

      {/* モバイル: 下部タブナビゲーション（最低限のみ。残りはハンバーガーメニューから） */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        {MOBILE_TAB_ITEMS.map((item) => (
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
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="メニュー"
              className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
            >
              <Menu className="size-5" aria-hidden="true" />
              メニュー
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>メニュー</DialogTitle>
            </DialogHeader>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
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
          </DialogContent>
        </Dialog>
      </nav>
    </div>
  );
}
