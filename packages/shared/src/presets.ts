import type { CategoryType } from './category';

export interface CategoryPreset {
  name: string;
  type: CategoryType;
  tooltip: string;
}

/**
 * 費目プリセットマスタ。ユーザー初回登録時にこの内容を複製して
 * 各ユーザー所有の Category レコードとして投入する（プリセット自体は不変）。
 */
export const PRESET_CATEGORIES: readonly CategoryPreset[] = [
  // 固定費
  { name: '住宅費', type: 'fixed', tooltip: '家賃、住宅ローン、管理費など' },
  { name: '水道光熱費', type: 'fixed', tooltip: '水道代、電気代、ガス代' },
  { name: '通信料', type: 'fixed', tooltip: 'インターネット接続料、携帯電話代、固定電話代など' },
  { name: '保険料', type: 'fixed', tooltip: '生命保険、医療保険、学資保険、個人年金など' },
  {
    name: '車両費',
    type: 'fixed',
    tooltip: '車のローン、駐車場代、車検代、自動車税、自動車保険料など',
  },
  {
    name: '保育料・学費',
    type: 'fixed',
    tooltip: '保育園・幼稚園の費用、小学校・中学校・高校・大学の費用など',
  },
  { name: '税金', type: 'fixed', tooltip: '国民健康保険料、国民年金、所得税、住民税など' },
  {
    name: '習い事',
    type: 'fixed',
    tooltip: '子どもの塾や習い事の月謝、自分や家族のカルチャースクール等の月謝など',
  },
  { name: '交通費', type: 'fixed', tooltip: '通勤や通学のための定期代など' },
  { name: '小遣い', type: 'fixed', tooltip: '夫、妻、子どもの小遣い' },
  {
    name: 'その他',
    type: 'fixed',
    tooltip: '新聞購読料、ウォーターサーバーレンタル料、ジム代など',
  },
  // 変動費
  { name: '食費', type: 'variable', tooltip: '食料品代、外食代など' },
  {
    name: '日用品費',
    type: 'variable',
    tooltip: '掃除道具や、ティッシュペーパーなどの日用品、消耗品代など',
  },
  { name: '医療費', type: 'variable', tooltip: '医薬品代、通院費、入院費など' },
  {
    name: '子ども費',
    type: 'variable',
    tooltip: '教材代、文具や書籍代、部活動や習い事の雑費など',
  },
  { name: '被服費', type: 'variable', tooltip: '洋服などの購入、クリーニング代など' },
  { name: '美容費', type: 'variable', tooltip: '化粧品購入や美容院代など' },
  { name: '交際費', type: 'variable', tooltip: '飲み会代、お祝いのプレゼント代、ご祝儀など' },
  { name: '娯楽費', type: 'variable', tooltip: '書籍の購入や映画鑑賞など' },
  { name: '雑費', type: 'variable', tooltip: 'その他の少額な出費' },
  { name: '特別費', type: 'variable', tooltip: '家電購入代や旅行費など' },
] as const;
