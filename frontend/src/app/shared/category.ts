import { ExpenseCategory } from '../core/api.models';

export interface CategoryMeta {
  value: ExpenseCategory;
  label: string;
  /** Two-letter tile abbreviation shown in the colored avatar-style icon. */
  tile: string;
  color: string;
}

// Fixed set mirroring the backend's ValidCategories — purely cosmetic (icon/color),
// so keeping it as a closed list means every expense reliably maps to a known tile.
export const EXPENSE_CATEGORIES: CategoryMeta[] = [
  { value: 'Lodging', label: 'Lodging', tile: 'LO', color: '#3b5bdb' },
  { value: 'Transport', label: 'Transport', tile: 'TR', color: '#e8590c' },
  { value: 'Food', label: 'Food', tile: 'FO', color: '#2f9e44' },
  { value: 'Groceries', label: 'Groceries', tile: 'GR', color: '#a17a3a' },
  { value: 'Activities', label: 'Activities', tile: 'AC', color: '#9c36b5' },
  { value: 'Other', label: 'Other', tile: 'OT', color: '#868e96' },
];

export function getCategoryMeta(category: string): CategoryMeta {
  return EXPENSE_CATEGORIES.find((c) => c.value === category) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}
