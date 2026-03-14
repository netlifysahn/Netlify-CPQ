export const sanitizeIntegerInput = (raw) => String(raw ?? '').replace(/[^\d]/g, '');

export const parsePositiveIntegerInput = (raw, fallback = 1, min = 1) => {
  const sanitized = sanitizeIntegerInput(raw);
  if (!sanitized) return fallback;
  const parsed = parseInt(sanitized, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
};

export const formatIntegerWithCommas = (value, fallback = 0) => {
  const parsed = parsePositiveIntegerInput(value, fallback, 0);
  return parsed.toLocaleString('en-US');
};

export const formatIntegerForEdit = (value, fallback = 1, min = 1) => {
  const parsed = parsePositiveIntegerInput(value, fallback, min);
  return String(parsed);
};
