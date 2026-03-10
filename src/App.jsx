import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const NAV_ITEMS = [
  { key: 'products', label: 'Products', icon: 'fa-box' },
  { key: 'pricebooks', label: 'Pricebooks', icon: 'fa-book' },
  { key: 'scope', label: 'Scope', icon: 'fa-bullseye' },
  { key: 'quotes', label: 'Quotes', icon: 'fa-file-invoice-dollar' },
  { key: 'orders', label: 'Orders', icon: 'fa-cart-shopping' },
];

const COMING_SOON_META = {
  scope: { icon: 'fa-bullseye', title: 'Scope', label: 'Deal Scope', subtitle: 'Define and manage deal scope for quotes' },
  orders: { icon: 'fa-cart-shopping', title: 'Orders', label: 'Order Management', subtitle: 'Track and manage customer orders' },
};

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('deal-studio-theme');
    return saved || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('deal-studio-theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle };
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [page, setPage] = useState('products');
  const [products, setProducts] = useState([]);
  const [pricebooks, setPricebooks] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState('');
  const [pricebookSearch, setPricebookSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activePricebookId, setActivePricebookId] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [activeQuote, setActiveQuote] = useState(null);
  const hasLoadedCatalog = useRef(false);
  const hasLoadedQuotes = useRef(false);
  const skipNextPersist = useRef(false);
  const skipNextPersistQuotes = useRef(false);

  // Catalog persistence (products + pricebooks) via localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('deal-studio-catalog');
      if (raw) {
        const loaded = JSON.parse(raw);
        if (Array.isArray(loaded)) {
          skipNextPersist.current = true;
          setProducts(loaded);
        } else {
          skipNextPersist.current = true;
          setProducts(Array.isArray(loaded?.products) ? loaded.products : []);
          setPricebooks(Array.isArray(loaded?.pricebooks) ? loaded.pricebooks : []);
        }
      }
    } catch { /* ignore corrupt data */ }
    hasLoadedCatalog.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedCatalog.current) return;
    if (skipNextPersist.current) { skipNextPersist.current = false; return; }
    try {
      localStorage.setItem('deal-studio-catalog', JSON.stringify({ products, pricebooks }));
    } catch { /* ignore quota errors */ }
  }, [products, pricebooks]);

  // Quotes persistence via localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('deal-studio-quotes');
      if (raw) {
        const loaded = JSON.parse(raw);
        skipNextPersistQuotes.current = true;
        setQuotes(Array.isArray(loaded) ? loaded : []);
      }
    } catch { /* ignore corrupt data */ }
    hasLoadedQuotes.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedQuotes.current) return;
    if (skipNextPersistQuotes.current) { skipNextPersistQuotes.current = false; return; }
    try {
      localStorage.setItem('deal-studio-quotes', JSON.stringify(quotes));
    } catch { /* ignore quota errors */ }
  }, [quotes]);

  // Product CRUD
  const saveProd = (p) => {
    setProducts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      return i >= 0 ? prev.map((x) => (x.id === p.id ? { ...p, updated_at: new Date().toISOString() } : x)) : [...prev, p];
    });
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
        entries: Array.isArray(pricebook.entries) ? pricebook.entries : [],
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
      msg: 'Delete this pricebook? This action cannot be undone.',
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
          <NetlifyLogo size={34} theme={theme} />
          <span className="sidebar-brand-text">DEAL STUDIO</span>
        </div>
        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-item section-${item.key}${page === item.key ? ' active' : ''}`}
              onClick={() => handleNavClick(item.key)}
            >
              <i className={`fa-solid ${item.icon}`} />
              {item.label}
            </button>
          ))}
        </div>
        <div className="theme-toggle">
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
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

            <div className="toolbar">
              <div className="search-wrap">
                <i className="fa-solid fa-magnifying-glass" />
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
                  <i className="fa-solid fa-chevron-down" />
                </span>
              </div>
              <button className="btn-primary btn-product-add" onClick={() => setModal({ type: 'product' })}>
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

        {/* Pricebooks Page */}
        {page === 'pricebooks' && (
          <>
            {!selectedPricebook && (
              <>
                <div className="page-header">
                  <div className="page-label">Catalog Pricing</div>
                  <h1 className="page-title">Pricebooks</h1>
                </div>

                <div className="toolbar">
                  <div className="search-wrap">
                    <i className="fa-solid fa-magnifying-glass" />
                    <input
                      className="search-input"
                      value={pricebookSearch}
                      onChange={(event) => setPricebookSearch(event.target.value)}
                      placeholder="Search pricebooks..."
                    />
                  </div>
                  <button className="btn-primary btn-product-add" onClick={() => setModal({ type: 'pricebook' })}>
                    Create Pricebook
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
        {page === 'quotes' && !activeQuote && (
          <>
            <div className="page-header">
              <div className="page-label">Deal Management</div>
              <h1 className="page-title">Quotes</h1>
            </div>

            <div className="toolbar">
              <div className="search-wrap">
                <i className="fa-solid fa-magnifying-glass" />
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
                  <i className="fa-solid fa-chevron-down" />
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
        {page === 'quotes' && activeQuote && (
          <QuoteDetail
            key={activeQuote.id}
            quote={activeQuote}
            products={products}
            pricebooks={pricebooks}
            onSave={saveQuoteFromDetail}
            onBack={() => setActiveQuote(null)}
            onDelete={delQuote}
          />
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
                <i className={`fa-solid ${COMING_SOON_META[page].icon}`} />
              </div>
              <div className="coming-soon-title">{COMING_SOON_META[page].title}</div>
              <div className="coming-soon-text">Coming soon</div>
            </div>
          </>
        )}
      </main>

      {modal?.type === 'product' && (
        <ProductModal product={modal.data} products={products} onSave={saveProd} onClose={() => setModal(null)} />
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
