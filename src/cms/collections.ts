/**
 * What the CMS edits. Each CMS section maps to a content collection in src/content/
 * (schemas in src/content.config.ts) and describes its fields once: the editor form
 * is built from these fields and saved entries are checked against them.
 * Keep these in step with src/content.config.ts.
 */

export type Field =
  | { kind: 'text'; key: string; label: string; required?: boolean; hint?: string; lang?: string }
  | { kind: 'textarea'; key: string; label: string; required?: boolean; hint?: string }
  | {
      kind: 'number';
      key: string;
      label: string;
      hint?: string;
      default?: number;
      /** When left at 0, take the value from a sibling graphic field's own size */
      sizeOf?: { field: string; dimension: 'width' | 'height' };
      /** Kept and saved, but not shown in the editor (e.g. order, set by dragging) */
      hidden?: boolean;
    }
  /**
   * `optionsFrom`: the options are that CMS section's entries (value = entry id), filled in
   * when the form is shown and checked on save (resolveOptions in store.ts); the entry
   * being edited and entries under NDA are left out. Empty = none chosen (not saved).
   */
  | {
      kind: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      optionsFrom?: string;
      hint?: string;
      /** Kept as it is without being shown (set in code, not in the CMS) */
      hidden?: boolean;
    }
  /**
   * A checkbox for every entry of another CMS section (`optionsFrom`), e.g. "Featured" next
   * to each project. Saved as the ids of the ticked entries, in that section's order; the
   * options are filled in when the form is shown (resolveOptions in store.ts). `min`: at
   * least this many must be ticked.
   */
  | {
      kind: 'checklist';
      key: string;
      label: string;
      optionsFrom: string;
      options?: { value: string; label: string }[];
      /** The checkbox's label on every row */
      check: string;
      min?: number;
      hint?: string;
    }
  /** `limit`: at most this many entries in the collection can have it switched on */
  | { kind: 'boolean'; key: string; label: string; default?: boolean; limit?: number; hint?: string }
  /** A hex color like #FF6B03; empty means the default */
  | { kind: 'color'; key: string; label: string; placeholder?: string; hint?: string }
  /** A graphic from the asset library (src/cms/library.ts), stored as its public path */
  | { kind: 'graphic'; key: string; label: string; required?: boolean; hint?: string }
  /** A 3D model (.glb), saved to public/models/<collection>/ and stored as its public path */
  | { kind: 'model'; key: string; label: string; required?: boolean; hint?: string }
  /** A YouTube link; any YouTube URL is accepted and stored as the 11-character video id */
  | { kind: 'youtube'; key: string; label: string; required?: boolean; hint?: string }
  /**
   * `video: true` also accepts MP4 / WebM: uploaded, stored as { video: "/videos/..." }, or a
   * pasted https link to a hosted file (AWS etc.), stored as { video: "https://..." }.
   * `youtube: true` also accepts a pasted YouTube link, stored as { youtube: "<id>" }.
   */
  | { kind: 'image'; key: string; label: string; required?: boolean; video?: boolean; youtube?: boolean; hint?: string }
  /** 1..max images (or videos) side by side */
  | { kind: 'images'; key: string; label: string; max: number; video?: boolean; youtube?: boolean; hint?: string }
  /** `omitEmpty`: leave the key out instead of writing [] (for schema fields that default to []) */
  | { kind: 'strings'; key: string; label: string; item: string; multiline?: boolean; omitEmpty?: boolean; hint?: string }
  /** A nested object; `optional` adds an on/off switch and omits it when off */
  | { kind: 'group'; key: string; label: string; fields: Field[]; optional?: boolean; hint?: string }
  /** A repeatable list of objects; `max`: at most this many items; `sortable`: items can be
   *  dragged into order by their ⠿ handle, like page sections */
  | { kind: 'list'; key: string; label: string; item: string; fields: Field[]; max?: number; sortable?: boolean; hint?: string }
  /** A repeatable list of typed blocks, stored with a `type` key */
  | {
      kind: 'blocks';
      key: string;
      label: string;
      variants: { type: string; label: string; fields: Field[] }[];
      hint?: string;
    };

