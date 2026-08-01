-- ============================================================================
--  Seed data — run AFTER 0001_init.sql
--
--  Ports the previously hard-coded homepage / about / contact pages into the
--  CMS so the admin can edit every word and image without touching code.
--  Safe to re-run: pages are inserted on-conflict-do-nothing and blocks are
--  only added to a page that has none.
--
--  ⚠ FIRST THING TO DO: put the site owner's email in `admin_emails` below.
--     Anyone in that list is promoted to admin automatically when they sign up.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
--  Global settings
-- ────────────────────────────────────────────────────────────────────────────

insert into public.site_settings (key, value) values
  ('admin_emails', $json$[]$json$::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('brand', $json${
    "siteName": "Pestor's Pointers",
    "tagline": "Get unstuck in life.",
    "logoUrl": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/ed08b2a-a3e0-3612-d74e-125be7a47_0781e02a-1437-42e4-9456-8938569f0c77.png",
    "footerLogoUrl": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/fa8aa-a07a-fee1-1427-0838b76575_0781e02a-1437-42e4-9456-8938569f0c77.png",
    "contactEmail": "jeremypestor@gmail.com",
    "accentColor": "#f53100",
    "navyColor": "#100566",
    "darkColor": "#161E2A"
  }$json$::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('nav', $json${
    "links": [
      { "label": "Home",     "href": "/" },
      { "label": "Courses",  "href": "/courses" },
      { "label": "Blog",     "href": "/blog" },
      { "label": "About",    "href": "/about" },
      { "label": "Contact",  "href": "/contact" }
    ]
  }$json$::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('footer', $json${
    "tagline": "Helping lost and hurting people find confidence, clarity, hope, strength, vision, direction, awareness, and lasting fulfillment.",
    "links": [
      { "label": "Courses",             "href": "/courses" },
      { "label": "Blog",                "href": "/blog" },
      { "label": "About Jeremy",        "href": "/about" },
      { "label": "Contact Us",          "href": "/contact" },
      { "label": "Become an Affiliate", "href": "/contact" }
    ],
    "socials": [
      { "label": "Facebook",  "handle": "@Jpestor",          "href": "https://www.facebook.com/Jpestor?mibextid=LQQJ4d" },
      { "label": "Instagram", "handle": "@pestorspointers",   "href": "https://www.instagram.com/pestorspointers/" },
      { "label": "YouTube",   "handle": "@PestorsPointers",   "href": "https://youtube.com/@PestorsPointers" },
      { "label": "TikTok",    "handle": "@pestorspointers",   "href": "https://www.tiktok.com/@pestorspointers?_t=8fseGXGZoJ4&_r=1" }
    ],
    "legalLinks": [
      { "label": "Terms & Conditions", "href": "/terms" }
    ],
    "copyright": "Pestor's Pointers. All rights reserved."
  }$json$::jsonb)
on conflict (key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
--  Pages
-- ────────────────────────────────────────────────────────────────────────────

insert into public.pages (slug, title, meta_title, meta_description, is_system, is_published) values
  ('home', 'Home', 'GET UNSTUCK IN LIFE!',
   'I can help you find your purpose, place in this world & true fulfillment! The 7-Stage, 21-Step Program & Guide.',
   true, true),
  ('about', 'About', 'About Jeremy',
   'Meet Jeremy Pestor, Founder of Pestor''s Pointers & S.i.T.i.N.G Outreach — Standing. in. the. Increasingly. Neglected. Gap.',
   true, true),
  ('contact', 'Contact', 'Contact',
   'Get in touch with Jeremy Pestor. You''ve got questions. We''ve got answers.',
   true, true)
on conflict (slug) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
--  Homepage blocks
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "large",
      "heading": "GET UNSTUCK IN LIFE!",
      "subheading": "The 7-Stage, 21-Step Program & Guide",
      "bodyHeading": "Feel Lost? Stuck somewhere on your journey?",
      "body": "I can help you find your purpose, place in this world & true fulfillment!\n\nLet's get unstuck! Step into the life you were destined to live.",
      "backgroundImage": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/4e2af3-c6fb-740e-0163-dc383a772c74_looking-at-the-compass-to-figure-out-right-direction-foggy-valley-and-mountains-in-bac-SBI-327990886.png",
      "overlay": "navy",
      "overlayOpacity": 75,
      "align": "center",
      "ctaLabel": "Explore the courses",
      "ctaHref": "/courses"
    }$json$::jsonb),

    ('cards', 1, $json${
      "heading": "What you'll learn on your 60 day journey...",
      "background": "light",
      "columns": 3,
      "cardStyle": "navy",
      "cards": [
        {
          "eyebrow": "01",
          "title": "Your first steps",
          "body": "Finding a connection, roadmap, & 'Big Brother' who can help guide & point you in the right direction by giving you some hope, while discovering where you're at in your life, what you're feeling inside, what's missing, & what you desire to accomplish.",
          "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/f8cff26-3541-bf8e-135-1c8cf3fdc1b1_740fc10e-f7ae-4189-bcc5-d9cc0c97228a.jpg"
        },
        {
          "eyebrow": "02",
          "title": "Growing stronger",
          "body": "Since you are the 'common denominator' in all of your relationships, let's unpack the 'why' beneath the surface as we learn to set healthy boundaries to improve your 'circle of influence'...",
          "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/f8e8e8-74b-845-865e-64d43ee1f24_2b3e726-67a-228-baf4-37ec4ccb5_pexels-andrea-piacquadio-3760137_1_1_.png"
        },
        {
          "eyebrow": "03",
          "title": "Next level destiny",
          "body": "Wanting more for your life & choosing to move forward past your fear as you discover your individual purpose & find satisfaction & eternal fulfillment, while becoming a 'High Value, 1% Person of Excellence!'",
          "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/c3cc15-8eba-365d-a33b-3c6bdc0883c0_2b3e726-67a-228-baf4-37ec4ccb5_pexels-andrea-piacquadio-3760137_1_2_.png"
        }
      ]
    }$json$::jsonb),

    ('hero', 2, $json${
      "size": "medium",
      "heading": "Feel Like Something Is Missing in Your Life?",
      "body": "Maybe you feel emotionally as if you're drowning in the ocean & just want to get your head above water so you can start making some better progress in your individual life?\n\nDo you ever feel emotionally trapped inside a cage & you just want to break free from these invisible chains that keep you down & that keep the REAL YOU from coming out?",
      "backgroundImage": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/e386514-0a1-c3c7-57-eccf155ab8e_tourist-in-hoodie-in-front-of-rural-landscape-with-mountains-on-the-way-of-the-paul-va-SBI-327903316_1_.jpg",
      "overlay": "dark",
      "overlayOpacity": 70,
      "align": "center",
      "ctaLabel": "Explore More",
      "ctaHref": "/courses"
    }$json$::jsonb),

    ('hero', 3, $json${
      "size": "medium",
      "heading": "I can help guide you (male or female) as your 'Big Bro' as you face life's challenges head on!",
      "body": "Start today with my 7-stage, 21-step program guide to help navigate successfully through life...",
      "backgroundImage": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/8bcee53-1112-c2-12-c7df16c8a16a_banca-boat-at-las-cabanas-beach-with-stunning-pinagbuyutan-island-in-background-breath-SBI-342307242_1_.jpg",
      "overlay": "navy",
      "overlayOpacity": 75,
      "align": "center"
    }$json$::jsonb),

    ('videoEmbed', 4, $json${
      "url": "https://fast.wistia.net/embed/iframe/2am1ihye3z?videoFoam=true",
      "title": "Pestor's Pointers Introduction",
      "background": "white"
    }$json$::jsonb),

    ('courseGrid', 5, $json${
      "heading": "Course Offerings",
      "viewAllLabel": "View all",
      "limit": 3,
      "background": "light"
    }$json$::jsonb),

    ('pricing', 6, $json${
      "heading": "Join Our Free Trial",
      "subheading": "Get started today before this once in a lifetime opportunity expires.",
      "background": "navy",
      "ctaLabel": "Get Started",
      "emptyCtaLabel": "Get Started Today",
      "emptyCtaHref": "/register"
    }$json$::jsonb),

    ('blogGrid', 7, $json${
      "heading": "Articles & Insights",
      "viewAllLabel": "View all",
      "limit": 3,
      "background": "white"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'home'
  and not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);

-- ────────────────────────────────────────────────────────────────────────────
--  About page blocks
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('hero', 0, $json${
      "size": "small",
      "heading": "Hi! … I'm Jeremy Pestor",
      "body": "Founder of 'Pestor's Pointers' & S.i.T.i.N.G Outreach, which stands for \"Standing. in. the. Increasingly. Neglected. Gap.\"",
      "overlay": "navy",
      "overlayOpacity": 100,
      "align": "center"
    }$json$::jsonb),

    ('richText', 1, $json${
      "background": "white",
      "align": "left",
      "image": "",
      "imageStyle": "avatar",
      "imageFallback": "JP",
      "body": "Lost & hurting people I help guide along life's complicated journey by providing a roadmap to help those who have been abandoned by an absent male figure & who feel hopeless & confused, to find the missing pieces to receive confidence, clarity, hope, strength, vision, direction, awareness, & lasting fulfillment in their life as they discover the 3 key ingredients that make up their own, UNIQUE PURPOSE!\n\nRegardless of your view of God, religion, church, or even 'religious people,' as long as we can agree that there is a Higher Power, an Infinite Designer, a Loving Creator, then this program is for YOU!\n\nI come from a non-judgmental & loving 'big brother' perspective to both men & women alike, & I have found in all of my life experiences so far as a single man in my early 40s, that sometimes we just need a guide who's been where we are, who understands us, has felt our pain, & can point us in the right direction to navigate life's complicated journey to find personal FREEDOM.\n\nI start with the relationship people have with themselves & how that plays out in all the other areas of our life, because I've been there & have struggled throughout my lifetime as well, so from day #1, I meet you right where you're at in order to find the REAL YOU, the person who you desire to be, & who you were ALWAYS meant to be!\n\nI can guide you to become the strongest version of you at your core center so your true inner HERO can arise & BREAK FREE from your past and do AMAZING things in your lifetime, because when you become the strongest-centered version of yourself, your entire life, existence, & world, including all of your relationships will improve, whether you're single or currently in a dating relationship!\n\nI look forward to getting to know and coach you personally with this program. Your journey starts TODAY!"
    }$json$::jsonb),

    ('cta', 2, $json${
      "heading": "Join Our Free Trial",
      "body": "Get started today before this once in a lifetime opportunity expires.",
      "background": "white",
      "align": "center",
      "ctaLabel": "Join Our Free Trial",
      "ctaHref": "/billing",
      "secondaryCtaLabel": "Explore the Courses",
      "secondaryCtaHref": "/courses"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'about'
  and not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);

-- ────────────────────────────────────────────────────────────────────────────
--  Contact page blocks
-- ────────────────────────────────────────────────────────────────────────────

insert into public.page_blocks (page_id, type, position, content)
select p.id, b.type, b.position, b.content
from public.pages p,
  (values
    ('imageBanner', 0, $json${
      "image": "https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155262639/settings_images/7cb311d-b346-85bc-700b-ac7826a04eee_1681a9cd-010f-490b-8486-e71534a01eea.jpg",
      "alt": "Contact",
      "height": "medium"
    }$json$::jsonb),

    ('richText', 1, $json${
      "heading": "LET'S CONNECT",
      "body": "You've got questions. We've got answers.",
      "background": "white",
      "align": "center",
      "size": "large"
    }$json$::jsonb),

    ('richText', 2, $json${
      "background": "white",
      "align": "left",
      "boxed": true,
      "body": "Are you looking for a side gig to earn some easy money by becoming an affiliate who refers new clients?\n\nIf so, we're hiring!!\n\nDo you need to book a call with my team or have a special circumstance that needs explaining?\n\nHey, you have my attention!\n\nEmail me at jeremypestor@gmail.com and I'll get back to you shortly!\n\n— Jeremy Pestor"
    }$json$::jsonb),

    ('linkCards', 3, $json${
      "background": "white",
      "columns": 4,
      "cards": [
        { "title": "Facebook",  "subtitle": "@Jpestor",        "href": "https://www.facebook.com/Jpestor?mibextid=LQQJ4d" },
        { "title": "Instagram", "subtitle": "@pestorspointers", "href": "https://www.instagram.com/pestorspointers/" },
        { "title": "YouTube",   "subtitle": "@PestorsPointers", "href": "https://www.youtube.com/@PestorsPointers" },
        { "title": "TikTok",    "subtitle": "@pestorspointers", "href": "https://www.tiktok.com/@pestorspointers" }
      ]
    }$json$::jsonb),

    ('cta', 4, $json${
      "heading": "Join Our Free Trial",
      "body": "Get started today before this once in a lifetime opportunity expires.",
      "background": "white",
      "align": "center",
      "ctaLabel": "Get Started Today",
      "ctaHref": "/billing"
    }$json$::jsonb)
  ) as b(type, position, content)
where p.slug = 'contact'
  and not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);
