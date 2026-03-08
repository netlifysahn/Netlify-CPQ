import { genId } from './catalog';

export const PRICEBOOK_TABS = [
  { key: 'entries', label: 'Price Book Entries' },
  { key: 'tiered', label: 'Tiered Pricing' },
  { key: 'accounts', label: 'Accounts (future)' },
];

export const emptyPricebook = () => ({
  id: genId(),
  name: '',
  description: '',
  currency: 'USD',
  active: true,
  is_default: false,
  entries: [],
  tiered_pricing: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const getPricebookStatus = (pricebook) => {
  if (!pricebook?.active) return 'Inactive';
  return pricebook?.is_default ? 'Active · Default' : 'Active';
};
