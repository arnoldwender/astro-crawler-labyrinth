import type { LabyrinthOptions } from './types.js';

/**
 * Populated at Astro build/SSR bundle time by the Vite plugin in `integration.ts`.
 * Remains `null` in standalone Node/Edge/test runtimes unless transformed by Vite.
 */
export const INJECTED_CONFIG: Partial<LabyrinthOptions> | null = null;
