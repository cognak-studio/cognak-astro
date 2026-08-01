import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Project content collection — one markdown file per project at
// src/content/projects/<slug>/index.md.
// Field names mirror the legacy content model:
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
      /* OPTIONAL on purpose — three states, not two. `true` renders "· ACTIVE"
         on the cask grade, `false` renders "· PAST", and LEAVING IT OUT renders
         neither. That means the 53 existing projects need no bulk authoring:
         flag the live ones as you go and the rest simply show the grade, as
         they do today. Don't give this a .default(). */
      /* How COGNAK worked on it, NOT what disciplines were involved — the
         category line already carries discipline in mono above the grade, and
         a role of "creative + development lead" just restated it.
         The rendered TENSE is derived from activeClient, so these are modes,
         not strings: `led` reads "Leading the work" on a live client and "Led
         the work" on a past one. Defaults to `led` because that is the studio's
         normal engagement; the exceptions are the ones worth authoring. */
      /* Where the client is. Stored as the PLACE ONLY ("Boston"); the page
         renders "Boston-based". Structured rather than free text in
         moreDetails because the archive had already drifted — "LA-based" and
         "Los Angeles-based" both existed, normalised to "Los Angeles" here. */
      clientLocation: z.string().optional(),
      role: z.enum(['led', 'led-build', 'build', 'embedded']).default('led'),
      activeClient: z.boolean().optional(),
      /* ENGAGEMENT LENGTH IN MONTHS — what the cask grade is computed from.
         Lifted verbatim from each project's own authored duration line ("5+
         year relationship" → 60, "6-month project" → 6), so these are the
         studio's own statements, not anything derived. 52 of 53 published
         projects had one.
         The grade used to come from `date`, the WordPress PUBLISH timestamp —
         when the case study was posted, not how long the work ran. Accorin
         graded XO · 10y while its own copy read "5+ year relationship". */
      engagementMonths: z.number().optional(),
      /* Start year, and ONLY where genuinely known (from `projectYear`) — ten
         projects. On an ACTIVE client this switches the grade to live, so it
         accrues on its own instead of freezing at the authored duration. Never
         guess this: a wrong start year is a wrong public claim, and the
         authored-duration fallback is already correct. */
      engagementStart: z.number().optional(),
      homepageFeature: z.boolean().default(false),
      homepagePosition: z.number().optional(),
      metaDescription: z.string().optional(),
      noindex: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects };
