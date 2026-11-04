// Permissive moderation twin: allows everything. For tests that exercise other behaviour;
// refused in production by config (constitution article 8).
import type { ModerationProvider } from './types.js';

export function createPermissiveModeration(): ModerationProvider {
  return { name: 'permissive', check: async () => ({ allowed: true, categories: [] }) };
}
