import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles/app.css';
import { PRODUCT_TYPES, TYPE_LABELS, genId, getProductCategory, sortProductsByType } from './data/catalog';
import { genQuoteNumber } from './data/quotes';
import NetlifyLogo from './components/NetlifyLogo';
import ProductTable from './components/ProductTable';
import ProductModal from './components/ProductModal';
import PricebookTable from './components/PricebookTable';
import PricebookModal from './components/PricebookModal';
import PricebookDetail from './components/PricebookDetail';
import QuoteList from './components/QuoteList';
import QuoteModal from './components/QuoteModal';
import QuoteDetail from './components/QuoteDetail';
import Confirm from './components/Confirm';
import Settings from './components/Settings';
import seedProducts from './data/products.json';
import seedQuotes from './data/quotes.json';
import seedPricebooks from './data/pricebooks.json';
import seedSettings from './data/settings.json';

const NAV_ITEMS = [
  { key: 'products', label: 'Products' },
  { key: 'pricebooks', label: 'Price Books' },
  { key: 'scope', label: 'Scope' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'orders', label: 'Orders' },
  { key: 'settings', label: 'Settings' },
];

const COMING_SOON_META = {
  scope: { icon: 'fa-bullseye', title: 'Scope', label: 'Deal Scope', subtitle: 'Define and manage deal scope for quotes' },
  orders: { icon: 'fa-cart-shopping', title: 'Orders', label: 'Order Management', subtitle: 'Track and manage customer orders' },
};

const FALLBACK_SETTINGS = {
  orderFormHeaderText: '',
  terms: {
    sections: [],
  },
};

const normalizeCatalog = (value) => ({
  products: Array.isArray(value?.products) ? value.products : [],
  pricebooks: Array.isArray(value?.pricebooks) ? value.pricebooks : [],
  initialized: value?.initialized !== false,
});

const buildDestructiveCatalogWarning = (details) => {
  const currentProducts = Number(details?.current?.products ?? 0);
  const currentPricebooks = Number(details?.current?.pricebooks ?? 0);
  const incomingProducts = Number(details?.incoming?.products ?? 0);
  const incomingPricebooks = Number(details?.incoming?.pricebooks ?? 0);

  return [
    'Warning: This operation will significantly reduce the catalog size.',
    `Current catalog: ${currentProducts} products / ${currentPricebooks} price books`,
    `Incoming catalog: ${incomingProducts} products / ${incomingPricebooks} price books`,
    '',
    'This may indicate a destructive overwrite.',
    '',
    'Confirm to proceed or cancel.',
  ].join('\n');
};

const normalizeSettings = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...FALLBACK_SETTINGS };
  const sections = Array.isArray(value?.terms?.sections)
    ? value.terms.sections.map((section, index) => ({
        ...(section && typeof section === 'object' ? section : {}),
        id: String(section?.id || `term_${index + 1}`),
        title: typeof section?.title === 'string' ? section.title : '',
        body: typeof section?.body === 'string' ? section.body : '',
      }))
    : [];
  return {
    ...value,
    orderFormHeaderText: typeof value?.orderFormHeaderText === 'string' ? value.orderFormHeaderText : '',
    terms: {
      ...value.terms,
      sections,
    },
  };
};

