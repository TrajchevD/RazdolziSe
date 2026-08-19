import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** Thin wrappers around @capacitor/haptics, each a complete no-op on web (both
 *  because Capacitor.isNativePlatform() guards it, same pattern as
 *  core/native.service.ts, and because the underlying plugin itself no-ops
 *  gracefully in a browser) — safe to call from anywhere without checking the
 *  platform at the call site. Kept as two small functions rather than importing
 *  Haptics directly in every component, so call sites read as "give a light tap"
 *  instead of needing to know ImpactStyle/NotificationType's exact values. */

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (!Capacitor.isNativePlatform()) return;
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
  Haptics.impact({ style: map[style] }).catch(() => {
    /* best-effort — a missing haptics engine on some Android OEM skins isn't worth surfacing */
  });
}

export function hapticNotification(type: 'success' | 'warning' | 'error'): void {
  if (!Capacitor.isNativePlatform()) return;
  const map = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error };
  Haptics.notification({ type: map[type] }).catch(() => {});
}
