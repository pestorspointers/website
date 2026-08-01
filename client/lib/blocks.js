/**
 * The block catalogue.
 *
 * This one file is the contract between the page builder and the renderer:
 * `fields` generates the edit form in /admin/pages, and `defaults` is what a
 * freshly added section starts out as. To add a new kind of section, add an
 * entry here and a matching component in components/blocks/BlockRenderer.jsx.
 *
 * Field types the admin form knows how to render:
 *   text | textarea | image | select | number | toggle | list
 */

export const BACKGROUNDS = [
  { value: 'white', label: 'White' },
  { value: 'light', label: 'Light grey' },
  { value: 'navy', label: 'Deep blue' },
  { value: 'dark', label: 'Charcoal' },
  { value: 'accent', label: 'Orange' },
];

const backgroundField = {
  name: 'background',
  type: 'select',
  label: 'Background colour',
  options: BACKGROUNDS,
};

const alignField = {
  name: 'align',
  type: 'select',
  label: 'Text alignment',
  options: [
    { value: 'center', label: 'Centred' },
    { value: 'left', label: 'Left' },
  ],
};

const ctaFields = [
  { name: 'ctaLabel', type: 'text', label: 'Button text', placeholder: 'Get started' },
  { name: 'ctaHref', type: 'text', label: 'Button link', placeholder: '/courses' },
];

