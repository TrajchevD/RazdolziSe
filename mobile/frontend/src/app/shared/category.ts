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
//
// Colors were an arbitrary rainbow (blue/orange/green/brown/purple/gray) predating
// the Organic retheme, clashing with the warm terracotta/sage palette everywhere
// else. Now pulled from the same accent/accent-2/neutral ramps as the rest of the
// app (styles.scss) — fixed ramp steps rather than the theme-flipping semantic
// tokens, since these pair with a fixed white tile letter (.category-tile/.chip-tile)
// in both light and dark mode and need to stay dark enough for that in both.
export const EXPENSE_CATEGORIES: CategoryMeta[] = [
  { value: 'Lodging', label: 'Lodging', tile: 'LO', color: 'var(--color-accent-2-600)' },
  { value: 'Transport', label: 'Transport', tile: 'TR', color: 'var(--color-neutral-600)' },
  { value: 'Food', label: 'Food', tile: 'FO', color: 'var(--color-accent-600)' },
  { value: 'Groceries', label: 'Groceries', tile: 'GR', color: 'var(--color-neutral-700)' },
  { value: 'Activities', label: 'Activities', tile: 'AC', color: 'var(--color-accent-2-700)' },
  { value: 'Other', label: 'Other', tile: 'OT', color: 'var(--color-accent-700)' },
];

export function getCategoryMeta(category: string): CategoryMeta {
  return EXPENSE_CATEGORIES.find((c) => c.value === category) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}
