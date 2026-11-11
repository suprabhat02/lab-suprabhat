import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';

const tools = await getCollection('tools');

const pages: Record<string, { title: string; description: string }> = {
  home: {
    title: "Suprabhat's Lab",
    description: 'Free frontend tools and explainers. No sign-up, no paywall, no tracking.',
  },
  about: {
    title: 'Web for all, all for web.',
    description: "Why this lab exists, how it's built, and what it collects: nothing.",
  },
};
for (const tool of tools) {
  pages[tool.data.slug] = { title: tool.data.ogTitle ?? tool.data.title, description: tool.data.summary };
}

const FONT = './node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2';

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getSlug: (path) => path,
  getImageOptions: (_path, page: { title: string; description: string }) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[7, 12, 16]],
    border: { color: [255, 77, 42], width: 12, side: 'block-end' },
    padding: 80,
    fonts: [FONT],
    font: {
      title: { families: ['Geist Mono Variable'], weight: 'Bold', size: 76, lineHeight: 1.1, color: [243, 245, 248] },
      description: { families: ['Geist Mono Variable'], weight: 'Normal', size: 34, lineHeight: 1.4, color: [190, 197, 204] },
    },
  }),
});
