import { OGImageRoute } from 'astro-og-canvas';
import { getTools } from '../../lib/seo/tools';
import { readTokens, resolveToken, toSrgb } from '../../../scripts/contrast.mjs';
import tokenSource from '../../styles/tokens.css?raw';

const tools = await getTools();
const tokens = readTokens(tokenSource);
const rgb = (name: string): [number, number, number] => {
  const [r, g, b] = toSrgb(resolveToken(tokens, name, 'dark'));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};
const number = (name: string): number => {
  const value = Number(resolveToken(tokens, name, 'dark'));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid OG number token: ${name}`);
  return value;
};
const family = resolveToken(tokens, '--font-og-family', 'dark');

const pages: Record<string, { title: string; description: string }> = {
  home: {
    title: "Suprabhat's Lab",
    description: 'Free frontend tools and explainers. No sign-up, no paywall, no tracking.',
  },
  about: {
    title: 'Web for all, all for web.',
    description: "Why this lab exists, how it's built, and what it collects: nothing.",
  },
  tools: {
    title: 'All tools',
    description: 'Free CSS and accessibility tools, grouped by topic. Your input never leaves your browser.',
  },
  methodology: {
    title: 'How the tools are checked',
    description: 'The reference data and oracle libraries behind each tool, and what each one cannot know.',
  },
};
for (const tool of tools) {
  pages[tool.data.slug] = { title: tool.data.ogTitle ?? tool.data.title, description: tool.data.summary };
}

const FONT = './node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2';

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getSlug: (path) => path,
  getImageOptions: (_path, page: { title: string; description: string }) => ({
    title: page.title,
    description: page.description,
    bgGradient: [rgb('--bg')],
    border: { color: rgb('--border'), width: number('--og-border-width'), side: 'block-end' },
    padding: number('--og-padding'),
    fonts: [FONT],
    font: {
      title: {
        families: [family],
        weight: 'Bold',
        size: number('--og-title-size'),
        lineHeight: number('--line-display'),
        color: rgb('--text'),
      },
      description: {
        families: [family],
        weight: 'Normal',
        size: number('--og-description-size'),
        lineHeight: number('--line-ui'),
        color: rgb('--text-muted'),
      },
    },
  }),
});
