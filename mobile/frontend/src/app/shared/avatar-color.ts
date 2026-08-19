// Retheme: warm, muted tones pulled from the Organic design system's accent
// ramps (terracotta/sage) plus a few adjacent hues, instead of the original
// saturated primary-color palette — so member avatars sit with the rest of the
// app's cream/terracotta/sage palette instead of clashing against it. Still
// enough hue variety to tell people apart at a glance.
const PALETTE = ['#c67139', '#7a8a5e', '#b5793f', '#8c6a9c', '#5f6f45', '#a85a29', '#6b8577', '#9c6b4f'];

/** Deterministic color per member id, so the same person always gets the same
 *  avatar color across screens and sessions without storing anything server-side. */
export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