export interface CmsCollection {
  /** URL segment under /admin */
  slug: string;
  /** Folder name in src/content/ and src/assets/ */
  collection: 'home' | 'careers-page' | 'team' | 'studio' | 'news' | 'projects' | 'episodes' | 'positions';
  label: string;
  singular: string;
  /** Field used as the list title and to suggest the file name of a new entry */
  titleField: string;
  subtitleField?: string;
  /** Fields shown stacked on the right of each list row (a list field gives one line per item) */
  metaFields?: string[];
  thumbField?: string;
  /** Where the entry shows on the site, for the "View on site" link */
  siteUrl?: (id: string) => string;
  /** Entries can be dragged into order on the list page (rewrites their `order` field) */
  sortable?: boolean;
  /** Upload images into src/assets/<collection>/<id>/ instead of src/assets/<collection>/ */
  assetsPerEntry?: boolean;
  /**
   * Shown at the top of this section's list (and highlighted in its nav) instead of
   * having a nav item of its own, e.g. the studio card inside Team
   */
  parent?: string;
  /** Fixed entries: they can be edited, not added or deleted */
  fixed?: boolean;
  fields: Field[];
}

// Set by dragging rows on the list page, so the editor keeps it without showing it
const order: Field = {
  kind: 'number',
  key: 'order',
  label: 'Order',
  default: 0,
  hidden: true,
};

// Object ids on the Team field. Mirrors `objects` in src/blocks/team/TeamField.astro.
const TEAM_OBJECTS = [
  'hello_robo',
  'inner_calm_02',
  'bright_ideas_01',
  'wild_idea_final',
  'black_box',
  'red_box',
  'yellow_box',
  'seriously_playful',
  'good_chaos_13',
  'nuts_about_details_03',
  'cat_mode_active',
];

