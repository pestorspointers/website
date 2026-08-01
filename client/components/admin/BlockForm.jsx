'use client';

import ImageField from './ImageField';

/**
 * Builds the edit form for a block from its `fields` definition in
 * lib/blocks.js, so adding a new block type never means writing a new form.
 */

function Field({ field, value, onChange }) {
  const common =
    'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f53100]';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value ?? ''}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${common} font-normal leading-relaxed`}
        />
      );

    case 'image':
      return <ImageField value={value} onChange={onChange} />;

    case 'select':
      return (
        <select
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            // Numeric options (column counts) must not come back as strings.
            const option = field.options.find((o) => String(o.value) === raw);
            onChange(option ? option.value : raw);
          }}
          className={common}
        >
          {field.options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          type="number"
          value={value ?? ''}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={common}
        />
      );

    case 'toggle':
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4"
          />
          {field.label}
        </label>
      );

    default:
      return (
        <input
          type="text"
          value={value ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        />
      );
  }
}

/** Repeating groups — cards, gallery images, FAQ entries. */
function ListField({ field, value, onChange }) {
  const items = Array.isArray(value) ? value : [];

  const update = (index, patch) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="border rounded-lg bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {field.itemLabel ?? 'Item'} {index + 1}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="px-2 py-1 text-xs border rounded bg-white disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className="px-2 py-1 text-xs border rounded bg-white disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="px-2 py-1 text-xs border rounded bg-white text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {field.itemFields.map((sub) => (
              <div key={sub.name}>
                {sub.type !== 'toggle' && (
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {sub.label}
                  </label>
                )}
                <Field
                  field={sub}
                  value={item[sub.name]}
                  onChange={(next) => update(index, { [sub.name]: next })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...items, { ...(field.itemDefaults ?? {}) }])}
        className="w-full py-2 border-2 border-dashed rounded-lg text-sm text-gray-500 hover:border-[#f53100] hover:text-[#f53100] transition-colors"
      >
        + Add {field.itemLabel?.toLowerCase() ?? 'item'}
      </button>
    </div>
  );
}

export default function BlockForm({ definition, content, onChange }) {
  const setField = (name, value) => onChange({ ...content, [name]: value });

  return (
    <div className="space-y-5">
      {definition.fields.map((field) => (
        <div key={field.name}>
          {field.type !== 'toggle' && (
            <label className="block text-sm font-medium mb-1">{field.label}</label>
          )}

          {field.type === 'list' ? (
            <ListField
              field={field}
              value={content[field.name]}
              onChange={(value) => setField(field.name, value)}
            />
          ) : (
            <Field
              field={field}
              value={content[field.name]}
              onChange={(value) => setField(field.name, value)}
            />
          )}

          {field.help && <p className="text-xs text-gray-400 mt-1">{field.help}</p>}
        </div>
      ))}
    </div>
  );
}
