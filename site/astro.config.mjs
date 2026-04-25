// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.juliebale.com',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/homepage/') &&
        !page.includes('/thank-you/') &&
        !page.includes('/admin/'),
    }),
  ],
});
