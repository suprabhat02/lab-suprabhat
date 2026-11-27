/**
 * Every tool's card preview. `ToolPreview.astro` maps each slug to its component with
 * `satisfies Record<PreviewSlug, …>`, and `previewFor` throws for a slug without one, so a new
 * tool fails the build until it gets a preview.
 */
export const PREVIEW_SLUGS = ['specificity', 'playground', 'stylesheet-audit', 'accessible-name'] as const;

export type PreviewSlug = (typeof PREVIEW_SLUGS)[number];

export function isPreviewSlug(slug: string): slug is PreviewSlug {
  return (PREVIEW_SLUGS as readonly string[]).includes(slug);
}

export function previewFor(slug: string): PreviewSlug {
  if (!isPreviewSlug(slug)) {
    throw new Error(`No card preview for tool "${slug}". Add one in src/components/previews/.`);
  }
  return slug;
}
