import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export const byToolOrder = (a: CollectionEntry<'tools'>, b: CollectionEntry<'tools'>): number =>
  a.data.order - b.data.order;

export async function getTools(): Promise<CollectionEntry<'tools'>[]> {
  const tools = (await getCollection('tools')).sort(byToolOrder);
  if (new Set(tools.map((tool) => tool.data.order)).size !== tools.length) {
    throw new Error('Tool order values must be unique.');
  }
  if (new Set(tools.map((tool) => tool.data.slug)).size !== tools.length) {
    throw new Error('Tool slugs must be unique.');
  }
  for (const tool of tools) {
    const related = tool.data.related.map((item) => item.id);
    if (new Set(related).size !== related.length || related.includes(tool.id)) {
      throw new Error(`Invalid related tools for ${tool.id}: use distinct other tools.`);
    }
    for (const id of related) {
      if (!tools.some((candidate) => candidate.id === id)) throw new Error(`Missing related tool: ${id}`);
    }
  }
  return tools;
}
