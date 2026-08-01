'use client';

import { useState } from 'react';
import api from '@/lib/api';
import ImageField from './ImageField';

/**
 * Site-wide settings: branding, the top navigation, and the footer. Each card
 * saves independently so a mistake in one doesn't block the others.
 */

function LinkList({ items, onChange, fields, addLabel }) {
  const list = Array.isArray(items) ? items : [];

  const update = (index, patch) =>
    onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {list.map((item, index) => (
        <div key={index} className="flex gap-2 items-center">
          {fields.map((field) => (
            <input
              key={field.name}
              type="text"
              value={item[field.name] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => update(index, { [field.name]: e.target.value })}
              className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
            />
          ))}
          <button
            type="button"
            onClick={() => move(index, -1)}
            disabled={index === 0}
            className="px-2 py-1 text-xs border rounded disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => move(index, 1)}
            disabled={index === list.length - 1}
            className="px-2 py-1 text-xs border rounded disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => onChange(list.filter((_, i) => i !== index))}
            className="px-2 py-1 text-xs border rounded text-red-600"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...list, Object.fromEntries(fields.map((f) => [f.name, '']))])
        }
        className="text-sm px-3 py-1.5 border-2 border-dashed rounded text-gray-500 hover:border-[#f53100] hover:text-[#f53100]"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function Card({ title, description, children, onSave, saving, saved }) {
  return (
    <section className="bg-white border rounded-lg p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-bold text-lg">{title}</h2>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00] disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function SettingsEditor({ initial }) {
  const [brand, setBrand] = useState(initial.brand ?? {});
  const [nav, setNav] = useState(initial.nav ?? { links: [] });
  const [footer, setFooter] = useState(initial.footer ?? { links: [], socials: [], legalLinks: [] });
  const [adminEmails, setAdminEmails] = useState(
    (initial.admin_emails ?? []).join(', ')
  );

  const [savingKey, setSavingKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [error, setError] = useState('');

  const save = async (key, value) => {
    setError('');
    setSavingKey(key);
    try {
      await api.put(`/api/v1/settings/${key}`, { value });
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKey(null);
    }
  };

  const text = (value, onChange, placeholder) => (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border rounded px-3 py-2 text-sm"
    />
  );

  return (
    <div className="space-y-6">
      {error && (
        <p className="p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">{error}</p>
      )}

      <Card
        title="Branding"
        description="Your name, logos and contact email."
        onSave={() => save('brand', brand)}
        saving={savingKey === 'brand'}
        saved={savedKey === 'brand'}
      >
        <div>
          <label className="block text-sm font-medium mb-1">Site name</label>
          {text(brand.siteName, (v) => setBrand({ ...brand, siteName: v }))}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Short tagline (used as the default search description)
          </label>
          {text(brand.tagline, (v) => setBrand({ ...brand, tagline: v }))}
        </div>
        <ImageField
          label="Header logo"
          value={brand.logoUrl}
          onChange={(v) => setBrand({ ...brand, logoUrl: v })}
        />
        <ImageField
          label="Footer logo"
          value={brand.footerLogoUrl}
          onChange={(v) => setBrand({ ...brand, footerLogoUrl: v })}
        />
        <div>
          <label className="block text-sm font-medium mb-1">Contact email</label>
          {text(brand.contactEmail, (v) => setBrand({ ...brand, contactEmail: v }))}
        </div>
      </Card>

      <Card
        title="Top navigation"
        description="The links across the top of every page."
        onSave={() => save('nav', nav)}
        saving={savingKey === 'nav'}
        saved={savedKey === 'nav'}
      >
        <LinkList
          items={nav.links}
          onChange={(links) => setNav({ ...nav, links })}
          fields={[
            { name: 'label', placeholder: 'Link text' },
            { name: 'href', placeholder: '/courses' },
          ]}
          addLabel="Add a link"
        />
      </Card>

      <Card
        title="Footer"
        description="The bottom of every page."
        onSave={() => save('footer', footer)}
        saving={savingKey === 'footer'}
        saved={savedKey === 'footer'}
      >
        <div>
          <label className="block text-sm font-medium mb-1">Footer blurb</label>
          <textarea
            rows={3}
            value={footer.tagline ?? ''}
            onChange={(e) => setFooter({ ...footer, tagline: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Quick links</label>
          <LinkList
            items={footer.links}
            onChange={(links) => setFooter({ ...footer, links })}
            fields={[
              { name: 'label', placeholder: 'Link text' },
              { name: 'href', placeholder: '/about' },
            ]}
            addLabel="Add a link"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Social profiles
            <span className="font-normal text-gray-400">
              {' '}
              — name them Facebook, Instagram, YouTube or TikTok to get the right icon
            </span>
          </label>
          <LinkList
            items={footer.socials}
            onChange={(socials) => setFooter({ ...footer, socials })}
            fields={[
              { name: 'label', placeholder: 'Instagram' },
              { name: 'handle', placeholder: '@yourhandle' },
              { name: 'href', placeholder: 'https://…' },
            ]}
            addLabel="Add a profile"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Legal links</label>
          <LinkList
            items={footer.legalLinks}
            onChange={(legalLinks) => setFooter({ ...footer, legalLinks })}
            fields={[
              { name: 'label', placeholder: 'Terms & Conditions' },
              { name: 'href', placeholder: '/terms' },
            ]}
            addLabel="Add a legal link"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Copyright line</label>
          {text(footer.copyright, (v) => setFooter({ ...footer, copyright: v }))}
        </div>
      </Card>

      <Card
        title="Admin accounts"
        description="Anyone who signs up with one of these email addresses becomes an admin automatically."
        onSave={() =>
          save(
            'admin_emails',
            adminEmails
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean)
          )
        }
        saving={savingKey === 'admin_emails'}
        saved={savedKey === 'admin_emails'}
      >
        <div>
          <label className="block text-sm font-medium mb-1">
            Email addresses, separated by commas
          </label>
          <input
            type="text"
            value={adminEmails}
            onChange={(e) => setAdminEmails(e.target.value)}
            placeholder="jeremy@example.com, helper@example.com"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            This only applies at sign-up. To change an existing account, use Members.
          </p>
        </div>
      </Card>
    </div>
  );
}
