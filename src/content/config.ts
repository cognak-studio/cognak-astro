import { defineCollection, z } from 'astro:content';

// Project content collection — one markdown file per project.
// Mirrors the WordPress ACF fields used by the cognak-black theme:
//   hero_image, hover_image, project_type, project_year,
//   homepage_feature, homepage_position, about_the_client
const projects = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      slug: z.string().optional(),
      /** Comma list shown on the Projects list view ('categories' post meta) */
      category: z.string().optional(),
      /** Publish date (ISO) — drives the newest-first sort */
      date: z.coerce.date().optional(),
      projectType: z.string().optional(),
      projectYear: z.union([z.string(), z.number()]).optional(),
      /** Rich HTML body fields from ACF (single-project template) */
      aboutTheClient: z.string().optional(),
      theWork: z.string().optional(),
      moreDetails: z.string().optional(),
      heroVideo: z.string().optional(),
      /** Featured (square) image used in the home + projects grids */
      thumbnail: image(),
      /** Single-project hero image */
      hero: image(),
      hover: image().optional(),
      images: z.array(image()).default([]),
      // Homepage featuring controls (from ACF group_homepage_feature)
      homepageFeature: z.boolean().default(false),
      homepagePosition: z.number().optional(),
      // SEO
      metaDescription: z.string().optional(),
      noindex: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects };
