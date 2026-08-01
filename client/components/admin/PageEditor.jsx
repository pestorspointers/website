'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { BLOCK_MENU, getBlockDefinition, getBlockLabel, newBlockContent } from '@/lib/blocks';
import BlockForm from './BlockForm';

/**
 * The page builder. Sections live in a list on the left; whichever one is
 * selected gets its form on the right.
 *
 * Reordering, visibility and deletion save the moment you click them.
 * Text edits are held locally until you press Save — or until you click
 * another section, which saves the current one on the way out so nothing is
 * lost by accident.
 */
export default function PageEditor({ page: initialPage, previewHref }) {
  const [page, setPage] = useState(initialPage);
  const [blocks, setBlocks] = useState(initialPage.blocks ?? []);
  const [selectedId, setSelectedId] = useState(initialPage.blocks?.[0]?.id ?? null);
  const [dirtyIds, setDirtyIds] = useState(() => new Set());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const definition = selected ? getBlockDefinition(selected.type) : null;

  const flash = (message) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2500);
  };

  const markDirty = (id, dirty) =>
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });

  // ─── Block actions ────────────────────────────────────────────────────────

  const saveBlock = async (blockId) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    try {
      await api.patch(`/api/v1/pages/blocks/${blockId}`, { content: block.content });
      markDirty(blockId, false);
      flash('Saved');
    } catch (err) {
      setError(err.message);
    }
  };

  const selectBlock = async (blockId) => {
    // Don't let an unsaved edit disappear when they click elsewhere.
    if (selectedId && dirtyIds.has(selectedId)) await saveBlock(selectedId);
    setSelectedId(blockId);
  };

  const addBlock = async (type) => {
    setError('');
    try {
      const { data } = await api.post(`/api/v1/pages/${page.id}/blocks`, {
        type,
        content: newBlockContent(type),
      });
      setBlocks((prev) => [...prev, data]);
      setSelectedId(data.id);
      setAdding(false);
      flash('Section added');
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteBlock = async (blockId) => {
    const label = getBlockLabel(blocks.find((b) => b.id === blockId)?.type);
    if (!confirm(`Delete this "${label}" section? This cannot be undone.`)) return;

    try {
      await api.delete(`/api/v1/pages/blocks/${blockId}`);
      const remaining = blocks.filter((b) => b.id !== blockId);
      setBlocks(remaining);
      markDirty(blockId, false);
      if (selectedId === blockId) setSelectedId(remaining[0]?.id ?? null);
      flash('Section deleted');
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleVisible = async (block) => {
    const isVisible = !block.isVisible;
    setBlocks((prev) =>
      prev.map((b) => (b.id === block.id ? { ...b, isVisible } : b))
    );

    try {
      await api.patch(`/api/v1/pages/blocks/${block.id}`, { isVisible });
      flash(isVisible ? 'Section shown' : 'Section hidden');
    } catch (err) {
      setError(err.message);
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? { ...b, isVisible: block.isVisible } : b))
      );
    }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;

    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    setBlocks(next);

    try {
      await api.put(`/api/v1/pages/${page.id}/blocks/order`, {
        blockIds: next.map((b) => b.id),
      });
      flash('Order saved');
    } catch (err) {
      setError(err.message);
      setBlocks(blocks);
    }
  };

  const updateContent = (content) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === selectedId ? { ...b, content } : b))
    );
    markDirty(selectedId, true);
  };

  // ─── Page settings ────────────────────────────────────────────────────────

  const savePageSettings = async () => {
    try {
      const { data } = await api.patch(`/api/v1/pages/${page.id}`, {
        title: page.title,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        isPublished: page.isPublished,
      });
      setPage((prev) => ({ ...prev, ...data }));
      flash('Page settings saved');
    } catch (err) {
      setError(err.message);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Link href="/admin/pages" className="text-sm text-gray-500 hover:underline">
            ← All pages
          </Link>
          <h1 className="text-2xl font-bold mt-1">{page.title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {status && <span className="text-sm text-green-600">{status}</span>}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="text-sm px-3 py-2 border rounded hover:bg-gray-100"
          >
            Page settings
          </button>
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-3 py-2 border rounded hover:bg-gray-100"
          >
            View page ↗
          </a>
        </div>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {showSettings && (
        <div className="mb-6 bg-white border rounded-lg p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Page name (admin only)</label>
            <input
              type="text"
              value={page.title ?? ''}
              onChange={(e) => setPage({ ...page, title: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Browser tab title (search engines show this)
            </label>
            <input
              type="text"
              value={page.metaTitle ?? ''}
              onChange={(e) => setPage({ ...page, metaTitle: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Search description
            </label>
            <textarea
              rows={2}
              value={page.metaDescription ?? ''}
              onChange={(e) => setPage({ ...page, metaDescription: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(page.isPublished)}
              onChange={(e) => setPage({ ...page, isPublished: e.target.checked })}
              className="w-4 h-4"
            />
            Visible to visitors
          </label>
          <button
            type="button"
            onClick={savePageSettings}
            className="px-4 py-2 bg-[#161E2A] text-white text-sm rounded hover:bg-black"
          >
            Save page settings
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* ── Section list ── */}
        <div className="bg-white border rounded-lg p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-2 mb-2">
            Sections
          </p>

          <div className="space-y-1">
            {blocks.map((block, index) => {
              const def = getBlockDefinition(block.type);
              const isSelected = block.id === selectedId;

              return (
                <div
                  key={block.id}
                  className={`rounded border ${
                    isSelected ? 'border-[#f53100] bg-orange-50' : 'border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectBlock(block.id)}
                    className="w-full text-left px-2 py-2 flex items-center gap-2"
                  >
                    <span className="text-lg leading-none">{def?.icon ?? '▫️'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {def?.label ?? block.type}
                      </span>
                      <span className="block text-xs text-gray-400 truncate">
                        {block.content?.heading || block.content?.title || `Section ${index + 1}`}
                      </span>
                    </span>
                    {dirtyIds.has(block.id) && (
                      <span className="w-2 h-2 rounded-full bg-[#f53100]" title="Unsaved changes" />
                    )}
                    {!block.isVisible && (
                      <span className="text-[10px] text-gray-400 uppercase">hidden</span>
                    )}
                  </button>

                  <div className="flex gap-1 px-2 pb-2">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="px-2 py-0.5 text-xs border rounded bg-white disabled:opacity-30"
                      aria-label="Move section up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === blocks.length - 1}
                      className="px-2 py-0.5 text-xs border rounded bg-white disabled:opacity-30"
                      aria-label="Move section down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleVisible(block)}
                      className="px-2 py-0.5 text-xs border rounded bg-white"
                    >
                      {block.isVisible ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBlock(block.id)}
                      className="px-2 py-0.5 text-xs border rounded bg-white text-red-600 ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            {blocks.length === 0 && (
              <p className="text-sm text-gray-400 px-2 py-6 text-center">
                No sections yet. Add one below.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAdding(!adding)}
            className="w-full mt-3 py-2 border-2 border-dashed rounded-lg text-sm font-medium text-gray-500 hover:border-[#f53100] hover:text-[#f53100] transition-colors"
          >
            + Add a section
          </button>

          {adding && (
            <div className="mt-2 space-y-1 max-h-96 overflow-y-auto">
              {BLOCK_MENU.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addBlock(item.type)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 border"
                >
                  <span className="text-sm font-medium">
                    {item.icon} {item.label}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">{item.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Editor ── */}
        <div className="bg-white border rounded-lg p-6">
          {selected && definition ? (
            <>
              <div className="flex items-start justify-between gap-4 mb-5 pb-4 border-b">
                <div>
                  <h2 className="font-bold text-lg">
                    {definition.icon} {definition.label}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">{definition.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => saveBlock(selected.id)}
                  disabled={!dirtyIds.has(selected.id)}
                  className="shrink-0 px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00] disabled:opacity-40"
                >
                  {dirtyIds.has(selected.id) ? 'Save changes' : 'Saved'}
                </button>
              </div>

              <BlockForm
                definition={definition}
                content={selected.content ?? {}}
                onChange={updateContent}
              />
            </>
          ) : (
            <p className="text-gray-400 text-sm py-16 text-center">
              {blocks.length
                ? 'Pick a section on the left to edit it.'
                : 'Add your first section to start building this page.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
