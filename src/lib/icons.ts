/**
 * The only icons the site may use. Icon.astro maps each name to its per-icon Lucide import and
 * must cover exactly this list, so an unregistered name fails `astro check`. This file holds no
 * component imports, so plain `tsc` never has to resolve Lucide's `.astro` sources.
 */
import type { CollectionEntry } from 'astro:content';

export const ICON_NAMES = [
  'accessibility',
  'arrow-up-right',
  'braces',
  'check',
  'chevron-right',
  'copy',
  'moon',
  'plus',
  'sun',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export type ToolCategory = CollectionEntry<'tools'>['data']['category'];

export const CATEGORY_ICONS = {
  CSS: 'braces',
  Accessibility: 'accessibility',
} as const satisfies Record<ToolCategory, IconName>;