export const BLOCK_TYPES = {
  hero: {
    label: 'Hero banner',
    icon: '🏔️',
    description:
      'A big headline over a full-width background image. Best as the first section on a page.',
    fields: [
      { name: 'heading', type: 'text', label: 'Headline' },
      { name: 'subheading', type: 'text', label: 'Sub-headline (small, above the body)' },
      { name: 'bodyHeading', type: 'text', label: 'Second headline' },
      { name: 'body', type: 'textarea', label: 'Body text', rows: 5 },
      { name: 'backgroundImage', type: 'image', label: 'Background image' },
      {
        name: 'overlay',
        type: 'select',
        label: 'Image tint',
        options: [
          { value: 'navy', label: 'Deep blue' },
          { value: 'dark', label: 'Charcoal' },
          { value: 'accent', label: 'Orange' },
          { value: 'none', label: 'No tint' },
        ],
      },
      {
        name: 'overlayOpacity',
        type: 'number',
        label: 'Tint strength (0–100)',
        min: 0,
        max: 100,
        help: 'Higher makes the text easier to read but hides more of the image.',
      },
      {
        name: 'size',
        type: 'select',
        label: 'Height',
        options: [
          { value: 'large', label: 'Tall' },
          { value: 'medium', label: 'Medium' },
          { value: 'small', label: 'Short' },
        ],
      },
      alignField,
      ...ctaFields,
    ],
    defaults: {
      heading: 'Your headline here',
      subheading: '',
      bodyHeading: '',
      body: '',
      backgroundImage: '',
      overlay: 'navy',
      overlayOpacity: 75,
      size: 'medium',
      align: 'center',
      ctaLabel: '',
      ctaHref: '',
    },
  },

  richText: {
    label: 'Text',
    icon: '📝',
    description: 'A heading and paragraphs. Leave a blank line between paragraphs.',
    fields: [
      { name: 'heading', type: 'text', label: 'Heading' },
      { name: 'body', type: 'textarea', label: 'Text', rows: 10 },
      { name: 'image', type: 'image', label: 'Image (optional)' },
      {
        name: 'imageStyle',
        type: 'select',
        label: 'Image style',
        options: [
          { value: 'avatar', label: 'Round portrait' },
          { value: 'wide', label: 'Full width' },
        ],
      },
      { name: 'boxed', type: 'toggle', label: 'Put the text in a grey box' },
      alignField,
      backgroundField,
    ],
    defaults: {
      heading: '',
      body: 'Write something here.',
      image: '',
      imageStyle: 'wide',
      boxed: false,
      align: 'left',
      background: 'white',
    },
  },

  imageText: {
    label: 'Image + text',
    icon: '🖼️',
    description: 'An image on one side, words on the other.',
    fields: [
      { name: 'heading', type: 'text', label: 'Heading' },
      { name: 'body', type: 'textarea', label: 'Text', rows: 6 },
      { name: 'image', type: 'image', label: 'Image' },
      {
        name: 'imagePosition',
        type: 'select',
        label: 'Image side',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      ...ctaFields,
      backgroundField,
    ],
    defaults: {
      heading: 'Heading',
      body: '',
      image: '',
      imagePosition: 'left',
      ctaLabel: '',
      ctaHref: '',
      background: 'white',
    },
  },

  cards: {
    label: 'Cards',
    icon: '🃏',
    description: 'A row of cards, each with an image, a title and some text.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      {
        name: 'columns',
        type: 'select',
        label: 'Cards per row',
        options: [
          { value: 2, label: '2' },
          { value: 3, label: '3' },
          { value: 4, label: '4' },
        ],
      },
      {
        name: 'cardStyle',
        type: 'select',
        label: 'Card colour',
        options: [
          { value: 'white', label: 'White' },
          { value: 'navy', label: 'Deep blue' },
          { value: 'light', label: 'Light grey' },
        ],
      },
      backgroundField,
      {
        name: 'cards',
        type: 'list',
        label: 'Cards',
        itemLabel: 'Card',
        itemFields: [
          { name: 'eyebrow', type: 'text', label: 'Small label above the title' },
          { name: 'title', type: 'text', label: 'Title' },
          { name: 'body', type: 'textarea', label: 'Text', rows: 4 },
          { name: 'image', type: 'image', label: 'Image' },
          { name: 'href', type: 'text', label: 'Link (optional)' },
        ],
        itemDefaults: { eyebrow: '', title: 'New card', body: '', image: '', href: '' },
      },
    ],
    defaults: { heading: '', columns: 3, cardStyle: 'white', background: 'light', cards: [] },
  },

  gallery: {
    label: 'Image gallery',
    icon: '📸',
    description: 'A grid of images.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      {
        name: 'columns',
        type: 'select',
        label: 'Images per row',
        options: [
          { value: 2, label: '2' },
          { value: 3, label: '3' },
          { value: 4, label: '4' },
        ],
      },
      backgroundField,
      {
        name: 'images',
        type: 'list',
        label: 'Images',
        itemLabel: 'Image',
        itemFields: [
          { name: 'url', type: 'image', label: 'Image' },
          { name: 'alt', type: 'text', label: 'Description (for screen readers)' },
          { name: 'caption', type: 'text', label: 'Caption' },
        ],
        itemDefaults: { url: '', alt: '', caption: '' },
      },
    ],
    defaults: { heading: '', columns: 3, background: 'white', images: [] },
  },

  imageBanner: {
    label: 'Wide image',
    icon: '🌄',
    description: 'A single full-width image strip.',
    fields: [
      { name: 'image', type: 'image', label: 'Image' },
      { name: 'alt', type: 'text', label: 'Description (for screen readers)' },
      {
        name: 'height',
        type: 'select',
        label: 'Height',
        options: [
          { value: 'small', label: 'Short' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Tall' },
        ],
      },
    ],
    defaults: { image: '', alt: '', height: 'medium' },
  },

  videoEmbed: {
    label: 'Video',
    icon: '▶️',
    description: 'Embed a YouTube, Vimeo or Wistia video by pasting its link.',
    fields: [
      { name: 'heading', type: 'text', label: 'Heading' },
      {
        name: 'url',
        type: 'text',
        label: 'Video link',
        placeholder: 'https://www.youtube.com/watch?v=…',
        help: 'Paste the normal share link — it gets converted to an embed automatically.',
      },
      { name: 'caption', type: 'text', label: 'Caption' },
      backgroundField,
    ],
    defaults: { heading: '', url: '', caption: '', background: 'white' },
  },

  cta: {
    label: 'Call to action',
    icon: '📣',
    description: 'A short pitch with one or two buttons.',
    fields: [
      { name: 'heading', type: 'text', label: 'Heading' },
      { name: 'body', type: 'textarea', label: 'Text', rows: 3 },
      ...ctaFields,
      { name: 'secondaryCtaLabel', type: 'text', label: 'Second button text' },
      { name: 'secondaryCtaHref', type: 'text', label: 'Second button link' },
      alignField,
      backgroundField,
    ],
    defaults: {
      heading: 'Ready to start?',
      body: '',
      ctaLabel: 'Get started',
      ctaHref: '/register',
      secondaryCtaLabel: '',
      secondaryCtaHref: '',
      align: 'center',
      background: 'white',
    },
  },

  faq: {
    label: 'Questions & answers',
    icon: '❓',
    description: 'A list of common questions with their answers.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      backgroundField,
      {
        name: 'items',
        type: 'list',
        label: 'Questions',
        itemLabel: 'Question',
        itemFields: [
          { name: 'question', type: 'text', label: 'Question' },
          { name: 'answer', type: 'textarea', label: 'Answer', rows: 4 },
        ],
        itemDefaults: { question: '', answer: '' },
      },
    ],
    defaults: { heading: 'Frequently asked questions', background: 'white', items: [] },
  },

  linkCards: {
    label: 'Link tiles',
    icon: '🔗',
    description: 'Small tiles that link somewhere — social profiles, for example.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      {
        name: 'columns',
        type: 'select',
        label: 'Tiles per row',
        options: [
          { value: 2, label: '2' },
          { value: 3, label: '3' },
          { value: 4, label: '4' },
        ],
      },
      backgroundField,
      {
        name: 'cards',
        type: 'list',
        label: 'Tiles',
        itemLabel: 'Tile',
        itemFields: [
          { name: 'title', type: 'text', label: 'Title' },
          { name: 'subtitle', type: 'text', label: 'Subtitle' },
          { name: 'href', type: 'text', label: 'Link' },
        ],
        itemDefaults: { title: '', subtitle: '', href: '' },
      },
    ],
    defaults: { heading: '', columns: 4, background: 'white', cards: [] },
  },

  // ─── Blocks that pull live data ───────────────────────────────────────────

  courseGrid: {
    label: 'Course list',
    icon: '🎓',
    description: 'Shows your published courses automatically. Nothing to type in.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      { name: 'viewAllLabel', type: 'text', label: '"View all" link text' },
      { name: 'limit', type: 'number', label: 'How many to show', min: 1, max: 12 },
      backgroundField,
    ],
    defaults: { heading: 'Courses', viewAllLabel: 'View all', limit: 3, background: 'light' },
  },

  pricing: {
    label: 'Membership plans',
    icon: '💳',
    description:
      'Shows your active membership plans automatically. Edit the plans under Memberships.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      { name: 'subheading', type: 'text', label: 'Sub-heading' },
      { name: 'ctaLabel', type: 'text', label: 'Button text' },
      backgroundField,
    ],
    defaults: {
      heading: 'Membership',
      subheading: '',
      ctaLabel: 'Get Started',
      background: 'navy',
      emptyCtaLabel: 'Get Started Today',
      emptyCtaHref: '/register',
    },
  },

  blogGrid: {
    label: 'Latest articles',
    icon: '📰',
    description: 'Shows your most recent published blog posts automatically.',
    fields: [
      { name: 'heading', type: 'text', label: 'Section heading' },
      { name: 'viewAllLabel', type: 'text', label: '"View all" link text' },
      { name: 'limit', type: 'number', label: 'How many to show', min: 1, max: 12 },
      backgroundField,
    ],
    defaults: { heading: 'Articles', viewAllLabel: 'View all', limit: 3, background: 'white' },
  },

  spacer: {
    label: 'Spacer',
    icon: '↕️',
    description: 'Blank breathing room between two sections.',
    fields: [
      {
        name: 'size',
        type: 'select',
        label: 'Height',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ],
      },
      backgroundField,
    ],
    defaults: { size: 'medium', background: 'white' },
  },
};

/** The "add a section" menu, in the order it should be offered. */
export const BLOCK_MENU = Object.entries(BLOCK_TYPES).map(([type, def]) => ({
  type,
  label: def.label,
  icon: def.icon,
  description: def.description,
}));

export const getBlockDefinition = (type) => BLOCK_TYPES[type] ?? null;

export const getBlockLabel = (type) => BLOCK_TYPES[type]?.label ?? type;

/** Content for a newly added block of `type`. */
export const newBlockContent = (type) => ({ ...(BLOCK_TYPES[type]?.defaults ?? {}) });
