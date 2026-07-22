const PALETTE = ['#4c6ef5', '#f06595', '#37b24d', '#f59f00', '#7048e8', '#12b886', '#e64980', '#1c7ed6'];

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
