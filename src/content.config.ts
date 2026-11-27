import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const tools = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    summary: z.string().max(160),
    status: z.enum(['live', 'in-progress']),
    // An enum, not a string: each category needs an icon (src/lib/icons.ts), so a new one fails the build.
    category: z.enum(['CSS', 'Accessibility']),
    order: z.number().int().nonnegative(),
    navLabel: z.string().min(1),
    related: z.array(reference('tools')).min(2).max(3),
    keywords: z.array(z.string()),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    ogTitle: z.string().optional(),
  }),
});

export const collections = { tools };
