import React, { useEffect, useRef } from 'react';

/**
 * CustomSelect — a single-select dropdown matching the Add Support picklist styling.
 *
 * Props:
 *  - value: currently selected value
 *  - options: array of { value, label } objects
 *  - onChange: (value) => void  — called with the raw value string
 *  - className: optional extra class on the wrapper
 */
export default function CustomSelect({ value, options, onChange, className }) {
  const detailsRef = useRef(null);

  // Click-outside handler
  useEffect(() => {
    const handler = (e) => {
      const el = detailsRef.current;
      if (el && el.open && !el.contains(e.target)) {
        el.open = false;
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : '';

  return (
    <details
      ref={detailsRef}
      className={`custom-select-picker${className ? ` ${className}` : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <summary className="custom-select-trigger">
        <span className="custom-select-trigger-label">{displayLabel}</span>
        <span className="custom-select-trigger-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="custom-select-menu">
        <div className="custom-select-options">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`custom-select-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  if (detailsRef.current) detailsRef.current.open = false;
                }}
              >
                <span className="custom-select-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