const GUARDED_DEFAULTS = {
  category: 'platform',
  type: 'platform',
  configuration_method: 'none',
  default_term: 12,
  term_unit: 'month',
  term_behavior: 'included',
  default_entitlements: '{}',
  bundle_pricing: 'header_only',
  print_members: true,
  'default_price.amount': 0,
  'default_price.unit': 'flat',
  'default_price.pricing_method': 'list',
  'config.lock_quantity': false,
  'config.lock_price': false,
  'config.lock_discount': false,
  'config.lock_term': false,
  'config.default_quantity': 1,
  'config.min_quantity': 1,
  'config.max_quantity': 999,
  'config.edit_name': false,
  'config.default_description': '',
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getPath = (obj, path) =>
  path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const setPath = (obj, path, value) => {
  const keys = path.split('.');
  const clone = { ...obj };
  let node = clone;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    node[key] = isPlainObject(node[key]) ? { ...node[key] } : {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
  return clone;
};

const hasDirtyPath = (dirty, path) =>
  dirty.has(path) || [...dirty].some((entry) => entry.startsWith(`${path}.`) || path.startsWith(`${entry}.`));

const readEntryListPriceOverride = (entry) => {
  if (entry?.list_price_override != null) return entry.list_price_override;
  if (entry?.price_override != null) return entry.price_override;
  return null;
};

const normalizePricebookEntry = (entry, pricebookId) => {
  const productId = entry?.product_id ? String(entry.product_id) : '';
  if (!productId) return null;
  const listPriceOverride = readEntryListPriceOverride(entry);
  return {
    ...entry,
    product_id: productId,
    pricebook_id: pricebookId,
    is_active: entry?.is_active !== false,
    list_price_override: listPriceOverride,
    // Keep legacy field for compatibility with older readers.
    price_override: listPriceOverride,
  };
};

const mergeProductForEdit = (existing, incoming, dirtyFields) => {
  const dirty = new Set(Array.isArray(dirtyFields) ? dirtyFields : []);
  let merged = {
    ...existing,
    ...incoming,
    default_price: {
      ...(isPlainObject(existing?.default_price) ? existing.default_price : {}),
      ...(isPlainObject(incoming?.default_price) ? incoming.default_price : {}),
    },
    config: {
      ...(isPlainObject(existing?.config) ? existing.config : {}),
      ...(isPlainObject(incoming?.config) ? incoming.config : {}),
    },
  };

  ['package_components', 'members', 'components'].forEach((field) => {
    const nextValue = incoming?.[field];
    const prevValue = existing?.[field];
    if (
      Array.isArray(nextValue)
      && nextValue.length === 0
      && Array.isArray(prevValue)
      && prevValue.length > 0
      && !hasDirtyPath(dirty, field)
    ) {
      merged = { ...merged, [field]: prevValue };
    }
  });

  Object.entries(GUARDED_DEFAULTS).forEach(([path, defaultValue]) => {
    if (hasDirtyPath(dirty, path)) return;
    const prevValue = getPath(existing, path);
    const nextValue = getPath(incoming, path);
    if (nextValue === defaultValue && prevValue !== undefined && prevValue !== nextValue) {
      merged = setPath(merged, path, prevValue);
    }
  });

  Object.keys(incoming || {}).forEach((field) => {
    if (hasDirtyPath(dirty, field)) return;
    const nextValue = incoming[field];
    const prevValue = existing?.[field];
    if (nextValue == null && prevValue != null) {
      merged = { ...merged, [field]: prevValue };
      return;
    }
    if (isPlainObject(nextValue) && Object.keys(nextValue).length === 0 && isPlainObject(prevValue) && Object.keys(prevValue).length > 0) {
      merged = { ...merged, [field]: prevValue };
    }
  });

  return merged;
};

// Always light mode
function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  }, []);
}

