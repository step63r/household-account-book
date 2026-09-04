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
 * モバイル下部タブに常時表示する項目（アイコンのみ、最低限）。残り（費目・サブスクリプション・
 * 設定を含む全項目）はハンバーガーメニュー（NAV_ITEMS全量、ラベル付き）から遷移する設計。
 */
export const MOBILE_TAB_ITEMS: NavItem[] = NAV_ITEMS.filter((item) =>
  ['/dashboard', '/transactions', '/budgets'].includes(item.to),
);
