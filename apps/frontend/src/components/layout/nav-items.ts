import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  Tags,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { to: '/transactions', label: '取引', icon: ArrowLeftRight },
  { to: '/budgets', label: '予算', icon: PiggyBank },
  { to: '/categories', label: '費目', icon: Tags },
  { to: '/settings', label: '設定', icon: Settings },
];