export default function App() {
  useTheme();
  const [page, setPage] = useState('products');

  const [products, setProducts] = useState(() => [...seedProducts]);
  const [pricebooks, setPricebooks] = useState(() => [...seedPricebooks]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogSaveError, setCatalogSaveError] = useState('');
  const catalogSnapshotRef = useRef(JSON.stringify({ products: seedProducts, pricebooks: seedPricebooks }));
  const [quotes, setQuotes] = useState([]);
  const [quotesLoaded, setQuotesLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadCatalog = async () => {
      try {
        const response = await fetch('/api/catalog', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Unable to load catalog (${response.status})`);
        const data = normalizeCatalog(await response.json());
        const resolved = data.initialized
          ? { products: data.products, pricebooks: data.pricebooks }
          : { products: [...seedProducts], pricebooks: [...seedPricebooks] };
        if (isCancelled) return;
        catalogSnapshotRef.current = JSON.stringify(resolved);
        setProducts(resolved.products);
        setPricebooks(resolved.pricebooks);
        setCatalogSaveError('');
      } catch {
        if (isCancelled) return;
        const fallback = { products: [...seedProducts], pricebooks: [...seedPricebooks] };
        catalogSnapshotRef.current = JSON.stringify(fallback);
        setProducts(fallback.products);
        setPricebooks(fallback.pricebooks);
        setCatalogSaveError('Catalog could not be loaded from the server. Showing defaults until connection is restored.');
      } finally {
        if (!isCancelled) setCatalogLoaded(true);
      }
    };

    loadCatalog();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalogLoaded) return;
    const snapshot = JSON.stringify({ products, pricebooks });
    if (snapshot === catalogSnapshotRef.current) return;

    const saveCatalog = async () => {
      const payload = { products, pricebooks };

      const saveOnce = async ({ confirmed } = { confirmed: false }) =>
        fetch(confirmed ? '/api/catalog?confirm_destructive=1' : '/api/catalog', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(confirmed ? { ...payload, confirm_destructive: true } : payload),
        });

      try {
        let response = await saveOnce();

        if (response.status === 409) {
          let guardDetails = null;
          try {
            guardDetails = await response.json();
          } catch {
            guardDetails = null;
          }

          if (guardDetails?.requires_confirmation) {
            const shouldProceed = window.confirm(buildDestructiveCatalogWarning(guardDetails));
            if (!shouldProceed) {
              setCatalogSaveError('Catalog save was cancelled to prevent a potentially destructive overwrite.');
              return;
            }
            response = await saveOnce({ confirmed: true });
          }
        }

        if (!response.ok) throw new Error(`Unable to save catalog (${response.status})`);

        const saved = normalizeCatalog(await response.json());
        const savedSnapshot = JSON.stringify({ products: saved.products, pricebooks: saved.pricebooks });
        catalogSnapshotRef.current = savedSnapshot;
        setProducts((prev) => (JSON.stringify(prev) === JSON.stringify(saved.products) ? prev : saved.products));
        setPricebooks((prev) => (JSON.stringify(prev) === JSON.stringify(saved.pricebooks) ? prev : saved.pricebooks));
        setCatalogSaveError('');
      } catch {
        setCatalogSaveError('Catalog changes could not be saved. Recent product edits may not persist until save succeeds.');
      }
    };

    saveCatalog();
  }, [products, pricebooks, catalogLoaded]);

  useEffect(() => {
    fetch('/api/quotes')
      .then(r => r.json())
      .then(data => {
        const migrated = (Array.isArray(data) ? data : []).map(q => ({
          ...q,
          payment_terms: q.payment_terms || 'Net 30',
          payment_method: q.payment_method || 'Credit Card',
          quote_type: q.quote_type || 'net_new',
          partner_name: q.partner_name ?? '',
        }));
        setQuotes(migrated.length > 0 ? migrated : [...seedQuotes]);
        setQuotesLoaded(true);
      })
      .catch(() => {
        setQuotes([...seedQuotes]);
        setQuotesLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!quotesLoaded) return;
    fetch('/api/quotes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quotes),
    }).catch(() => {});
  }, [quotes, quotesLoaded]);
  const [settings, setSettings] = useState(() => normalizeSettings(seedSettings));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const settingsSnapshotRef = useRef(JSON.stringify(normalizeSettings(seedSettings)));

  useEffect(() => {
    let isCancelled = false;

    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Unable to load settings (${response.status})`);
        const data = await response.json();
        const normalized = normalizeSettings(data);
        if (isCancelled) return;
        settingsSnapshotRef.current = JSON.stringify(normalized);
        setSettings(normalized);
        setSettingsSaveError('');
      } catch {
        if (isCancelled) return;
        const normalized = normalizeSettings(seedSettings);
        settingsSnapshotRef.current = JSON.stringify(normalized);
        setSettings(normalized);
        setSettingsSaveError('Settings could not be loaded from the server. Showing default values until connection is restored.');
      } finally {
        if (!isCancelled) setSettingsLoaded(true);
      }
    };

    loadSettings();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    const snapshot = JSON.stringify(settings);
    if (snapshot === settingsSnapshotRef.current) return;

    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to save settings (${response.status})`);
        const saved = normalizeSettings(await response.json());
        settingsSnapshotRef.current = JSON.stringify(saved);
        setSettings((prev) => (JSON.stringify(prev) === settingsSnapshotRef.current ? prev : saved));
        setSettingsSaveError('');
      })
      .catch(() => {
        setSettingsSaveError('Settings could not be saved. Recent edits may not persist until save succeeds.');
      });
  }, [settings, settingsLoaded]);

  const saveSettings = useCallback((nextSettings) => {
    setSettings(normalizeSettings(nextSettings));
  }, []);

  const [search, setSearch] = useState('');
  const [pricebookSearch, setPricebookSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activePricebookId, setActivePricebookId] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [activeQuote, setActiveQuote] = useState(null);

  const activeQuoteRecord = useMemo(
    () => (activeQuote ? quotes.find((q) => q.id === activeQuote.id) || activeQuote : null),
    [quotes, activeQuote],
  );

  // Product CRUD
  const saveProd = (payload) => {
    const incomingProduct = payload?.product || payload;
    const incomingAssignments = Array.isArray(payload?.pricebook_assignments)
      ? payload.pricebook_assignments
      : null;

    setProducts((prev) => {
      const incoming = { ...incomingProduct };
      const dirtyFields = Array.isArray(incoming._dirty_fields) ? incoming._dirty_fields : [];
      const isEditMode = Boolean(incoming._is_edit_mode);
      delete incoming._dirty_fields;
      delete incoming._is_edit_mode;

      const i = prev.findIndex((x) => x.id === incoming.id);
      if (i < 0) return [...prev, incoming];

      return prev.map((x) => {
        if (x.id !== incoming.id) return x;
        const merged = isEditMode ? mergeProductForEdit(x, incoming, dirtyFields) : { ...x, ...incoming };
        return { ...merged, updated_at: new Date().toISOString() };
      });
    });

    if (incomingAssignments) {
      const normalizedAssignments = incomingAssignments
        .map((assignment) => {
          const pricebookId = String(assignment?.pricebook_id || '');
          const productId = String(assignment?.product_id || incomingProduct?.id || '');
          if (!pricebookId || !productId) return null;

          let listPriceOverride = null;
          if (assignment?.list_price_override !== '' && assignment?.list_price_override != null) {
            const parsed = Number(assignment.list_price_override);
            if (Number.isFinite(parsed) && parsed >= 0) listPriceOverride = parsed;
          }

          return {
            product_id: productId,
            pricebook_id: pricebookId,
            is_active: assignment?.is_active !== false,
            list_price_override: listPriceOverride,
          };
        })
        .filter(Boolean);

      setPricebooks((prev) => prev.map((pricebook) => {
        const now = new Date().toISOString();
        const existingEntries = Array.isArray(pricebook.entries)
          ? pricebook.entries
            .map((entry) => normalizePricebookEntry(entry, pricebook.id))
            .filter(Boolean)
          : [];

        const productId = String(incomingProduct?.id || '');
        const existingEntry = existingEntries.find((entry) => entry.product_id === productId) || null;
        const retainedEntries = existingEntries.filter((entry) => entry.product_id !== productId);
        const assignment = normalizedAssignments.find((item) => item.pricebook_id === String(pricebook.id));
        if (!assignment && !existingEntry) return pricebook;

        let nextEntry = null;
        if (assignment) {
          nextEntry = normalizePricebookEntry({
            ...existingEntry,
            ...assignment,
            product_id: productId,
          }, pricebook.id);
        }

        const nextEntries = nextEntry ? [...retainedEntries, nextEntry] : retainedEntries;
        const entriesUnchanged = JSON.stringify(existingEntries) === JSON.stringify(nextEntries);
        if (entriesUnchanged) return pricebook;

        return {
          ...pricebook,
          entries: nextEntries,
          updated_at: now,
        };
      }));
    }

    setModal(null);
  };

  const delProd = (id) =>
    setConfirm({
      msg: 'Delete this product? This action cannot be undone.',
      fn: () => {
        setProducts((prev) => prev.filter((x) => x.id !== id));
        setPricebooks((prev) =>
          prev.map((pricebook) => ({
            ...pricebook,
            entries: Array.isArray(pricebook.entries) ? pricebook.entries.filter((entry) => entry.product_id !== id) : [],
          })),
        );
        setConfirm(null);
      },
    });

  const dupeProd = (p) =>
    setProducts((prev) => [
      ...prev,
      { ...p, id: genId(), name: p.name + ' (copy)', sku: p.sku + '-COPY', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ]);

  // Pricebook CRUD
  const savePricebook = (pricebook) => {
    setPricebooks((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.id === pricebook.id);
      const now = new Date().toISOString();
      const normalized = {
        ...pricebook,
        active: Boolean(pricebook.active),
        is_default: Boolean(pricebook.is_default),
        entries: (Array.isArray(pricebook.entries) ? pricebook.entries : [])
          .map((entry) => normalizePricebookEntry(entry, pricebook.id))
          .filter(Boolean),
        tiered_pricing: Array.isArray(pricebook.tiered_pricing) ? pricebook.tiered_pricing : [],
        updated_at: now,
      };

      if (normalized.is_default) {
        for (let i = 0; i < next.length; i += 1) {
          next[i] = { ...next[i], is_default: false };
        }
      }

      if (index >= 0) {
        next[index] = { ...next[index], ...normalized };
      } else {
        next.push({ ...normalized, created_at: now });
      }

      return next;
    });
    setModal(null);
  };

  const deletePricebook = (id) => {
    setConfirm({
      msg: 'Delete this price book? This action cannot be undone.',
      fn: () => {
        setPricebooks((prev) => prev.filter((pricebook) => pricebook.id !== id));
        setActivePricebookId((prev) => (prev === id ? null : prev));
        setConfirm(null);
      },
    });
  };

  // Quote CRUD
  const saveQuote = (q) => {
    setQuotes((prev) => {
      const i = prev.findIndex((x) => x.id === q.id);
      return i >= 0 ? prev.map((x) => (x.id === q.id ? { ...q, updated_at: new Date().toISOString() } : x)) : [...prev, q];
    });
    setModal(null);
  };

  const saveQuoteFromDetail = (q) => {
    setQuotes((prev) => {
      const i = prev.findIndex((x) => x.id === q.id);
      return i >= 0 ? prev.map((x) => (x.id === q.id ? q : x)) : [...prev, q];
    });
    setActiveQuote(q);
  };

  const delQuote = (id) =>
    setConfirm({
      msg: 'Delete this quote? This action cannot be undone.',
      fn: () => {
        setQuotes((p) => p.filter((x) => x.id !== id));
        setActiveQuote(null);
        setConfirm(null);
      },
    });

  const dupeQuote = (q) => {
    // Remap line IDs and parent_line_id references for packages
    const idMap = new Map();
    const newLines = (q.line_items || []).map((l) => {
      const newId = genId();
      idMap.set(l.id, newId);
      return { ...l, id: newId };
    }).map((l) => ({
      ...l,
      parent_line_id: l.parent_line_id ? (idMap.get(l.parent_line_id) || null) : null,
    }));

    const newQ = {
      ...q,
      id: genId(),
      quote_number: genQuoteNumber(quotes),
      name: q.name + ' (copy)',
      status: 'draft',
      line_items: newLines,
      groups: (q.groups || []).map((g) => ({ ...g, id: genId() })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setQuotes((prev) => [...prev, newQ]);
    return newQ;
  };

  // Filters
  const filteredProducts = useMemo(
    () =>
      sortProductsByType(
        products.filter((p) => {
          if (typeFilter !== 'All' && getProductCategory(p) !== typeFilter) return false;
          if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
          return true;
        }),
      ),
    [products, search, typeFilter],
  );

  const productTypePicklist = useMemo(() => {
    const categories = [...PRODUCT_TYPES];
    const seen = new Set(categories);
    products.forEach((product) => {
      const category = getProductCategory(product);
      if (!seen.has(category)) {
        seen.add(category);
        categories.push(category);
      }
    });
    return [
      { value: 'All', label: 'All' },
      ...categories.map((category) => ({ value: category, label: TYPE_LABELS[category] || category })),
    ];
  }, [products]);

  const filteredPricebooks = useMemo(() => {
    if (!pricebookSearch.trim()) return pricebooks;
    const query = pricebookSearch.trim().toLowerCase();
    return pricebooks.filter((pricebook) => pricebook.name.toLowerCase().includes(query));
  }, [pricebooks, pricebookSearch]);

  const selectedPricebook = useMemo(
    () => pricebooks.find((pricebook) => pricebook.id === activePricebookId) || null,
    [pricebooks, activePricebookId],
  );

  const fq = quotes.filter((q) => {
    if (statusFilter !== 'All' && q.status !== statusFilter) return false;
    if (search && !(q.name || '').toLowerCase().includes(search.toLowerCase()) && !(q.quote_number || '').toLowerCase().includes(search.toLowerCase()) && !(q.customer_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statuses = ['All', ...['draft', 'submitted', 'won', 'lost', 'cancelled'].filter((s) => quotes.some((q) => q.status === s))];

  const handleNavClick = (nextPage) => {
    setPage(nextPage);
    setSearch('');
    setPricebookSearch('');
    setTypeFilter('All');
    setStatusFilter('All');
    setActivePricebookId(null);
    setActiveQuote(null);
  };

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <NetlifyLogo size={34} />
          <span className="sidebar-brand-text">DEAL STUDIO</span>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-item section-${item.key}${page === item.key ? ' active' : ''}`}
              onClick={() => handleNavClick(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <main className={`main-content section-${page}`}>
        {/* Products Page */}
        {page === 'products' && (
          <>
            <div className="page-header">
              <div className="page-label">Product Catalog</div>
              <h1 className="page-title">Products</h1>
            </div>
            {catalogSaveError && <div className="settings-save-error">{catalogSaveError}</div>}

            <div className="toolbar">
              <div className="search-wrap">
                <span style={{ color: '#9ca3af', fontSize: '13px' }}>Search</span>
                <input
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                />
              </div>
              <div className="toolbar-select-wrap">
                <select className="field-select toolbar-picklist" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  {productTypePicklist.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span className="toolbar-select-icon" aria-hidden="true">
                  <span>▾</span>
                </span>
              </div>
              <button className="btn-primary btn-quote-add" onClick={() => setModal({ type: 'product' })}>
                Add Product
              </button>
            </div>

            <ProductTable
              products={filteredProducts}
              allProducts={products}
              onEdit={(product) => setModal({ type: 'product', data: product })}
              onDupe={dupeProd}
              onDelete={delProd}
              onAdd={() => setModal({ type: 'product' })}
            />
          </>
        )}

        {/* Price Books Page */}
        {page === 'pricebooks' && (
          <>
            {!selectedPricebook && (
              <>
                <div className="page-header">
                  <div className="page-label">Catalog Pricing</div>
                  <h1 className="page-title">Price Books</h1>
                </div>

                <div className="toolbar">
                  <div className="search-wrap">
                    <span style={{ color: '#9ca3af', fontSize: '13px' }}>Search</span>
                    <input
                      className="search-input"
                      value={pricebookSearch}
                      onChange={(event) => setPricebookSearch(event.target.value)}
                      placeholder="Search price books..."
                    />
                  </div>
                  <button className="btn-primary btn-product-add" onClick={() => setModal({ type: 'pricebook' })}>
                    Create Price Book
                  </button>
                </div>

                <PricebookTable
                  pricebooks={filteredPricebooks}
                  onOpen={setActivePricebookId}
                  onEdit={(pricebook) => setModal({ type: 'pricebook', data: pricebook })}
                  onDelete={deletePricebook}
                  onAdd={() => setModal({ type: 'pricebook' })}
                />
              </>
            )}

            {selectedPricebook && (
              <PricebookDetail
                pricebook={selectedPricebook}
                products={products}
                onBack={() => setActivePricebookId(null)}
                onUpdate={savePricebook}
              />
            )}
          </>
        )}

        {/* Quotes Page */}
        {page === 'quotes' && !activeQuoteRecord && (
          <>
            <div className="page-header">
              <div className="page-label">Deal Management</div>
              <h1 className="page-title">Quotes</h1>
            </div>

            <div className="toolbar">
              <div className="search-wrap">
                <span style={{ color: '#9ca3af', fontSize: '13px' }}>Search</span>
                <input
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search quotes..."
                />
              </div>
              <div className="toolbar-select-wrap">
                <select className="field-select toolbar-picklist" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s === 'All' ? 'Quote Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
                <span className="toolbar-select-icon" aria-hidden="true">
                  <span>▾</span>
                </span>
              </div>
              <button className="btn-primary btn-quote-add" onClick={() => setModal({ type: 'quote' })}>
                New Quote
              </button>
            </div>

            <QuoteList
              quotes={fq}
              onNew={() => setModal({ type: 'quote' })}
              onOpen={(q) => setActiveQuote(q)}
              onDupe={dupeQuote}
              onDelete={delQuote}
            />
          </>
        )}

        {/* Quote Detail */}
        {page === 'quotes' && activeQuoteRecord && (
          <QuoteDetail
            key={activeQuoteRecord.id}
            quote={activeQuoteRecord}
            products={products}
            pricebooks={pricebooks}
            settings={settings}
            onSave={saveQuoteFromDetail}
            onBack={() => setActiveQuote(null)}
            onDelete={delQuote}
            onClone={(q) => { const cloned = dupeQuote(q); setActiveQuote(cloned); }}
          />
        )}

        {/* Settings Page */}
        {page === 'settings' && (
          <Settings settings={settings} onSave={saveSettings} saveError={settingsSaveError} />
        )}

        {/* Coming Soon */}
        {COMING_SOON_META[page] && (
          <>
            <div className="page-header">
              <div className="page-label">{COMING_SOON_META[page].label}</div>
              <h1 className="page-title">{COMING_SOON_META[page].title}</h1>
              <div className="page-subtitle">{COMING_SOON_META[page].subtitle}</div>
            </div>
            <div className="coming-soon">
              <div className="coming-soon-icon">
                {COMING_SOON_META[page].title}
              </div>
              <div className="coming-soon-title">{COMING_SOON_META[page].title}</div>
              <div className="coming-soon-text">Coming soon</div>
            </div>
          </>
        )}
      </main>

      {modal?.type === 'product' && (
        <ProductModal
          product={modal.data}
          products={products}
          pricebooks={pricebooks}
          onSave={saveProd}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'pricebook' && (
        <PricebookModal pricebook={modal.data} onSave={savePricebook} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'quote' && (
        <QuoteModal
          quote={modal.data}
          existingQuotes={quotes}
          pricebooks={pricebooks}
          onSave={(q) => { saveQuote(q); setActiveQuote(q); }}
          onClose={() => setModal(null)}
        />
      )}
      {confirm && <Confirm msg={confirm.msg} onYes={confirm.fn} onNo={() => setConfirm(null)} />}
    </div>
  );
}
