import React, { useState } from 'react';

const genSectionId = () => `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export default function Settings({ settings, onSave }) {
  const [sections, setSections] = useState(() =>
    (settings?.terms?.sections || []).map((s) => ({ ...s }))
  );
  const [dirty, setDirty] = useState(false);

  const update = (index, field, value) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    setDirty(true);
  };

  const remove = (index) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const move = (index, dir) => {
    setSections((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const addSection = () => {
    setSections((prev) => [...prev, { id: genSectionId(), title: '', body: '' }]);
    setDirty(true);
  };

  const handleSave = () => {
    onSave({ ...settings, terms: { ...settings?.terms, sections } });
    setDirty(false);
  };

  return (
    <>
      <div className="page-header">
        <div className="page-label">Configuration</div>
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '20px' }}>
          Terms & Conditions
        </div>

        {sections.map((section, index) => (
          <div key={section.id} style={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                value={section.title}
                onChange={(e) => update(index, 'title', e.target.value)}
                placeholder="Section title"
                style={{
                  flex: 1, fontFamily: "'Poppins', sans-serif", fontSize: '14px', fontWeight: 600,
                  border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px', padding: '8px 12px',
                  outline: 'none', background: '#fff',
                }}
              />
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? '#d1d5db' : '#9ca3af', fontSize: '14px', padding: '4px 6px' }}
                title="Move up"
              >▲</button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === sections.length - 1}
                style={{ background: 'none', border: 'none', cursor: index === sections.length - 1 ? 'default' : 'pointer', color: index === sections.length - 1 ? '#d1d5db' : '#9ca3af', fontSize: '14px', padding: '4px 6px' }}
                title="Move down"
              >▼</button>
              <button
                onClick={() => remove(index)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '13px', padding: '4px 8px' }}
                title="Delete section"
              >Delete</button>
            </div>
            <textarea
              value={section.body}
              onChange={(e) => update(index, 'body', e.target.value)}
              placeholder="Section body text..."
              rows={4}
              style={{
                width: '100%', fontFamily: "'Mulish', sans-serif", fontSize: '13px', lineHeight: '1.6',
                border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px', padding: '10px 12px',
                outline: 'none', resize: 'vertical', background: '#fff', boxSizing: 'border-box',
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.max(e.target.scrollHeight, 80) + 'px';
              }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
          <button
            onClick={addSection}
            style={{
              background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '6px',
              padding: '8px 16px', cursor: 'pointer', fontFamily: "'Mulish', sans-serif",
              fontSize: '13px', fontWeight: 500, color: '#374151',
            }}
          >Add Section</button>
          <button
            onClick={handleSave}
            disabled={!dirty}
            style={{
              background: dirty ? '#00AD9F' : '#d1d5db', border: 'none', borderRadius: '6px',
              padding: '8px 20px', cursor: dirty ? 'pointer' : 'default',
              fontFamily: "'Mulish', sans-serif", fontSize: '13px', fontWeight: 600, color: '#fff',
            }}
          >Save Changes</button>
        </div>
      </div>
    </>
  );
}
