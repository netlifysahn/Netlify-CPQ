import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { isRichTextEmpty, toRichTextHtml } from '../utils/richText';

const genSectionId = () => `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const AUTOSAVE_DEBOUNCE_MS = 450;
const normalizeSections = (settings) =>
  (settings?.terms?.sections || []).map((s) => ({ ...s, body: toRichTextHtml(s?.body || '') }));
const serializeSettingsDraft = (sections, orderFormHeaderText) =>
  JSON.stringify({ sections, orderFormHeaderText });

export default function Settings({ settings, onSave, saveError = '' }) {
  const [sections, setSections] = useState(() => normalizeSections(settings));
  const [orderFormHeaderText, setOrderFormHeaderText] = useState(() => toRichTextHtml(settings?.orderFormHeaderText || ''));
  const [draggedSectionId, setDraggedSectionId] = useState(null);
  const [dragOverSectionId, setDragOverSectionId] = useState(null);
  const [dragArmedIndex, setDragArmedIndex] = useState(null);
  const draggedIndexRef = useRef(null);
  const dragOverlayRef = useRef(null);
  const dragGhostRef = useRef(null);
  const dragOverlayOffsetYRef = useRef(0);
  const autosaveTimerRef = useRef(null);
  const sectionsRef = useRef(sections);
  const orderFormHeaderTextRef = useRef(orderFormHeaderText);
  const isFirstRenderRef = useRef(true);
  const onSaveRef = useRef(onSave);
  const settingsRef = useRef(settings);
  const lastSavedSnapshotRef = useRef(serializeSettingsDraft(sections, orderFormHeaderText));

  useEffect(() => {
    onSaveRef.current = onSave;
    settingsRef.current = settings;
  }, [onSave, settings]);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    orderFormHeaderTextRef.current = orderFormHeaderText;
  }, [orderFormHeaderText]);

  useEffect(() => {
    const nextSections = normalizeSections(settings);
    const nextOrderFormHeaderText = toRichTextHtml(settings?.orderFormHeaderText || '');
    const nextSnapshot = serializeSettingsDraft(nextSections, nextOrderFormHeaderText);
    const currentSnapshot = serializeSettingsDraft(sectionsRef.current, orderFormHeaderTextRef.current);
    if (nextSnapshot !== currentSnapshot) {
      setSections(nextSections);
      setOrderFormHeaderText(nextOrderFormHeaderText);
      sectionsRef.current = nextSections;
      orderFormHeaderTextRef.current = nextOrderFormHeaderText;
    }
    lastSavedSnapshotRef.current = nextSnapshot;
  }, [settings]);

  const persistSettingsDraft = useCallback((nextSections, nextOrderFormHeaderText) => {
    const nextSnapshot = serializeSettingsDraft(nextSections, nextOrderFormHeaderText);
    if (nextSnapshot === lastSavedSnapshotRef.current) return;
    const latestSettings = settingsRef.current;
    if (typeof onSaveRef.current !== 'function') return;
    onSaveRef.current({
      ...latestSettings,
      orderFormHeaderText: nextOrderFormHeaderText,
      terms: { ...latestSettings?.terms, sections: nextSections },
    });
    lastSavedSnapshotRef.current = nextSnapshot;
  }, []);

  const flushAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    persistSettingsDraft(sectionsRef.current, orderFormHeaderTextRef.current);
  }, [persistSettingsDraft]);

  const queueAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      persistSettingsDraft(sectionsRef.current, orderFormHeaderTextRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persistSettingsDraft]);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    queueAutosave();
  }, [sections, orderFormHeaderText, queueAutosave]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    persistSettingsDraft(sectionsRef.current, orderFormHeaderTextRef.current);
  }, [persistSettingsDraft]);

  const update = (index, field, value) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const quillModules = useMemo(
    () => ({
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'bullet' }, { list: 'ordered' }],
        [{ indent: '-1' }, { indent: '+1' }],
        ['link'],
      ],
    }),
    [],
  );

  const quillFormats = useMemo(
    () => ['bold', 'italic', 'underline', 'list', 'bullet', 'indent', 'link'],
    [],
  );

  const remove = (index) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const moveSection = (list, fromIndex, toIndex) => {
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const addSection = () => {
    setSections((prev) => [...prev, { id: genSectionId(), title: '', body: '' }]);
  };

  const cleanupDragArtifacts = () => {
    if (dragOverlayRef.current) {
      dragOverlayRef.current.remove();
      dragOverlayRef.current = null;
    }
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
    dragOverlayOffsetYRef.current = 0;
  };

  const handleDragStart = (index, event) => {
    if (dragArmedIndex !== index) {
      event.preventDefault();
      return;
    }
    const draggedSection = sections[index];
    if (!draggedSection) return;

    setDraggedSectionId(draggedSection.id);
    setDragOverSectionId(draggedSection.id);
    draggedIndexRef.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedSection.id);

    const dragSource = event.currentTarget;
    const sourceRect = dragSource.getBoundingClientRect();
    const { width, height } = sourceRect;
    const dragOverlay = dragSource.cloneNode(true);
    dragOverlay.style.position = 'fixed';
    dragOverlay.style.top = `${sourceRect.top}px`;
    dragOverlay.style.left = `${sourceRect.left}px`;
    dragOverlay.style.width = `${width}px`;
    dragOverlay.style.height = `${height}px`;
    dragOverlay.style.margin = '0';
    dragOverlay.style.background = '#FFFFFF';
    dragOverlay.style.border = '1px solid #382AA4';
    dragOverlay.style.borderRadius = '8px';
    dragOverlay.style.boxShadow = '0 16px 32px rgba(17,24,39,0.20)';
    dragOverlay.style.opacity = '1';
    dragOverlay.style.pointerEvents = 'none';
    dragOverlay.style.zIndex = '9999';
    document.body.appendChild(dragOverlay);
    dragOverlayRef.current = dragOverlay;
    dragOverlayOffsetYRef.current = event.clientY - sourceRect.top;

    const dragGhost = document.createElement('div');
    dragGhost.style.width = '1px';
    dragGhost.style.height = '1px';
    dragGhost.style.opacity = '0';
    dragGhost.style.pointerEvents = 'none';
    document.body.appendChild(dragGhost);
    dragGhostRef.current = dragGhost;
    event.dataTransfer.setDragImage(dragGhost, 0, 0);
  };

  const handleDrag = (event) => {
    if (!dragOverlayRef.current) return;
    if (event.clientY === 0 && event.clientX === 0) return;
    dragOverlayRef.current.style.top = `${event.clientY - dragOverlayOffsetYRef.current}px`;
  };

  const handleDragOver = (index, sectionId, event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverSectionId !== sectionId) setDragOverSectionId(sectionId);

    const fromIndex = draggedIndexRef.current;
    if (fromIndex == null || fromIndex === index) return;

    setSections((prev) => moveSection(prev, fromIndex, index));
    draggedIndexRef.current = index;
  };

  const handleDrop = (index, event) => {
    event.preventDefault();
    const fallbackSectionId = event.dataTransfer.getData('text/plain');
    const fallbackIndex = sections.findIndex((section) => section.id === fallbackSectionId);
    const fromIndex = draggedIndexRef.current ?? fallbackIndex;
    if (!Number.isNaN(fromIndex) && fromIndex !== index) {
      setSections((prev) => moveSection(prev, fromIndex, index));
    }
    setDraggedSectionId(null);
    setDragOverSectionId(null);
    setDragArmedIndex(null);
    draggedIndexRef.current = null;
    cleanupDragArtifacts();
  };

  const handleDragEnd = () => {
    setDraggedSectionId(null);
    setDragOverSectionId(null);
    setDragArmedIndex(null);
    draggedIndexRef.current = null;
    cleanupDragArtifacts();
  };

  return (
    <>
      <div className="page-header">
        <div className="page-label">Configuration</div>
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        {saveError && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              border: '1px solid rgba(185, 28, 28, 0.25)',
              borderRadius: '8px',
              background: 'rgba(254, 242, 242, 0.8)',
              color: '#B91C1C',
              fontSize: '12px',
              lineHeight: 1.45,
            }}
          >
            {saveError}
          </div>
        )}
        <div className="settings-section-label-row">
          <div className="qd-category-card-title">Order Form Header Text</div>
        </div>
        <div
          className="settings-terms-card"
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="settings-terms-card-body">
            <ReactQuill
              className="settings-terms-card-editor"
              value={orderFormHeaderText}
              onChange={(value) => setOrderFormHeaderText(isRichTextEmpty(value) ? '' : value)}
              onBlur={flushAutosave}
              placeholder="Text shown above the pricing table in generated PDFs..."
              modules={quillModules}
              formats={quillFormats}
            />
          </div>
        </div>
        <div className="settings-section-label-row">
          <div className="qd-category-card-title">Terms & Conditions</div>
        </div>

        {sections.map((section, index) => (
          <div
            key={section.id}
            className="settings-terms-card"
            draggable={dragArmedIndex === index}
            onDragStart={(event) => handleDragStart(index, event)}
            onDrag={(event) => handleDrag(event)}
            onDragEnd={handleDragEnd}
            onDragOver={(event) => handleDragOver(index, section.id, event)}
            onDrop={(event) => handleDrop(index, event)}
            style={{
              background: '#FFFFFF',
              border: draggedSectionId === section.id ? '1px solid #382AA4' : '1px solid rgba(0,0,0,0.07)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '12px',
              boxShadow:
                draggedSectionId === section.id
                  ? '0 12px 28px rgba(17,24,39,0.20)'
                  : dragOverSectionId === section.id
                    ? 'inset 0 0 0 1px rgba(56,42,164,0.45)'
                    : 'none',
              opacity: draggedSectionId === section.id ? 0 : 1,
              position: 'relative',
              zIndex: draggedSectionId === section.id ? 0 : 1,
              display: 'flex',
              flexDirection: 'column',
              transition: 'box-shadow 150ms ease, border-color 150ms ease, opacity 120ms ease',
            }}
          >
            <div className="settings-terms-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                value={section.title}
                onChange={(e) => update(index, 'title', e.target.value)}
                onBlur={flushAutosave}
                placeholder="Section title"
                style={{
                  flex: 1, fontFamily: "'Poppins', sans-serif", fontSize: '14px', fontWeight: 400,
                  border: 'none', borderRadius: 0, padding: 0,
                  outline: 'none', background: 'transparent', appearance: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="settings-card-icon-btn"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px 8px' }}
                title="Delete section"
                aria-label="Delete section"
              >
                <i className="fa-solid fa-trash fa-fw fa-sm" aria-hidden="true" />
              </button>
              <button
                type="button"
                onMouseDown={() => setDragArmedIndex(index)}
                onMouseUp={() => setDragArmedIndex(null)}
                className="settings-card-icon-btn"
                style={{ background: 'none', border: 'none', cursor: 'grab', fontSize: '14px', padding: '4px 6px' }}
                title="Drag to reorder"
                aria-label="Drag to reorder section"
              >
                <i className="fa-solid fa-grip-vertical fa-fw fa-sm" aria-hidden="true" />
              </button>
            </div>
            <div className="settings-terms-card-body">
              <ReactQuill
                className="settings-terms-card-editor"
                value={section.body || ''}
                onChange={(value) => update(index, 'body', isRichTextEmpty(value) ? '' : value)}
                onBlur={flushAutosave}
                placeholder="Section body text..."
                modules={quillModules}
                formats={quillFormats}
              />
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', marginTop: '16px' }}>
          <button
            className="settings-action-btn settings-action-btn-solid"
            onClick={addSection}
            style={{
              border: '1px solid', borderRadius: '6px',
              padding: '8px 16px', cursor: 'pointer', fontFamily: "'Mulish', sans-serif",
            }}
          >Add Section</button>
        </div>
      </div>
    </>
  );
}
