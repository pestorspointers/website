import Link from 'next/link';
import { fetchCourses, fetchTiers, fetchPosts } from '@/lib/publicData';

/**
 * Renders the blocks that make up a CMS page.
 *
 * Every component here is a server component, so data-driven sections
 * (courses, plans, articles) can fetch on the server and the page still ships
 * as static HTML. The block types live in lib/blocks.js — add one there and a
 * matching case in RENDERERS below.
 */

// ─── Shared bits ─────────────────────────────────────────────────────────────

const BACKGROUND_CLASSES = {
  white: 'bg-white text-[#161E2A]',
  light: 'bg-gray-50 text-[#161E2A]',
  navy: 'bg-[#100566] text-white',
  dark: 'bg-[#161E2A] text-white',
  accent: 'bg-[#f53100] text-white',
};

const OVERLAY_COLOURS = {
  navy: '#100566',
  dark: '#161E2A',
  accent: '#f53100',
};

const isDark = (background) => background === 'navy' || background === 'dark' || background === 'accent';

function Section({ background = 'white', className = '', children }) {
  return (
    <section className={`${BACKGROUND_CLASSES[background] ?? BACKGROUND_CLASSES.white} ${className}`}>
      {children}
    </section>
  );
}

function SectionHeading({ children, dark = false, className = '' }) {
  if (!children) return null;
  return (
    <h2
      className={`text-3xl md:text-4xl font-bold ${dark ? 'text-white' : 'text-[#161E2A]'} ${className}`}
    >
      {children}
    </h2>
  );
}

/** Splits a textarea's contents into paragraphs on blank lines. */
function Prose({ text, className = '', paragraphClassName = '' }) {
  if (!text) return null;

  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={className}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={`leading-relaxed ${paragraphClassName}`}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function Button({ href, children, variant = 'primary' }) {
  if (!href || !children) return null;

  const styles = {
    primary: 'bg-[#f53100] text-white hover:bg-[#d42a00]',
    light: 'bg-white text-[#f53100] hover:bg-gray-100',
    outline: 'border-2 border-[#100566] text-[#100566] hover:bg-[#100566] hover:text-white',
  };

  return (
    <Link
      href={href}
      className={`inline-block px-8 py-4 font-bold rounded-lg transition-colors ${styles[variant]}`}
    >
      {children}
    </Link>
  );
}

/** Turns a normal share link into something an <iframe> can load. */
function toEmbedUrl(url) {
  if (!url) return '';
  const value = String(url).trim();

  const youtube = value.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/
  );
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;

  const vimeo = value.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  // Wistia and anything already pointing at an embed endpoint pass through.
  return value;
}

const gridColumns = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
};

// ─── Blocks ──────────────────────────────────────────────────────────────────

function Hero({ content }) {
  const {
    heading,
    subheading,
    bodyHeading,
    body,
    backgroundImage,
    overlay = 'navy',
    overlayOpacity = 75,
    size = 'medium',
    align = 'center',
    ctaLabel,
    ctaHref,
  } = content;

  const padding = { large: 'py-28 md:py-36', medium: 'py-24', small: 'py-20' }[size] ?? 'py-24';
  const overlayColour = OVERLAY_COLOURS[overlay];

  return (
    <section
      className="relative text-white overflow-hidden"
      style={
        backgroundImage
          ? {
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { backgroundColor: overlayColour ?? OVERLAY_COLOURS.navy }
      }
    >
      {backgroundImage && overlayColour && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: overlayColour, opacity: Number(overlayOpacity) / 100 }}
        />
      )}

      <div
        className={`relative max-w-4xl mx-auto px-4 ${padding} ${
          align === 'left' ? 'text-left' : 'text-center'
        }`}
      >
        {heading && (
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">{heading}</h1>
        )}
        {subheading && (
          <p className="text-xl md:text-2xl font-semibold text-blue-100 mb-8">{subheading}</p>
        )}
        {bodyHeading && <h2 className="text-2xl md:text-3xl font-bold mb-3">{bodyHeading}</h2>}
        <Prose
          text={body}
          className="space-y-4 mb-10"
          paragraphClassName="text-lg text-blue-100/90"
        />
        <Button href={ctaHref}>{ctaLabel}</Button>
      </div>
    </section>
  );
}

