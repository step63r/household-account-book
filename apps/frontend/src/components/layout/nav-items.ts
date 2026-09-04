import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  Tags,
  Repeat,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

/** 全項目。デスクトップのサイドバーと、モバイルのハンバーガーメニュー内で使う。 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/transactions', label: '取引', icon: ArrowLeftRight },
  { to: '/budgets', label: '予算', icon: PiggyBank },
  { to: '/categories', label: '費目', icon: Tags },
  { to: '/subscriptions', label: 'サブスクリプション', icon: Repeat },
  { to: '/settings', label: '設定', icon: Settings },
];

/**
 * モバイル下部タブに常時表示する項目（最低限のみ）。全項目を並べるとiOSで折り返してしまうため、
 * 残りはハンバーガーメニュー（NAV_ITEMS全量）から遷移する設計にしている。
 */
export const MOBILE_TAB_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (item) => item.to !== '/subscriptions' && item.to !== '/settings',
);
