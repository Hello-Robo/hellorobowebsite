// CMS-shaped content. Each collection is a folder of JSON files in src/content/.
// Later these loaders can be swapped for a headless CMS without touching the pages.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * An image (path in src/assets, optimized by astro:assets; GIFs keep their animation)
 * or a video: a file in public/videos/ or a hosted MP4 / WebM link (e.g. AWS S3 /
 * CloudFront), written as { "video": "/videos/..." | "https://..." }.
 * Rendered by src/components/ui/Media.astro.
 */
const video = z.object({ video: z.string().regex(/^(\/videos\/|https:\/\/)/) });
const media = (image: () => z.ZodTypeAny) => z.union([image(), video]);
/** Project page rows also take a YouTube video: { "youtube": "<11-character id>" } */
const sectionMedia = (image: () => z.ZodTypeAny) =>
  z.union([image(), video, z.object({ youtube: z.string().regex(/^[\w-]{11}$/) })]);

const projects = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      intro: z.string(),
      services: z.array(z.string()),
      /** Under NDA: shown in the work wheel / cards with the NDA tag, but no View button,
          no link and no project page */
      nda: z.boolean().default(false),
      /** Cover: the Work wheel background (Home + /work); not shown on the project page */
      reveal: media(image),
      /** Page background for the dark sections; text turns black on light colors */
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      /** The two hero micrographics (public paths from the CMS asset library); left one is round */
      micrographics: z
        .object({ left: z.string().optional(), right: z.string().optional() })
        .default({}),
      /**
       * Page body, in order: media rows (1–3 side by side), text rows and facts blocks
       * (headline + text like a text row, then label / value lines; "What Made People Say Yes")
       */
      sections: z.array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('media'), images: z.array(sectionMedia(image)).min(1).max(3) }),
          z.object({ type: z.literal('text'), label: z.string(), text: z.string() }),
          z.object({
            type: z.literal('facts'),
            label: z.string().optional(),
            text: z.string().optional(),
            facts: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
          }),
        ]),
      ),
      testimonial: z
        .object({ quote: z.string(), author: z.string(), role: z.string() })
        .optional(),
      credits: z.array(z.object({ role: z.string(), name: z.string() })).default([]),
      /** id of the project shown under "Next project" (its name and cover); none = the next one in the Work order */
      next: z.string().optional(),
      order: z.number().default(0),
    }),
});

const team = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/team' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      nameJa: z.string(),
      role: z.string(),
      quote: z.string(),
      photo: image(),
      /** The object on the Team field that opens this card ('' = none) */
      object: z.string().default('').describe('Object id on the Team field, e.g. inner_calm_02'),
      /** Their own picture for that object (PNG), replacing the built-in one everywhere on the field */
      objectImage: image().optional(),
      /** The file name shown under their object, without “.obj” (e.g. good_chaos_13) */
      objectName: z.string().optional(),
      order: z.number().default(0),
    }),
});

/** The studio card on /team (opened by the robot); one entry, hello-robo.json */
const studio = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/studio' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      nameJa: z.string(),
      /** Stamp top right: a public path from the CMS asset library */
      stamp: z.string().optional(),
      heading: z.string(),
      text: z.array(z.string()).default([]),
      /** Its own picture for the robot (PNG), replacing the built-in one everywhere on the field */
      objectImage: image().optional(),
      /** The file name shown under the robot, without “.obj” (e.g. hello_robo) */
      objectName: z.string().optional(),
    }),
});

const positions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/positions' }),
  schema: z.object({
    title: z.string(),
    location: z.string(),
    hours: z.string(),
    type: z.enum(['Full time', 'Contract', 'Contract to hire', 'Freelance', 'Internship']),
    intro: z.array(z.string()).default([]),
    workOn: z.array(z.string()).default([]),
    bring: z.array(z.string()).default([]),
    niceToHave: z.array(z.string()).default([]),
    howWeWork: z.array(z.string()).default([]),
    applySteps: z.array(z.string()).default([]),
    /** Closing line under "How to apply" */
    outro: z.string().optional(),
    /** Optional stamp shown next to the title in the Careers list */
    stamp: z.object({ src: z.string(), w: z.number(), h: z.number() }).optional(),
    order: z.number().default(0),
  }),
});

