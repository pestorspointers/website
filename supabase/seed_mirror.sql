-- ============================================================================
--  Mirror seed — makes the default site a faithful copy of pestorspointers.com
--
--  Content, images, colours, navigation and copy were taken from the crawl in
--  tools/kajabi-export/export/. Images are served from client/public/mirror/
--  rather than Kajabi's CDN, which dies with the account.
--
--  Everything here is ordinary CMS content: every word, image, colour and
--  button below can be changed in Admin → Pages without touching code. This
--  only sets the starting point.
--
--  Safe to re-run: settings are upserted, and each page's blocks are rebuilt
--  from scratch so there are no duplicates.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
--  Brand, navigation, footer
-- ────────────────────────────────────────────────────────────────────────────

insert into public.site_settings (key, value) values
  ('brand', $json${
    "siteName": "Pestor's Pointers",
    "tagline": "Feel stuck or confused in life?",
    "logoUrl": "/mirror/logo-header.jpg",
    "footerLogoUrl": "/mirror/logo-footer.jpg",
    "contactEmail": "Jeremy@PestorsPointers.com",
    "accentColor": "#f53100",
    "navyColor": "#100566",
    "darkColor": "#161E2A"
  }$json$::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.site_settings (key, value) values
  ('nav', $json${
    "links": [
      { "label": "Home",            "href": "/" },
      { "label": "Courses",         "href": "/courses" },
      { "label": "Life Stage Quiz", "href": "/quiz" },
      { "label": "Discover More",   "href": "/discover-more" },
      { "label": "About Jeremy",    "href": "/about" },
      { "label": "Contact",         "href": "/contact" },
      { "label": "Stay Connected",  "href": "/stay-connected" }
    ]
  }$json$::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.site_settings (key, value) values
  ('footer', $json${
    "tagline": "Helping people who feel frustrated, lost, or behind in life rebuild themselves, find direction, and move forward.",
    "links": [
      { "label": "Courses",             "href": "/courses" },
      { "label": "Life Stage Quiz",     "href": "/quiz" },
      { "label": "About Jeremy",        "href": "/about" },
      { "label": "Contact Us",          "href": "/contact" },
      { "label": "Become an Affiliate", "href": "/contact" }
    ],
    "socials": [
      { "label": "Facebook",  "handle": "@Jpestor",         "href": "https://www.facebook.com/Jpestor" },
      { "label": "Instagram", "handle": "@pestorspointers", "href": "https://www.instagram.com/pestorspointers/" },
      { "label": "YouTube",   "handle": "@PestorsPointers", "href": "https://youtube.com/@PestorsPointers" },
      { "label": "TikTok",    "handle": "@pestorspointers", "href": "https://www.tiktok.com/@pestorspointers" }
    ],
    "legalLinks": [
      { "label": "Terms & Conditions", "href": "/terms" },
      { "label": "Privacy Policy",     "href": "/privacy" }
    ],
    "copyright": "Pestor's Pointers. All rights reserved."
  }$json$::jsonb)
on conflict (key) do update set value = excluded.value;

-- ────────────────────────────────────────────────────────────────────────────
--  Pages
-- ────────────────────────────────────────────────────────────────────────────

insert into public.pages (slug, title, meta_title, meta_description, is_system, is_published) values
  ('home', 'Home', 'Feel stuck or confused in life? | Pestor''s Pointers',
   'I help people who feel frustrated, lost, or behind in life rebuild themselves, find direction, and move forward. The Get Unstuck System — a 42-day journey.',
   true, true),
  ('about', 'About Jeremy', 'About Jeremy',
   'Meet Jeremy Pestor, founder of Pestor''s Pointers & S.i.T.i.N.G. Outreach — Standing in the Increasingly Neglected Gap.',
   true, true),
  ('contact', 'Contact', 'Contact',
   'You''ve got questions. We''ve got answers. Get in touch with Jeremy Pestor.',
   true, true),
  ('stay-connected', 'Stay Connected', 'Stay Connected',
   'Follow Pestor''s Pointers for daily content, encouragement and updates.',
   false, true),
  ('discover-more', 'Discover More', 'Discover More',
   'Learn more about the Get Unstuck System and how it works.',
   false, true),
  ('quiz', 'Life Stage Quiz', 'Take the FREE Stage of Life Quiz',
   'Find out where you are on your journey and what your next step is.',
   false, true)
on conflict (slug) do update set
  title            = excluded.title,
  meta_title       = excluded.meta_title,
  meta_description = excluded.meta_description,
  is_published     = excluded.is_published;

-- Rebuild blocks from scratch so re-running never duplicates sections.
delete from public.page_blocks
where page_id in (select id from public.pages
                  where slug in ('home','about','contact','stay-connected','discover-more','quiz'));

-- ────────────────────────────────────────────────────────────────────────────
--  Home
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "large",
      "heading": "Feel stuck or confused in life?",
      "subheading": "I help people who feel frustrated, lost, or behind in life rebuild themselves, find direction, & move forward.",
      "bodyHeading": "If you're overwhelmed & tired of overthinking & going in circles ...",
      "body": "This is your next step.",
      "backgroundImage": "/mirror/hero-compass.jpg",
      "overlay": "navy",
      "overlayOpacity": 75,
      "align": "center",
      "ctaLabel": "Take our FREE Stage of Life Quiz",
      "ctaHref": "/quiz"
    }$json$::jsonb),

    ('imageText', 1, $json${
      "heading": "Feel Like Something's Missing in Your Life?",
      "body": "This program is for people like you:\n\n• Tired of drifting, emotionally exhausted or overwhelmed\n• Keep repeating unhealthy cycles\n• Feel disconnected or constantly overthinking\n• Struggle with confidence, direction, or purpose\n• Desire healthier relationships and stronger boundaries\n• Know deep down you were made for more\n\nIf you are teachable, and ready to move forward ...",
      "image": "/mirror/man-with-dog.jpg",
      "imagePosition": "right",
      "background": "light",
      "ctaLabel": "Get Unstuck NOW",
      "ctaHref": "/courses"
    }$json$::jsonb),

    ('cards', 2, $json${
      "heading": "Your Solution: The Get Unstuck System — a 42-day journey to clarity, direction, & action.",
      "background": "white",
      "columns": 3,
      "cardStyle": "navy",
      "cards": [
        {
          "eyebrow": "01",
          "title": "Clarity",
          "body": "Gain insight on where you are, what's holding you back, and what to do next.",
          "image": "/mirror/clarity.jpg"
        },
        {
          "eyebrow": "02",
          "title": "Direction",
          "body": "Identify unhealthy patterns, strengthen your mindset, and build healthier relationships through stronger boundaries.",
          "image": "/mirror/direction.jpg"
        },
        {
          "eyebrow": "03",
          "title": "Action",
          "body": "Move forward with confidence, take action on your goals, and start building a more fulfilling life.",
          "image": "/mirror/action.jpg"
        }
      ]
    }$json$::jsonb),

    ('cta', 3, $json${
      "heading": "Ready to stop overthinking & start moving forward?",
      "body": "The Get Unstuck System is a simple step-by-step program designed to help you gain clarity, direction, & momentum.",
      "background": "navy",
      "align": "center",
      "ctaLabel": "YES! Let's Get Unstuck",
      "ctaHref": "/courses"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'home';

-- ────────────────────────────────────────────────────────────────────────────
--  About Jeremy
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "medium",
      "heading": "Hi! I'm Jeremy",
      "subheading": "Founder of Pestor's Pointers & S.i.T.i.N.G. Outreach — Standing in the Increasingly Neglected Gap",
      "backgroundImage": "/mirror/hiker-mountains.jpg",
      "overlay": "navy",
      "overlayOpacity": 70,
      "align": "center"
    }$json$::jsonb),

    ('richText', 1, $json${
      "body": "My passion is helping people who feel stuck, lost, overwhelmed, or behind in life rebuild themselves, find direction, and move forward again.\n\nA lot of the people I connect with feel emotionally exhausted, disconnected, confused about their purpose, or like they've been carrying the weight of life alone for far too long. Some grew up without strong guidance or positive role models. Others have gone through failure, broken relationships, loneliness, or years of overthinking and drifting through life.\n\nI come from a non-judgmental \"big brother\" perspective because I've struggled through many of those same things myself.\n\nAs a single man in my mid 40s, I've learned that sometimes what people need most isn't another motivational speech — they need someone who understands them, meets them where they're at, and helps guide them forward step-by-step.",
      "image": "/mirror/jeremy-portrait.jpg",
      "imageStyle": "avatar",
      "background": "white",
      "align": "left"
    }$json$::jsonb),

    ('richText', 2, $json${
      "heading": "This program focuses on rebuilding from the inside out",
      "body": "• confidence\n• direction\n• self-worth\n• boundaries\n• discipline\n• relationships\n• purpose\n• emotional & spiritual growth\n\nRegardless of your background, your past, or your views on religion, this program was created to help people reconnect with who they truly are and become stronger to their core.\n\nMy goal is simple: to help people stop drifting through life and finally move forward with hope, clarity, purpose, and direction. I look forward to getting to know you and walking through part of that journey with you.",
      "background": "light",
      "boxed": true,
      "align": "left"
    }$json$::jsonb),

    ('cta', 3, $json${
      "heading": "Ready to take your next step?",
      "body": "Start with the free Stage of Life Quiz and find out where you are on your journey.",
      "background": "navy",
      "align": "center",
      "ctaLabel": "Take the FREE Quiz",
      "ctaHref": "/quiz"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'about';

-- ────────────────────────────────────────────────────────────────────────────
--  Contact
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "medium",
      "heading": "LET'S CONNECT",
      "subheading": "Hey, you have my attention!",
      "backgroundImage": "/mirror/boat-island.jpg",
      "overlay": "navy",
      "overlayOpacity": 70,
      "align": "center"
    }$json$::jsonb),

    ('richText', 1, $json${
      "heading": "You've got questions. We've got answers.",
      "body": "Do you need to book a call with my team or have a special circumstance that needs explaining? Email me at Jeremy@PestorsPointers.com and I'll get back to you shortly!\n\n— Jeremy Pestor",
      "background": "white",
      "align": "center",
      "ctaLabel": "Email Jeremy",
      "ctaHref": "mailto:Jeremy@PestorsPointers.com"
    }$json$::jsonb),

    ('cta', 2, $json${
      "heading": "Looking for a side gig?",
      "body": "Are you looking to earn some easy money by becoming an affiliate who refers new clients? If so, we're hiring!",
      "background": "light",
      "align": "center",
      "ctaLabel": "Become an Affiliate",
      "ctaHref": "mailto:Jeremy@PestorsPointers.com?subject=Affiliate%20enquiry"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'contact';

-- ────────────────────────────────────────────────────────────────────────────
--  Stay Connected
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "medium",
      "heading": "Stay Connected & Keep Moving Forward",
      "subheading": "Helping you get unstuck and move forward with clarity, confidence, and purpose.",
      "backgroundImage": "/mirror/boat-island.jpg",
      "overlay": "navy",
      "overlayOpacity": 72,
      "align": "center"
    }$json$::jsonb),

    ('richText', 1, $json${
      "heading": "Follow along",
      "body": "Follow Pestor's Pointers on Instagram, TikTok, Facebook/Meta, and YouTube for additional daily content, encouragement, and updates.",
      "background": "white",
      "align": "center"
    }$json$::jsonb),

    ('linkCards', 2, $json${
      "heading": "Find us here",
      "background": "light",
      "columns": 4,
      "cards": [
        { "title": "Instagram", "subtitle": "@pestorspointers", "href": "https://www.instagram.com/pestorspointers/" },
        { "title": "TikTok",    "subtitle": "@pestorspointers", "href": "https://www.tiktok.com/@pestorspointers" },
        { "title": "Facebook",  "subtitle": "@Jpestor",         "href": "https://www.facebook.com/Jpestor" },
        { "title": "YouTube",   "subtitle": "@PestorsPointers", "href": "https://youtube.com/@PestorsPointers" }
      ]
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'stay-connected';

-- ────────────────────────────────────────────────────────────────────────────
--  Discover More / Quiz — placeholders carrying the real copy and CTAs, so
--  the navigation never leads anywhere broken.
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "medium",
      "heading": "Discover More",
      "subheading": "How the Get Unstuck System works, and who it's for.",
      "backgroundImage": "/mirror/hiker-mountains.jpg",
      "overlay": "navy",
      "overlayOpacity": 70,
      "align": "center"
    }$json$::jsonb),
    ('cta', 1, $json${
      "heading": "Ready to begin?",
      "body": "Take the free Stage of Life Quiz, or browse the programs.",
      "background": "white",
      "align": "center",
      "ctaLabel": "Browse the courses",
      "ctaHref": "/courses",
      "secondaryCtaLabel": "Take the quiz",
      "secondaryCtaHref": "/quiz"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'discover-more';

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "medium",
      "heading": "Take our FREE Stage of Life Quiz",
      "subheading": "Find out where you are on your journey — and what your next step is.",
      "backgroundImage": "/mirror/hero-compass.jpg",
      "overlay": "navy",
      "overlayOpacity": 75,
      "align": "center",
      "ctaLabel": "Start the quiz",
      "ctaHref": "https://main.dg4qdxf8gznsz.amplifyapp.com/"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'quiz';