function RichText({ content }) {
  const {
    heading,
    body,
    image,
    imageStyle = 'wide',
    imageFallback,
    boxed = false,
    align = 'left',
    background = 'white',
    size,
  } = content;

  const dark = isDark(background);

  return (
    <Section background={background} className="py-16 md:py-20">
      <div className={`max-w-3xl mx-auto px-4 ${align === 'center' ? 'text-center' : ''}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className={
              imageStyle === 'avatar'
                ? 'w-40 h-40 rounded-full object-cover mx-auto mb-10'
                : 'w-full rounded-2xl object-cover mb-10'
            }
          />
        ) : (
          imageFallback && (
            <div className="w-40 h-40 rounded-full bg-gray-200 mx-auto mb-10 flex items-center justify-center text-gray-400 text-3xl font-bold">
              {imageFallback}
            </div>
          )
        )}

        {heading && (
          <h2
            className={`font-extrabold mb-4 ${size === 'large' ? 'text-4xl md:text-5xl' : 'text-3xl'} ${
              dark ? 'text-white' : 'text-[#161E2A]'
            }`}
          >
            {heading}
          </h2>
        )}

        <Prose
          text={body}
          className={`space-y-5 ${boxed ? 'bg-gray-50 rounded-2xl p-8 md:p-10 text-left' : ''}`}
          paragraphClassName={`text-lg ${dark ? 'text-gray-200' : 'text-gray-700'}`}
        />
      </div>
    </Section>
  );
}

function ImageText({ content }) {
  const {
    heading,
    body,
    image,
    imagePosition = 'left',
    ctaLabel,
    ctaHref,
    background = 'white',
  } = content;

  const dark = isDark(background);

  return (
    <Section background={background} className="py-16 md:py-20">
      <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-10 md:gap-14 items-center">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={heading ?? ''}
            className={`w-full rounded-2xl object-cover aspect-[4/3] ${
              imagePosition === 'right' ? 'md:order-2' : ''
            }`}
          />
        )}
        <div>
          <SectionHeading dark={dark} className="mb-5">
            {heading}
          </SectionHeading>
          <Prose
            text={body}
            className="space-y-4 mb-7"
            paragraphClassName={`text-lg ${dark ? 'text-gray-200' : 'text-gray-600'}`}
          />
          <Button href={ctaHref}>{ctaLabel}</Button>
        </div>
      </div>
    </Section>
  );
}

function Cards({ content }) {
  const {
    heading,
    columns = 3,
    cardStyle = 'white',
    background = 'light',
    cards = [],
  } = content;

  if (!cards.length) return null;

  const cardClasses = {
    white: 'bg-white text-[#161E2A]',
    navy: 'bg-[#100566] text-white',
    light: 'bg-gray-100 text-[#161E2A]',
  }[cardStyle];

  const bodyClasses = cardStyle === 'navy' ? 'text-blue-100' : 'text-gray-600';

  return (
    <Section background={background} className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHeading dark={isDark(background)} className="text-center mb-12">
          {heading}
        </SectionHeading>

        <div className={`grid grid-cols-1 gap-8 ${gridColumns[columns] ?? gridColumns[3]}`}>
          {cards.map((card, i) => {
            const inner = (
              <div className="rounded-2xl overflow-hidden shadow-md h-full flex flex-col">
                {card.image && (
                  <div className="relative h-52 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.image}
                      alt={card.title ?? ''}
                      className="w-full h-full object-cover"
                    />
                    {card.eyebrow && (
                      <p className="absolute bottom-0 left-0 p-5 text-5xl font-black text-white/30 leading-none">
                        {card.eyebrow}
                      </p>
                    )}
                  </div>
                )}
                <div className={`${cardClasses} p-6 flex-1`}>
                  {card.eyebrow && !card.image && (
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2">
                      {card.eyebrow}
                    </p>
                  )}
                  {card.title && <h3 className="text-xl font-bold mb-3">{card.title}</h3>}
                  <Prose
                    text={card.body}
                    className="space-y-3"
                    paragraphClassName={`text-sm ${bodyClasses}`}
                  />
                </div>
              </div>
            );

            return card.href ? (
              <Link key={i} href={card.href} className="block hover:opacity-95 transition-opacity">
                {inner}
              </Link>
            ) : (
              <div key={i}>{inner}</div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function Gallery({ content }) {
  const { heading, columns = 3, background = 'white', images = [] } = content;
  if (!images.length) return null;

  return (
    <Section background={background} className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <SectionHeading dark={isDark(background)} className="text-center mb-12">
          {heading}
        </SectionHeading>

        <div className={`grid grid-cols-1 gap-6 ${gridColumns[columns] ?? gridColumns[3]}`}>
          {images.map((img, i) => (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt ?? ''}
                className="w-full aspect-[4/3] object-cover rounded-xl"
              />
              {img.caption && (
                <figcaption className="text-sm text-gray-500 mt-2">{img.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}

function ImageBanner({ content }) {
  const { image, alt = '', height = 'medium' } = content;
  if (!image) return null;

  const heightClass = { small: 'h-40', medium: 'h-64', large: 'h-96' }[height] ?? 'h-64';

  return (
    <div className={`w-full ${heightClass} overflow-hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}

function VideoEmbed({ content }) {
  const { heading, url, caption, title, background = 'white' } = content;
  const embedUrl = toEmbedUrl(url);
  if (!embedUrl) return null;

  return (
    <Section background={background} className="py-20">
      <div className="max-w-4xl mx-auto px-4">
        <SectionHeading dark={isDark(background)} className="text-center mb-10">
          {heading}
        </SectionHeading>

        <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-lg bg-gray-100">
          <iframe
            src={embedUrl}
            title={title || heading || 'Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="w-full h-full"
          />
        </div>

        {caption && <p className="text-sm text-gray-500 text-center mt-4">{caption}</p>}
      </div>
    </Section>
  );
}

function Cta({ content }) {
  const {
    heading,
    body,
    ctaLabel,
    ctaHref,
    secondaryCtaLabel,
    secondaryCtaHref,
    align = 'center',
    background = 'white',
  } = content;

  const dark = isDark(background);

  return (
    <Section background={background} className="py-20">
      <div className={`max-w-3xl mx-auto px-4 ${align === 'left' ? 'text-left' : 'text-center'}`}>
        <SectionHeading dark={dark} className="mb-3">
          {heading}
        </SectionHeading>
        <Prose
          text={body}
          className="space-y-3 mb-8"
          paragraphClassName={`text-lg ${dark ? 'text-gray-200' : 'text-gray-500'}`}
        />
        <div
          className={`flex flex-col sm:flex-row gap-4 ${
            align === 'left' ? 'justify-start' : 'justify-center'
          }`}
        >
          <Button href={ctaHref} variant={dark ? 'light' : 'primary'}>
            {ctaLabel}
          </Button>
          <Button href={secondaryCtaHref} variant="outline">
            {secondaryCtaLabel}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function Faq({ content }) {
  const { heading, background = 'white', items = [] } = content;
  if (!items.length) return null;

  return (
    <Section background={background} className="py-20">
      <div className="max-w-3xl mx-auto px-4">
        <SectionHeading dark={isDark(background)} className="text-center mb-10">
          {heading}
        </SectionHeading>

        <div className="space-y-4">
          {items.map((item, i) => (
            <details key={i} className="group bg-gray-50 rounded-xl p-5">
              <summary className="font-semibold cursor-pointer list-none flex justify-between items-center text-[#161E2A]">
                {item.question}
                <span className="text-[#f53100] group-open:rotate-45 transition-transform text-xl leading-none">
                  +
                </span>
              </summary>
              <Prose
                text={item.answer}
                className="space-y-3 mt-3"
                paragraphClassName="text-gray-600"
              />
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

function LinkCards({ content }) {
  const { heading, columns = 4, background = 'white', cards = [] } = content;
  if (!cards.length) return null;

  return (
    <Section background={background} className="py-16">
      <div className="max-w-4xl mx-auto px-4">
        <SectionHeading dark={isDark(background)} className="text-center mb-10">
          {heading}
        </SectionHeading>

        <div className={`grid grid-cols-2 gap-4 ${gridColumns[columns] ?? gridColumns[4]}`}>
          {cards.map((card, i) => {
            const external = /^https?:\/\//.test(card.href ?? '');
            const inner = (
              <>
                <p className="font-semibold text-sm text-[#161E2A] group-hover:text-white transition-colors">
                  {card.title}
                </p>
                {card.subtitle && (
                  <p className="text-xs text-gray-400 mt-1 group-hover:text-blue-200 transition-colors">
                    {card.subtitle}
                  </p>
                )}
              </>
            );
            const className =
              'block bg-gray-50 rounded-xl p-5 hover:bg-[#100566] transition-colors group text-center';

            return external ? (
              <a
                key={i}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {inner}
              </a>
            ) : (
              <Link key={i} href={card.href || '#'} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function Spacer({ content }) {
  const { size = 'medium', background = 'white' } = content;
  const heightClass = { small: 'h-8', medium: 'h-16', large: 'h-28' }[size] ?? 'h-16';
  return <Section background={background} className={heightClass} />;
}

// ─── Data-driven blocks ──────────────────────────────────────────────────────

async function CourseGrid({ content }) {
  const { heading, viewAllLabel, limit = 3, background = 'light' } = content;

  const courses = await fetchCourses();
  if (!courses.length) return null;

  const dark = isDark(background);

  return (
    <Section background={background} className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-end justify-between mb-10">
          <SectionHeading dark={dark}>{heading}</SectionHeading>
          {viewAllLabel && (
            <Link
              href="/courses"
              className={`text-sm font-semibold hover:underline hidden sm:block ${
                dark ? 'text-blue-200' : 'text-[#100566]'
              }`}
            >
              {viewAllLabel} →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.slice(0, Number(limit) || 3).map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.slug}`}
              className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100"
            >
              {course.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="w-full aspect-video object-cover"
                />
              ) : (
                <div className="w-full aspect-video bg-[#100566]/10 flex items-center justify-center text-[#100566]/30 text-5xl">
                  ▶
                </div>
              )}
              <div className="p-5">
                <h3 className="font-semibold text-[#161E2A] group-hover:text-[#f53100] transition-colors">
                  {course.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {course.shortDescription || course.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-[#100566]">
                    ${Number(course.price).toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {course.videoCount} {course.videoCount === 1 ? 'video' : 'videos'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Section>
  );
}

async function Pricing({ content }) {
  const {
    heading,
    subheading,
    ctaLabel = 'Get Started',
    background = 'navy',
    emptyCtaLabel = 'Get Started Today',
    emptyCtaHref = '/register',
  } = content;

  const tiers = await fetchTiers();
  const dark = isDark(background);

  return (
    <Section background={background} className="py-20">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <SectionHeading dark={dark} className="mb-3">
          {heading}
        </SectionHeading>
        {subheading && (
          <p className={`text-lg mb-10 ${dark ? 'text-blue-200' : 'text-gray-500'}`}>
            {subheading}
          </p>
        )}

        {tiers.length ? (
          <div
            className={`grid gap-6 ${
              tiers.length === 1 ? 'max-w-sm mx-auto' : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            {tiers.map((tier, i) => {
              const highlighted = tiers.length > 1 && i === 1;
              return (
                <div
                  key={tier.id}
                  className={`rounded-2xl p-8 text-left ${
                    highlighted ? 'bg-[#f53100]' : 'bg-white'
                  }`}
                >
                  <h3
                    className={`text-xl font-bold mb-2 ${
                      highlighted ? 'text-white' : 'text-[#161E2A]'
                    }`}
                  >
                    {tier.name}
                  </h3>

                  {tier.priceMonthly != null && (
                    <p
                      className={`text-3xl font-extrabold mb-3 ${
                        highlighted ? 'text-white' : 'text-[#100566]'
                      }`}
                    >
                      ${Number(tier.priceMonthly).toFixed(2)}
                      <span className="text-sm font-medium opacity-70">/month</span>
                    </p>
                  )}

                  <p
                    className={`text-sm mb-6 leading-relaxed ${
                      highlighted ? 'text-white/80' : 'text-gray-500'
                    }`}
                  >
                    {tier.description}
                  </p>

                  {Array.isArray(tier.features) && tier.features.length > 0 && (
                    <ul className="space-y-2 mb-7">
                      {tier.features.map((feature, fi) => (
                        <li
                          key={fi}
                          className={`text-sm flex gap-2 ${
                            highlighted ? 'text-white/90' : 'text-gray-600'
                          }`}
                        >
                          <span className={highlighted ? 'text-white' : 'text-[#f53100]'}>✓</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href="/billing"
                    className={`block w-full text-center py-3 rounded-xl font-bold transition-colors ${
                      highlighted
                        ? 'bg-white text-[#f53100] hover:bg-gray-100'
                        : 'bg-[#f53100] text-white hover:bg-[#d42a00]'
                    }`}
                  >
                    {ctaLabel}
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <Button href={emptyCtaHref}>{emptyCtaLabel}</Button>
        )}
      </div>
    </Section>
  );
}

async function BlogGrid({ content }) {
  const { heading, viewAllLabel, limit = 3, background = 'white' } = content;

  const { posts } = await fetchPosts({ limit: Number(limit) || 3 });
  if (!posts.length) return null;

  const dark = isDark(background);

  return (
    <Section background={background} className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-end justify-between mb-10">
          <SectionHeading dark={dark}>{heading}</SectionHeading>
          {viewAllLabel && (
            <Link
              href="/blog"
              className={`text-sm font-semibold hover:underline hidden sm:block ${
                dark ? 'text-blue-200' : 'text-[#100566]'
              }`}
            >
              {viewAllLabel} →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group">
              {post.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="w-full aspect-video object-cover rounded-xl mb-3"
                />
              ) : (
                <div className="w-full aspect-video bg-gray-100 rounded-xl mb-3" />
              )}
              {post.tags?.length > 0 && (
                <p className="text-xs text-[#f53100] font-semibold mb-1">{post.tags[0]}</p>
              )}
              <h3 className="font-semibold text-sm leading-snug text-[#161E2A] group-hover:text-[#f53100] transition-colors">
                {post.title}
              </h3>
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const RENDERERS = {
  hero: Hero,
  richText: RichText,
  imageText: ImageText,
  cards: Cards,
  gallery: Gallery,
  imageBanner: ImageBanner,
  videoEmbed: VideoEmbed,
  cta: Cta,
  faq: Faq,
  linkCards: LinkCards,
  spacer: Spacer,
  courseGrid: CourseGrid,
  pricing: Pricing,
  blogGrid: BlogGrid,
};

export function Block({ block }) {
  const Component = RENDERERS[block.type];

  // An unknown type means the database has a block this build doesn't know
  // about yet. Skip it rather than crashing the page.
  if (!Component) return null;

  return <Component content={block.content ?? {}} />;
}

export default function BlockRenderer({ blocks = [] }) {
  return (
    <>
      {blocks.map((block) => (
        <Block key={block.id} block={block} />
      ))}
    </>
  );
}