const episodes = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/episodes' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    number: z.number().optional(),
    guest: z.string(),
    /** What the guest does, e.g. "Head of Design at Humanoid" */
    guestTitle: z.string(),
    description: z.string(),
    /** YouTube video id (the 11 characters after watch?v=) */
    youtube: z.string().regex(/^[\w-]{11}$/).optional(),
    portfolioUrl: z.string().optional(),
    /** Vertical poster (1082×1530) used in "All episodes" and the poster grid */
    cover: image().optional(),
    /** Tall poster used on the episode page */
    poster: image().optional(),
    /** Show in the "All episodes" list */
    listed: z.boolean().default(true),
    /** Poster in the "One talk. One future" collage (up to 6, in `order`) */
    featured: z.boolean().default(false),
    /** Poster in the Robo Radio section on Home (up to 4, in `order`) */
    homepage: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/news' }),
  schema: ({ image }) => z.object({
    text: z.string(),
    image: image(),
    /** Card width on the Home carousel: "wide" = 815, "narrow" = 537 */
    size: z.enum(['wide', 'narrow']).default('narrow'),
    href: z.string(),
    order: z.number().default(0),
  }),
});

/** Client logos in fixed places (Home Clients block, Services "Building toward yes"): a
    logo (SVG preferred, or PNG / WebP; public path) and its width in px at the 1728 layout
    (0 = 140). A place can hold a micrographic instead (decorative) */
const clientLogos = z
  .array(
    z.object({
      name: z.string(),
      logo: z.string(),
      width: z.number().default(0),
      /** a Hello Robo micrographic in a logo's place: decoration, not a client */
      micrographic: z.boolean().default(false),
    }),
  )
  .default([]);

/** The home page's own settings (CMS "Home page"): one entry, home-page.json */
const home = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/home' }),
  schema: ({ image }) =>
    z.object({
      /** Projects (ids) in the Works wheel on Home, shown in the Projects order */
      featured: z.array(z.string()).default([]),
      /** The Clients block's logos, in its 13 places (row by row) */
      clients: clientLogos,
      /** The hero's 3D scene on desktop (src/scripts/hero-scene.ts); empty = its defaults */
      hero: z
        .object({
          /** Equirect 2:1 picture on the sphere behind the robot */
          background: image().optional(),
          maxYawDeg: z.number().optional(),
          maxPitchDeg: z.number().optional(),
          damping: z.number().optional(),
          torsoShare: z.number().optional(),
          idleAfterMs: z.number().optional(),
          robotScale: z.number().optional(),
          robotLiftOfFrame: z.number().optional(),
          bgRotationStrength: z.number().optional(),
          bgSameDirection: z.boolean().optional(),
          bgTiles: z.number().optional(),
          bgFisheye: z.number().optional(),
          bgFovDeg: z.number().optional(),
          bgOpacity: z.number().optional(),
        })
        .default({}),
    }),
});

/** The Services page's own settings (CMS "Services page"): one entry, services-page.json */
const servicesPage = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/services-page' }),
  schema: z.object({
    /** "Building toward yes": the logos in its row of six, left to right */
    clients: clientLogos,
  }),
});

/** The Careers page's own settings (CMS "Careers page"): one entry, careers-page.json */
const careersPage = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/careers-page' }),
  schema: ({ image }) =>
    z.object({
      /** The hero's photo strip, left to right, all shown at the same height */
      strip: z.array(z.object({ photo: image() })).default([]),
      /** Our values, one screen each: the kanji label, the name, the description and the
          picture on the right */
      values: z
        .array(
          z.object({
            kanji: z.string(),
            name: z.string(),
            text: z.string(),
            image: image(),
            imageAlt: z.string().default(''),
          }),
        )
        .default([]),
    }),
});

export const collections = { home, 'services-page': servicesPage, 'careers-page': careersPage, projects, team, studio, positions, episodes, news };