export const CMS_COLLECTIONS: CmsCollection[] = [
  // The home page's own settings: one fixed entry (src/content/home/home-page.json)
  {
    slug: 'home',
    collection: 'home',
    label: 'Home page',
    singular: 'home page',
    titleField: 'title',
    siteUrl: () => '/',
    fixed: true,
    fields: [
      {
        kind: 'checklist',
        key: 'featured',
        label: 'Featured works',
        optionsFrom: 'projects',
        check: 'Featured',
        min: 1,
        hint: 'The projects in the Works wheel on the home page, in the order of the Projects list. The Work page always shows every project.',
      },
      {
        kind: 'list',
        key: 'clients',
        label: 'Client logos',
        item: 'logo',
        max: 13,
        hint: 'The logos in the Clients block, in its 13 places, row by row from the top left (3, 2, 3, 2, 3). Click a logo to swap it, or upload a new one. A place can hold a micrographic instead.',
        fields: [
          { kind: 'text', key: 'name', label: 'Client name', required: true },
          {
            kind: 'graphic',
            key: 'logo',
            label: 'Logo',
            required: true,
            hint: 'A black logo on a transparent background: SVG preferred, or PNG / WebP. It is centred in its place.',
          },
          {
            kind: 'number',
            key: 'width',
            label: 'Logo width (px)',
            sizeOf: { field: 'logo', dimension: 'width' },
            hint: 'How wide the logo shows on a 1728px-wide screen (the others are 45–205). Empty = the SVG’s own width; 140 for a PNG.',
          },
          {
            kind: 'boolean',
            key: 'micrographic',
            label: 'Micrographic (not a client)',
            default: false,
            hint: 'A Hello Robo stamp in this place instead of a client logo: shown as decoration, not read out as a client.',
          },
        ],
      },
    ],
  },
  {
    slug: 'team',
    collection: 'team',
    label: 'Team',
    singular: 'team member',
    titleField: 'name',
    metaFields: ['role'],
    thumbField: 'photo',
    siteUrl: (id) => `/team#${id}`,
    sortable: true,
    fields: [
      { kind: 'text', key: 'name', label: 'Name', required: true },
      { kind: 'text', key: 'nameJa', label: 'Name in Japanese', required: true, lang: 'ja' },
      { kind: 'text', key: 'role', label: 'Role', required: true },
      { kind: 'textarea', key: 'quote', label: 'Quote', required: true },
      { kind: 'image', key: 'photo', label: 'Photo', required: true },
      {
        kind: 'select',
        key: 'object',
        label: 'Object on the Team field',
        hidden: true,
        options: [{ value: '', label: 'None' }, ...TEAM_OBJECTS.map((id) => ({ value: id, label: `${id.toUpperCase()}.OBJ` }))],
      },
      {
        kind: 'image',
        key: 'objectImage',
        label: 'Object image',
        hint: 'Their object on the Team field. PNG, best at 2× size on white or a transparent background',
      },
      {
        kind: 'text',
        key: 'objectName',
        label: 'File name',
        hint: 'Shown under their object on the Team field, followed by .obj (e.g. good_chaos_13)',
      },
      order,
    ],
  },
  {
    slug: 'studio',
    collection: 'studio',
    label: 'Studio card',
    singular: 'studio card',
    titleField: 'name',
    metaFields: ['heading'],
    siteUrl: (id) => `/team#${id}`,
    parent: 'team',
    fixed: true,
    fields: [
      { kind: 'text', key: 'nameJa', label: 'Name in Japanese', required: true, lang: 'ja' },
      { kind: 'text', key: 'name', label: 'Name', required: true },
      { kind: 'graphic', key: 'stamp', label: 'Stamp' },
      { kind: 'text', key: 'heading', label: 'Heading', required: true },
      { kind: 'strings', key: 'text', label: 'Text', item: 'paragraph', multiline: true },
    ],
  },
  {
    slug: 'updates',
    collection: 'news',
    label: 'Updates',
    singular: 'update',
    titleField: 'text',
    thumbField: 'image',
    siteUrl: () => '/',
    sortable: true,
    fields: [
      { kind: 'textarea', key: 'text', label: 'Text', required: true },
      { kind: 'image', key: 'image', label: 'Image', required: true },
      {
        kind: 'select',
        key: 'size',
        label: 'Card size',
        options: [
          { value: 'narrow', label: 'Narrow (537)' },
          { value: 'wide', label: 'Wide (815)' },
        ],
      },
      { kind: 'text', key: 'href', label: 'Link', required: true },
      order,
    ],
  },
  {
    slug: 'projects',
    collection: 'projects',
    label: 'Projects',
    singular: 'project',
    titleField: 'name',
    metaFields: ['services'],
    thumbField: 'reveal',
    siteUrl: (id) => `/work/${id}`,
    sortable: true,
    assetsPerEntry: true,
    fields: [
      { kind: 'text', key: 'name', label: 'Name', required: true },
      { kind: 'boolean', key: 'nda', label: 'Under NDA', default: false, hint: 'Shows the NDA tag in the work wheel; no View button and no project page' },
      { kind: 'textarea', key: 'intro', label: 'Intro', required: true },
      { kind: 'strings', key: 'services', label: 'Services', item: 'service' },
      {
        kind: 'image',
        key: 'reveal',
        label: 'Cover',
        required: true,
        video: true,
      },
      {
        kind: 'color',
        key: 'background',
        label: 'Background color',
        placeholder: '#000000',
      },
      {
        kind: 'group',
        key: 'micrographics',
        label: 'Micrographics',
        fields: [
          { kind: 'graphic', key: 'left', label: '1' },
          { kind: 'graphic', key: 'right', label: '2' },
        ],
      },
      {
        kind: 'blocks',
        key: 'sections',
        label: 'Page sections',
        variants: [
          {
            type: 'media',
            label: 'Media',
            fields: [
              {
                kind: 'images',
                key: 'images',
                label: 'Images or videos (1–3, side by side)',
                max: 3,
                video: true,
                youtube: true,
              },
            ],
          },
          {
            type: 'text',
            label: 'Text',
            fields: [
              { kind: 'text', key: 'label', label: 'Label', required: true },
              { kind: 'textarea', key: 'text', label: 'Text', required: true },
            ],
          },
          {
            type: 'facts',
            label: 'Facts',
            fields: [
              { kind: 'text', key: 'label', label: 'Headline' },
              { kind: 'textarea', key: 'text', label: 'Text' },
              {
                kind: 'list',
                key: 'facts',
                label: 'Lines',
                item: 'line',
                fields: [
                  { kind: 'text', key: 'label', label: 'Left', required: true },
                  { kind: 'text', key: 'value', label: 'Right', required: true },
                ],
              },
            ],
          },
        ],
      },
      {
        kind: 'group',
        key: 'testimonial',
        label: 'Testimonial',
        optional: true,
        fields: [
          { kind: 'textarea', key: 'quote', label: 'Quote', required: true },
          { kind: 'text', key: 'author', label: 'Author', required: true },
          { kind: 'text', key: 'role', label: 'Role', required: true },
        ],
      },
      {
        kind: 'list',
        key: 'credits',
        label: 'Credits',
        item: 'credit',
        fields: [
          { kind: 'text', key: 'role', label: 'Role', required: true },
          { kind: 'text', key: 'name', label: 'Name', required: true },
        ],
      },
      {
        kind: 'select',
        key: 'next',
        label: 'Next project',
        hint: 'Shown at the bottom of the page with its cover. Automatic: the next project in the Work order.',
        options: [{ value: '', label: 'Automatic' }],
        optionsFrom: 'projects',
      },
      order,
    ],
  },
  {
    slug: 'careers',
    collection: 'positions',
    label: 'Careers',
    singular: 'position',
    titleField: 'title',
    metaFields: ['location', 'hours', 'type'],
    siteUrl: (id) => `/careers/${id}`,
    sortable: true,
    fields: [
      { kind: 'text', key: 'title', label: 'Job title', required: true },
      { kind: 'text', key: 'location', label: 'Location', required: true },
      { kind: 'text', key: 'hours', label: 'Hours', required: true },
      {
        kind: 'select',
        key: 'type',
        label: 'Type',
        options: ['Full time', 'Contract', 'Contract to hire', 'Freelance', 'Internship'].map((t) => ({ value: t, label: t })),
      },
      order,
      {
        kind: 'group',
        key: 'stamp',
        label: 'Stamp next to the title',
        optional: true,
        fields: [
          { kind: 'graphic', key: 'src', label: 'Graphic', required: true },
          { kind: 'number', key: 'w', label: 'Width (px)', sizeOf: { field: 'src', dimension: 'width' } },
          { kind: 'number', key: 'h', label: 'Height (px)', sizeOf: { field: 'src', dimension: 'height' } },
        ],
      },
      { kind: 'strings', key: 'intro', label: 'Intro', item: 'paragraph', multiline: true, omitEmpty: true },
      { kind: 'strings', key: 'workOn', label: 'What you’ll work on', item: 'point', multiline: true, omitEmpty: true },
      { kind: 'strings', key: 'bring', label: 'What you bring', item: 'point', multiline: true, omitEmpty: true },
      { kind: 'strings', key: 'niceToHave', label: 'Nice to have', item: 'point', multiline: true, omitEmpty: true },
      { kind: 'strings', key: 'howWeWork', label: 'How we work', item: 'paragraph', multiline: true, omitEmpty: true },
      { kind: 'strings', key: 'applySteps', label: 'To apply, send', item: 'step', multiline: true, omitEmpty: true },
      { kind: 'textarea', key: 'outro', label: 'Closing line' },
    ],
  },
  // The Careers page's own settings, shown at the top of Careers (like the studio card in Team)
  {
    slug: 'careers-page',
    collection: 'careers-page',
    label: 'Careers page',
    singular: 'careers page',
    titleField: 'title',
    siteUrl: () => '/careers',
    parent: 'careers',
    fixed: true,
    fields: [
      {
        kind: 'list',
        key: 'strip',
        label: 'Photo strip',
        item: 'photo',
        max: 12,
        sortable: true,
        hint: 'The photos across the bottom of the Careers hero, left to right, all at the same height (any width). The first starts a little off the left edge; the last ones slide in as the page scrolls.',
        fields: [{ kind: 'image', key: 'photo', label: 'Photo', required: true }],
      },
    ],
  },
  {
    slug: 'robo-radio',
    collection: 'episodes',
    label: 'Robo Radio',
    singular: 'episode',
    titleField: 'title',
    thumbField: 'cover',
    siteUrl: (id) => `/robo-radio/${id}`,
    sortable: true,
    fields: [
      { kind: 'text', key: 'title', label: 'Title', required: true },
      { kind: 'number', key: 'number', label: 'Episode number' },
      { kind: 'text', key: 'guest', label: 'Guest name', required: true },
      { kind: 'text', key: 'guestTitle', label: 'Guest title', required: true },
      { kind: 'image', key: 'cover', label: 'Cover image', required: true },
      { kind: 'youtube', key: 'youtube', label: 'YouTube video', required: true },
      { kind: 'textarea', key: 'description', label: 'Description', required: true },
      { kind: 'text', key: 'portfolioUrl', label: 'Guest’s portfolio link' },
      { kind: 'boolean', key: 'listed', label: 'Show in “All episodes”', default: true },
      {
        kind: 'boolean',
        key: 'featured',
        label: 'Featured',
        default: false,
        limit: 6,
      },
      {
        kind: 'boolean',
        key: 'homepage',
        label: 'Displayed on homepage',
        default: false,
        limit: 4,
      },
      order,
    ],
  },
];

/** Video id from a YouTube URL (watch, youtu.be, embed, shorts, live) or a bare id */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function getCmsCollection(slug: string | undefined) {
  return CMS_COLLECTIONS.find((c) => c.slug === slug);
}
