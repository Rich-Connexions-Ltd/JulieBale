import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());

  return rss({
    title: "Julie Bale — Voice, Mind & Life",
    description: "Practical wisdom on singing, performance confidence, clinical hypnotherapy, and finding the voice — and the life — you deserve.",
    site: context.site ?? 'https://www.juliebale.com',
    items: posts.map(post => ({
      title: post.data.title,
      description: post.data.description ?? '',
      pubDate: post.data.publishDate,
      link: `/blog/${post.id}/`,
    })),
    customData: '<language>en-gb</language>',
  });
}
