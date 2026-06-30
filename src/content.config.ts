import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Project content collection — one markdown file per project at
// src/content/projects/<slug>/index.md.
// Mirrors the WordPress ACF fields used by the cognak-black theme:
//   hero_image, hover_image, project_type, project_year,
//   homepage_feature, homepage_position, about_the_client
const projects = defineCollection({
  // Glob loader (Astro v6+). The id is the project folder name (e.g. `bose`),
  // so existing /projects/<slug>/ URLs are preserved.
  loader: glob({
    pattern: ['**/index.md', '!**/_*/**'],
    base: './src/content/projects',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      slug: z.string().optional(),
      category: z.string().optional(),
      date: z.coerce.date().optional(),
      projectType: z.string().optional(),
      projectYear: z.union([z.string(), z.number()]).optional(),
      aboutTheClient: z.string().optional(),
      theWork: z.string().optional(),
      moreDetails: z.string().optional(),
      heroVideo: z.string().optional(),
      hoverVideo: z.string().optional(),
      thumbnail: image(),
      hero: image(),
      hover: image().optional(),
      images: z.array(image()).default([]),
      homepageFeature: z.boolean().default(false),
      homepagePosition: z.number().optional(),
      metaDescription: z.string().optional(),
      noindex: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects };
