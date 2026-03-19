import React, { useState, useRef, useEffect, useMemo, Component } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { isRichTextEmpty, toRichTextHtml } from '../utils/richText';
import {
  calcQuoteTotals, calcLineExtended,
  fmtCurrency, STATUS_META, emptyLineItem,
  emptyPackageLine, emptySubLineItem,
  syncDiscountFromPercent, syncDiscountFromAmount,
  isIncluded, isQuantityEditable, getEffectiveLineQuantity,
  getPackageComponentSection,
  getPackageProductComponents,
  isPackageComponentQtyEditable,
  isPackageComponentQtyVisible,
} from '../data/quotes';
import { isBundleProduct, TYPE_LABELS, getProductCategory, genId } from '../data/catalog';
import { generateQuotePDF } from '../utils/generateQuotePDF';
import {
  formatIntegerForEdit,
  formatIntegerWithCommas,
  parsePositiveIntegerInput,
} from '../utils/numberFormat';

class QuoteDetailErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[QuoteDetail] Render crash:', error, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary-wrap">
          <button className="back-btn" onClick={this.props.onBack}>Back to Quotes</button>
          <h2 className="error-boundary-heading">Something went wrong</h2>
          <pre className="error-boundary-trace">
            {this.state.error?.message || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const relativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
};

const ACTIVITY_DOT_COLORS = {
  draft: '#6b7280', sent: '#2E51ED', draft_revision: '#FBB13D',
  ready_to_submit: '#05BDBA', pending_approval: '#7C3AED',
  approved: '#059669', rejected: '#ef4444', converted: '#065f46',
  archived: '#9ca3af',
};

const fmtDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const displayCurrency = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  return n === 0 ? '—' : fmtCurrency(n);
};

const displayCurrencyValue = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  return fmtCurrency(n);
};

const displayPercent = (v) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0;
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1)}%`;
};

const PACKAGE_COMPONENT_RENDER_ORDER = ['platform', 'support', 'entitlement', 'addon'];
const PACKAGE_COMPONENT_RENDER_LABELS = {
  platform: 'Platform',
  support: 'Support',
  entitlement: 'Entitlements',
  addon: 'Add-ons',
};

const getPackageComponentRenderCategory = (line) => {
  const section = getPackageComponentSection(line);
  if (section === 'support' || section === 'entitlement') return section;
  const productCategory = getProductCategory({ category: line?.product_type });
  if (productCategory === 'addon') return 'addon';
  return 'platform';
};

const groupPackageComponentsForDisplay = (subs = []) => {
  const grouped = {
    platform: [],
    support: [],
    entitlement: [],
    addon: [],
  };
  subs.forEach((sub) => {
    grouped[getPackageComponentRenderCategory(sub)].push(sub);
  });
  return PACKAGE_COMPONENT_RENDER_ORDER
    .map((category) => ({
      category,
      label: PACKAGE_COMPONENT_RENDER_LABELS[category],
      lines: grouped[category],
    }))
    .filter((group) => group.lines.length > 0);
};

const groupBasePackageSectionsForDisplay = (subs = []) => {
  const grouped = groupPackageComponentsForDisplay(subs);
  const included = [];
  const configuration = [];
  grouped.forEach((group) => {
    if (group.category === 'entitlement') {
      configuration.push(...group.lines);
      return;
    }
    included.push(...group.lines);
  });
  return [
    { key: 'included', label: 'Included', lines: included, isConfiguration: false },
    { key: 'configuration', label: 'Configuration', lines: configuration, isConfiguration: true },
  ].filter((section) => section.lines.length > 0);
};

const SEAT_INPUT_PATTERN = /\b(seat|seats|user|users|license|licenses)\b/i;

const isSeatQuantityLine = (line) => {
  if (!line) return false;
  const name = String(line.product_name || '');
  return line.product_type === 'seats'
    || line.unit_type === 'per_member'
    || SEAT_INPUT_PATTERN.test(name);
};

const CONCURRENT_BUILDS_INPUT_PATTERN = /\bconcurrent\s*builds?\b/i;

const isConcurrentBuildsQuantityLine = (line) => {
  if (!line) return false;
  const name = String(line.product_name || '');
  const sku = String(line.product_sku || '');
  return CONCURRENT_BUILDS_INPUT_PATTERN.test(name) || sku === 'CC-B';
};

const CREDIT_INPUT_PATTERN = /\bcredits?\b/i;

const isCreditQuantityLine = (line) => {
  if (!line) return false;
  const name = String(line.product_name || '');
  const sku = String(line.product_sku || '');
  return line.unit_type === 'per_credit'
    || line.product_type === 'credits'
    || CREDIT_INPUT_PATTERN.test(name)
    || CREDIT_INPUT_PATTERN.test(sku);
};

const fmtQty = (v) => {
  const n = typeof v === 'number' && !isNaN(v) ? v : 0;
  return n.toLocaleString('en-US');
};

const CARD_ORDER_WITH_PACKAGE = ['bundle', 'support', 'addon', 'entitlements'];
const CARD_ORDER_NO_PACKAGE = ['platform', 'support', 'addon', 'entitlements'];
const MULTI_SELECT_CATEGORIES = new Set(['platform', 'entitlements', 'addon']);

const getCategoryCardLabel = (category, hasActiveBasePackage) => {
  if (category === 'entitlements' && hasActiveBasePackage) return 'Additional Entitlements';
  return TYPE_LABELS[category] || category;
};

const getMultiSelectPlaceholder = (category, cardLabel) => {
  if (category === 'entitlements' && cardLabel === 'Additional Entitlements') return 'Add Product';
  if (category === 'addon') return 'Add Product';
  return 'Select Product';
};

const shouldShowPlatformAddonQty = (line) => {
  if (!line) return false;
  const quantity = getEffectiveLineQuantity(line);
  return quantity > 1 || isQuantityEditable(line.unit_type || 'flat');
};

const setsEqual = (a, b) => {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

function DetailInput({ label, field, value, placeholder, span2, type, mono, textarea, options, onChange, onBlur }) {
  const inputCls = `qd-dc-input${mono ? ' qd-dc-input--mono' : ''}`;
  const handleChange = (e) => onChange(field, e.target.value);
  const handleBlur = (e) => { onBlur(field, e.target.value); };
  let input;
  if (textarea) {
    input = <textarea className={`${inputCls} qd-dc-input--textarea`} value={value || ''} placeholder={placeholder} onChange={handleChange} onBlur={handleBlur} />;
  } else if (options) {
    input = (
      <select className={`qd-detail-input-select ${inputCls} qd-dc-input--select`} value={value || ''} onChange={(e) => { handleChange(e); onBlur(field, e.target.value); }} onBlur={handleBlur}>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  } else {
    input = <input type={type || 'text'} className={`${inputCls} qd-dc-input--height`} value={value || ''} placeholder={placeholder} onChange={handleChange} onBlur={handleBlur} />;
  }
  return (
    <div className={span2 ? 'qd-dc-span2' : undefined}>
      <div className="qd-dc-label">{label}</div>
      {input}
    </div>
  );
}

const normalizeQuote = (q) => {
  if (!q || typeof q !== 'object') {
    return { id: 'error', quote_number: 'ERR', name: 'Invalid Quote', status: 'draft', term_months: 12, header_discount: 0, line_items: [], groups: [], start_date: '', end_date: '', customer_name: '', customer_address: '', customer_contact: '', billing_contact_name: '', billing_contact_email: '', billing_contact_phone: '', prepared_by: '', comments: '', terms_conditions: '', pricebook_id: null, created_at: '', updated_at: '' };
  }
  return {
    ...q,
    status: q.status || 'draft',
    term_months: q.term_months || 12,
    header_discount: q.header_discount || 0,
    line_items: (q.line_items || []).map((l) => {
      const productType = l.product_type || getProductCategory({ category: l.product_type });
      return {
        ...l,
        unit_type: l.unit_type || 'flat',
        quantity: getEffectiveLineQuantity({ ...l, product_type: productType }),
        list_price: l.list_price ?? l.sales_price ?? 0,
        discount_percent: l.discount_percent ?? 0,
        discount_amount: l.discount_amount ?? 0,
        net_price: l.net_price ?? l.list_price ?? l.sales_price ?? 0,
        product_name: l.product_name || l.name || 'Unknown Product',
        product_sku: l.product_sku || l.sku || '',
        product_type: productType,
        is_package: l.is_package || false,
        parent_line_id: l.parent_line_id || null,
        price_behavior: l.price_behavior || (l.parent_line_id ? 'included' : undefined),
      };
    }),
    groups: q.groups || [],
    overage_rate_credits: q.overage_rate_credits || '',
    overage_rate_seats: q.overage_rate_seats || '',
    activity_log: q.activity_log || [{ type: 'created', timestamp: q.created_at || new Date().toISOString(), note: 'Quote created', actor: q.prepared_by || '' }],
  };
};

export default function QuoteDetail(props) {
  return (
    <QuoteDetailErrorBoundary onBack={props.onBack}>
      <QuoteDetailInner {...props} />
    </QuoteDetailErrorBoundary>
  );
}

function QuoteDetailInner({ quote, products, pricebooks, settings, onSave, onBack, onDelete, onClone }) {
  const [q, setQ] = useState(() => normalizeQuote(quote));
  const [mode, setMode] = useState('view');

  useEffect(() => {
    if (mode === 'edit') return;
    setQ(normalizeQuote(quote));
  }, [quote, mode]);
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [collapsedPkgs, setCollapsedPkgs] = useState(new Set());
  const [detailCards, setDetailCards] = useState({ customer: false, term: false, billing: false, terms_conditions: false, activity: false });
  const [editingTitle, setEditingTitle] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [ddNotesModal, setDdNotesModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState(null);
  const [toast, setToast] = useState(null);
  const [currencyInputDrafts, setCurrencyInputDrafts] = useState({});
  const [quantityInputDrafts, setQuantityInputDrafts] = useState({});
  const [multiPickerDrafts, setMultiPickerDrafts] = useState({});
  const moreRef = useRef(null);
  const productsById = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

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

  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (mode !== 'edit') {
      setCurrencyInputDrafts({});
      setQuantityInputDrafts({});
      setMultiPickerDrafts({});
    }
  }, [mode]);

  const persistQuote = (fn) => {
    setQ((prev) => {
      const next = fn(prev);
      next.updated_at = new Date().toISOString();
      onSave(next);
      return next;
    });
  };

  const sanitizeSupportQuantities = (lineItems = []) => (
    lineItems.map((line) => ({
      ...line,
      quantity: getEffectiveLineQuantity(line),
    }))
  );

  const enterEditMode = () => {
    setDraft({
      line_items: sanitizeSupportQuantities(JSON.parse(JSON.stringify(q.line_items))),
      groups: JSON.parse(JSON.stringify(q.groups)),
      header_discount: q.header_discount || 0,
    });
    setMode('edit');
  };

  const saveEdit = () => {
    const updated = {
      ...q,
      line_items: sanitizeSupportQuantities(draft.line_items),
      groups: draft.groups,
      header_discount: draft.header_discount,
      updated_at: new Date().toISOString(),
    };
    setQ(updated);
    onSave(updated);
    setDraft(null);
    setMode('view');
  };

  const cancelEdit = () => { setDraft(null); setMode('view'); };

  const updateDraft = (fn) => { setDraft((prev) => fn({ ...prev })); };

  const getSelectedPricebook = () => {
    if (!q.pricebook_id) return null;
    return (pricebooks || []).find((pb) => pb.id === q.pricebook_id) || null;
  };

  const getPriceOverride = (productId) => {
    const pb = getSelectedPricebook();
    const entry = pb?.entries?.find((e) => e.product_id === productId && e?.is_active !== false);
    if (!entry) return undefined;
    if (entry.list_price_override != null) return entry.list_price_override;
    return entry.price_override != null ? entry.price_override : undefined;
  };

  const availableProducts = useMemo(() => {
    const pb = getSelectedPricebook();
    if (!pb || !pb.entries?.length) return products;
    const pbProductIds = new Set(
      pb.entries
        .filter((e) => e?.is_active !== false)
        .map((e) => e.product_id),
    );
    return products.filter((p) => pbProductIds.has(p.id));
  }, [products, pricebooks, q.pricebook_id]);

  const productsByCategory = useMemo(() => {
    const grouped = {
      bundle: [],
      platform: [],
      entitlements: [],
      addon: [],
      support: [],
    };
    (availableProducts || []).forEach((product) => {
      const category = getProductCategory(product);
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(product);
    });
    Object.values(grouped).forEach((list) => list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    return grouped;
  }, [availableProducts]);

  const addLineToDraft = (product) => {
    const packageComponents = getPackageProductComponents(product, products);
    if (isBundleProduct(product) && packageComponents.length > 0) {
      const parentLine = emptyPackageLine(product);
      const productMap = new Map((products || []).map((p) => [p.id, p]));
      const subLines = packageComponents
        .filter((component) => productMap.has(component.component_product_id))
        .map((component) => emptySubLineItem(
          productMap.get(component.component_product_id),
          component,
          parentLine.id,
          getPriceOverride(component.component_product_id),
        ));
      updateDraft((d) => {
        const base = d.line_items.length;
        d.line_items = [...d.line_items, { ...parentLine, sort_order: base }, ...subLines.map((sl, i) => ({ ...sl, sort_order: base + 1 + i }))];
        return d;
      });
    } else {
      const line = emptyLineItem(product, getPriceOverride(product.id));
      updateDraft((d) => { d.line_items = [...d.line_items, { ...line, sort_order: d.line_items.length }]; return d; });
    }
  };

  const updateDraftLine = (lineId, updates) => {
    updateDraft((d) => { d.line_items = d.line_items.map((l) => l.id === lineId ? { ...l, ...updates } : l); return d; });
  };

  const clearInlineDraftInputs = (lineId) => {
    setCurrencyInputDrafts((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        if (!key.startsWith(`${lineId}:`)) next[key] = prev[key];
      });
      return next;
    });
    setQuantityInputDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  const swapDraftLineProduct = (lineId, productId) => {
    const product = productsById.get(productId);
    if (!product) return;
    clearInlineDraftInputs(lineId);
    updateDraft((d) => {
      const lineIdx = d.line_items.findIndex((line) => line.id === lineId);
      if (lineIdx < 0) return d;
      const currentLine = d.line_items[lineIdx];

      if (currentLine.is_package) {
        const nextParentBase = emptyPackageLine(product);
        const nextParent = {
          ...nextParentBase,
          id: currentLine.id,
          sort_order: currentLine.sort_order,
          group_id: currentLine.group_id ?? null,
        };
        const parentPriceOverride = getPriceOverride(product.id);
        if (typeof parentPriceOverride === 'number' && Number.isFinite(parentPriceOverride)) {
          nextParent.list_price = parentPriceOverride;
          nextParent.net_price = parentPriceOverride;
        }

        const productMap = new Map((products || []).map((p) => [p.id, p]));
        const packageComponents = getPackageProductComponents(product, products);
        const nextSubLines = packageComponents
          .filter((component) => productMap.has(component.component_product_id))
          .map((component) => emptySubLineItem(
            productMap.get(component.component_product_id),
            component,
            currentLine.id,
            getPriceOverride(component.component_product_id),
          ));

        const withoutCurrentPackage = d.line_items.filter((line) => line.id !== currentLine.id && line.parent_line_id !== currentLine.id);
        const before = withoutCurrentPackage.slice(0, lineIdx);
        const after = withoutCurrentPackage.slice(lineIdx);
        d.line_items = [
          ...before,
          { ...nextParent, sort_order: lineIdx },
          ...nextSubLines.map((line, offset) => ({ ...line, sort_order: lineIdx + 1 + offset })),
          ...after,
        ];
        return d;
      }

      const nextStandalone = emptyLineItem(product, getPriceOverride(product.id));
      d.line_items[lineIdx] = {
        ...nextStandalone,
        id: currentLine.id,
        sort_order: currentLine.sort_order,
        group_id: currentLine.group_id ?? null,
      };
      return d;
    });
  };

  const addDraftLineFromCategory = (category, productId) => {
    const topLevelLine = draft?.line_items?.find((line) => !line.parent_line_id && getLineCategory(line) === category);
    if (topLevelLine) {
      swapDraftLineProduct(topLevelLine.id, productId);
      return;
    }
    const product = productsById.get(productId);
    if (!product) return;
    addLineToDraft(product);
  };

  const setCategorySelections = (category, selectedProductIds) => {
    const selected = selectedProductIds instanceof Set ? selectedProductIds : new Set(selectedProductIds);
    updateDraft((d) => {
      const nextItems = [];
      const existingTopLevelByProduct = new Map();

      d.line_items.forEach((line) => {
        if (line.parent_line_id) {
          nextItems.push(line);
          return;
        }
        if (getLineCategory(line) !== category) {
          nextItems.push(line);
          return;
        }
        if (!existingTopLevelByProduct.has(line.product_id)) {
          existingTopLevelByProduct.set(line.product_id, line);
        }
        if (selected.has(line.product_id)) {
          nextItems.push(line);
        }
      });

      selected.forEach((productId) => {
        if (existingTopLevelByProduct.has(productId)) return;
        const product = productsById.get(productId);
        if (!product) return;
        const line = emptyLineItem(product, getPriceOverride(product.id));
        nextItems.push({ ...line, sort_order: nextItems.length });
      });

      d.line_items = nextItems.map((line, index) => ({ ...line, sort_order: index }));
      return d;
    });
  };

  const updateDraftLineField = (lineId, field, value) => {
    const line = draft.line_items.find((l) => l.id === lineId);
    if (!line) return;
    if (field === 'list_price') {
      const newList = Math.max(0, value);
      const synced = syncDiscountFromPercent(newList, line.discount_percent || 0);
      updateDraftLine(lineId, { list_price: newList, ...synced });
      return;
    }
    if (field === 'quantity' && isSupportLine(line)) {
      updateDraftLine(lineId, { quantity: 1 });
      return;
    }
    updateDraftLine(lineId, { [field]: value });
  };

  const updateDraftDiscount = (lineId, field, value) => {
    const line = draft.line_items.find((l) => l.id === lineId);
    if (!line) return;
    const val = parseFloat(value) || 0;
    const synced = field === 'discount_percent' ? syncDiscountFromPercent(line.list_price || 0, val) : syncDiscountFromAmount(line.list_price || 0, val);
    updateDraftLine(lineId, synced);
  };

  const removeDraftLine = (lineId) => {
    updateDraft((d) => { d.line_items = d.line_items.filter((l) => l.id !== lineId && l.parent_line_id !== lineId); return d; });
  };

  const cloneDraftLine = (lineId) => {
    updateDraft((d) => {
      const line = d.line_items.find((entry) => entry.id === lineId);
      if (!line || line.parent_line_id || line.is_package) return d;
      const product = productsById.get(line.product_id);
      if (!product) return d;
      const clone = {
        ...emptyLineItem(product, getPriceOverride(product.id)),
        ...line,
        id: genId(),
      };
      d.line_items = [...d.line_items, { ...clone, sort_order: d.line_items.length }];
      return d;
    });
  };

  const changeStatus = (newStatus) => {
    persistQuote((prev) => ({
      ...prev,
      status: newStatus,
      activity_log: [...(prev.activity_log || []), { type: 'status_change', from_status: prev.status, to_status: newStatus, timestamp: new Date().toISOString(), actor: prev.prepared_by || '' }],
    }));
  };

  const liveData = mode === 'edit' && draft ? { line_items: draft.line_items, groups: draft.groups, header_discount: draft.header_discount, term_months: q.term_months } : q;
  const totals = calcQuoteTotals(liveData);
  const meta = STATUS_META[q.status] || STATUS_META.draft;
  const entitlementSummary = useMemo(() => {
    const makeBucket = () => ({ includedQty: 0, additionalQty: 0, committedPrice: 0 });
    const summary = {
      credits: makeBucket(),
      seats: makeBucket(),
    };
    const resolveType = (line) => {
      if (line?.product_type === 'credits') return 'credits';
      if (line?.product_type === 'seats') return 'seats';
      if (isCreditQuantityLine(line)) return 'credits';
      if (isSeatQuantityLine(line)) return 'seats';
      return null;
    };
    (liveData.line_items || []).forEach((line) => {
      const type = resolveType(line);
      if (!type) return;
      const qty = getEffectiveLineQuantity(line);
      const included = line.parent_line_id
        ? line.price_behavior !== 'related'
        : isIncluded(line.unit_type || '');
      if (included) {
        summary[type].includedQty += qty;
        return;
      }
      summary[type].additionalQty += qty;
      summary[type].committedPrice += calcLineExtended(line);
    });
    return summary;
  }, [liveData.line_items]);

  const STATUS_EYEBROW_COLORS = {
    draft: '#6b7280', sent: '#2E51ED', draft_revision: '#FBB13D',
    ready_to_submit: '#05BDBA', pending_approval: '#7C3AED',
    approved: '#16A34A', rejected: '#ef4444', converted: '#15803d', archived: '#9ca3af',
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const getCurrencyInputKey = (lineId, field) => `${lineId}:${field}`;
  const formatCurrencyForEdit = (value) => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return String(Math.round(n * 100) / 100);
  };
  const parseCurrencyFromInput = (raw) => {
    const normalized = String(raw ?? '').replace(/[^0-9.]/g, '');
    if (!normalized) return 0;
    const parts = normalized.split('.');
    const numeric = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
    const parsed = parseFloat(numeric);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const validateForSubmission = () => {
    const errors = [];
    if (!q.line_items || q.line_items.length === 0) errors.push('Quote must have at least 1 line item');
    if (!q.customer_name?.trim()) errors.push('Customer name is required');
    if (!q.start_date) errors.push('Start date is required');
    if (!q.end_date) errors.push('End date is required');
    return errors;
  };

  const togglePackage = (lineId) => {
    setCollapsedPkgs((prev) => { const next = new Set(prev); next.has(lineId) ? next.delete(lineId) : next.add(lineId); return next; });
  };

  const getSubLines = (items, parentId) => items.filter((l) => l.parent_line_id === parentId);
  const getPackageProductAmount = (line) => {
    const lineListPrice = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : null;
    if (lineListPrice != null && lineListPrice > 0) return lineListPrice;
    const productAmount = productsById.get(line.product_id)?.default_price?.amount;
    if (typeof productAmount === 'number' && Number.isFinite(productAmount)) return productAmount;
    const lineNetPrice = typeof line.net_price === 'number' && Number.isFinite(line.net_price) ? line.net_price : null;
    if (lineNetPrice != null && lineNetPrice > 0) return lineNetPrice;
    return lineListPrice ?? 0;
  };

  const getPackageNetAmount = (line, packageList) => {
    const lineNet = typeof line.net_price === 'number' && Number.isFinite(line.net_price) ? line.net_price : null;
    if (lineNet != null && lineNet > 0) return lineNet;
    const discountAmount = typeof line.discount_amount === 'number' && Number.isFinite(line.discount_amount) ? line.discount_amount : 0;
    return Math.max(0, packageList - discountAmount);
  };

  const getPackageDisplayPricing = (line) => {
    const product = productsById.get(line.product_id);
    const defaultList = typeof product?.default_price?.amount === 'number' && Number.isFinite(product.default_price.amount)
      ? product.default_price.amount
      : 0;
    const defaultNetCandidate = product?.default_net_price ?? product?.default_sell_price ?? product?.default_price?.net_amount;
    const defaultNet = typeof defaultNetCandidate === 'number' && Number.isFinite(defaultNetCandidate)
      ? defaultNetCandidate
      : defaultList;
    const defaultDiscountCandidate = product?.default_discount_amount ?? product?.default_discount?.amount;
    const defaultDiscountPercentCandidate = product?.default_discount_percent ?? product?.default_discount?.percent;
    const defaultDiscountFromPercent = typeof defaultDiscountPercentCandidate === 'number' && Number.isFinite(defaultDiscountPercentCandidate)
      ? (defaultList * Math.max(0, Math.min(100, defaultDiscountPercentCandidate))) / 100
      : null;
    const defaultDiscount = typeof defaultDiscountCandidate === 'number' && Number.isFinite(defaultDiscountCandidate)
      ? Math.max(0, defaultDiscountCandidate)
      : (defaultDiscountFromPercent ?? Math.max(0, defaultList - defaultNet));

    const hasSavedList = typeof line.list_price === 'number' && Number.isFinite(line.list_price) && line.list_price > 0;
    const hasSavedDiscount = typeof line.discount_amount === 'number' && Number.isFinite(line.discount_amount) && line.discount_amount > 0;
    const hasSavedNet = typeof line.net_price === 'number' && Number.isFinite(line.net_price) && line.net_price > 0;
    const hasSavedPricing = hasSavedList || hasSavedDiscount || hasSavedNet;

    const listPrice = hasSavedPricing ? (hasSavedList ? line.list_price : defaultList) : defaultList;
    const discount = hasSavedPricing
      ? (typeof line.discount_amount === 'number' && Number.isFinite(line.discount_amount) ? line.discount_amount : 0)
      : defaultDiscount;
    const netPrice = hasSavedPricing
      ? (hasSavedNet ? line.net_price : Math.max(0, listPrice - discount))
      : Math.max(0, defaultNet);

    return { listPrice, discount, netPrice };
  };

  const getLineCategory = (line) => {
    if (!line) return 'platform';
    if (line.product_type) return getProductCategory({ category: line.product_type });
    const product = productsById.get(line.product_id);
    return getProductCategory(product);
  };

  const isSupportLine = (line) => getLineCategory(line) === 'support';

  const toggleCard = (key) => setDetailCards((p) => ({ ...p, [key]: !p[key] }));
  const handleFieldChange = (field, value) => setQ((p) => ({ ...p, [field]: value }));
  const handleFieldBlur = (field, value) => persistQuote((prev) => ({ ...prev, [field]: value }));

  const renderDetailCards = (source) => (
    <div className="qd-detail-card-wrap">
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('customer')}>
          <span className="qd-category-card-title">Customer Information</span>
          <span className="qd-detail-card-chevron">{detailCards.customer ? '▾' : '▸'}</span>
        </div>
        {detailCards.customer && (
          <div className="qd-detail-card-body">
            <DetailInput label="Customer Name" field="customer_name" value={source.customer_name} placeholder="Company name" span2 onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Address" field="address" value={source.address} placeholder="Street, City, State, ZIP, Country" span2 onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Primary Contact Name" field="contact_name" value={source.contact_name} placeholder="Full name" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Primary Contact Email" field="contact_email" value={source.contact_email} placeholder="contact@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Billing Contact Name" field="billing_contact_name" value={source.billing_contact_name} placeholder="Full name" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Billing Contact Email" field="billing_contact_email" value={source.billing_contact_email} placeholder="billing@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Invoice Email" field="invoice_email" value={source.invoice_email} placeholder="invoices@company.com" type="email" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Netlify Account ID" field="account_id" value={source.account_id} placeholder="e.g. acct_abc123" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>
      <div className="qd-section-divider" />
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('term')}>
          <span className="qd-category-card-title">Subscription Term</span>
          <span className="qd-detail-card-chevron">{detailCards.term ? '▾' : '▸'}</span>
        </div>
        {detailCards.term && (
          <div className="qd-detail-card-body">
            <DetailInput label="Subscription Start Date" field="start_date" value={source.start_date} type="date" onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Subscription Term (Months)" field="term_months" value={source.term_months} placeholder="12" onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>
      <div className="qd-section-divider" />
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('billing')}>
          <span className="qd-category-card-title">Billing & Payment</span>
          <span className="qd-detail-card-chevron">{detailCards.billing ? '▾' : '▸'}</span>
        </div>
        {detailCards.billing && (
          <div className="qd-detail-card-body">
            <DetailInput label="Billing Schedule" field="billing_schedule" value={source.billing_schedule} options={['Annual', 'Semi-Annual', 'Quarterly', 'Monthly']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Payment Method" field="payment_method" value={source.payment_method} options={['Credit Card', 'ACH / Bank Transfer', 'Wire Transfer', 'Check', 'Invoice']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="Payment Terms" field="payment_terms" value={source.payment_terms} options={['Net 30', 'Net 45', 'Net 60', 'Due on Receipt']} onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="PO #" field="po_number" value={source.po_number} placeholder="Optional" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
            <DetailInput label="VAT #" field="vat_number" value={source.vat_number} placeholder="Optional" mono onChange={handleFieldChange} onBlur={handleFieldBlur} />
          </div>
        )}
      </div>
      <div className="qd-section-divider" />
      <div>
        <div className="qd-category-card-header qd-detail-card-header qd-detail-card-header--clickable" onClick={() => toggleCard('terms_conditions')}>
          <span className="qd-category-card-title">Terms & Conditions</span>
          <span className="qd-detail-card-chevron">{detailCards.terms_conditions ? '▾' : '▸'}</span>
        </div>
        {detailCards.terms_conditions && (
          <div className="qd-detail-card-body qd-detail-card-body--terms">
            <div className="qd-terms-editor">
              <ReactQuill
                className="qd-terms-quill"
                value={toRichTextHtml(source.terms_conditions || '')}
                onChange={(value) => handleFieldChange('terms_conditions', isRichTextEmpty(value) ? '' : value)}
                onBlur={() => handleFieldBlur('terms_conditions', source.terms_conditions || '')}
                placeholder="Add any quote-specific terms or negotiated language here..."
                modules={quillModules}
                formats={quillFormats}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderEditTable = () => {
    if (!draft) return null;
    const items = draft.line_items;
    const topLevelByCategory = items.filter((line) => !line.parent_line_id).reduce((acc, line) => {
      const category = line.is_package ? 'bundle' : getLineCategory(line);
      if (!acc[category]) acc[category] = [];
      acc[category].push(line);
      return acc;
    }, {});
    const basePackageLine = (topLevelByCategory.bundle || [])[0] || null;
    const hasActiveBasePackage = !!basePackageLine;
    const showStandalonePlatformCard = !hasActiveBasePackage;
    const editCardOrder = showStandalonePlatformCard
      ? ['bundle', 'platform', 'support', 'addon', 'entitlements']
      : ['bundle', 'support', 'addon', 'entitlements'];
    const editCategoryGroups = editCardOrder
      .map((category) => ({
        category,
        label: getCategoryCardLabel(category, hasActiveBasePackage),
        lines: topLevelByCategory[category] || [],
      }));

    const getCategorySkuOptions = (category, currentProductId) => {
      const options = [...(productsByCategory[category] || [])];
      if (currentProductId && !options.some((product) => product.id === currentProductId)) {
        const current = productsById.get(currentProductId);
        if (current) options.unshift(current);
      }
      return options;
    };

    const renderSkuSelect = ({ category, line, onSelect, stopPropagation = false, className = '' }) => {
      const options = getCategorySkuOptions(category, line?.product_id);
      const noneLabel = category === 'bundle'
        ? 'No Base Package'
        : category === 'support'
          ? 'No Support'
          : 'None';
      const includeNoneOption = category === 'bundle' || category === 'support';
      const handleChange = (e) => {
        const productId = e.target.value;
        onSelect(productId || null);
      };
      return (
        <select
          id={line ? `qd-product-select-${line.id}` : undefined}
          className={`qd-grid-input qd-grid-select ${className}`.trim()}
          value={line?.product_id || ''}
          onChange={handleChange}
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
          disabled={options.length === 0}
        >
          {includeNoneOption ? (
            <option value="">{noneLabel}</option>
          ) : (
            <option value="">{options.length === 0 ? 'No products available' : 'Select Product'}</option>
          )}
          {options.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      );
    };

    const renderCategoryMultiSelect = (category, lines, cardLabel) => {
      const options = getCategorySkuOptions(category, null);
      const selectedProductIds = new Set((lines || []).map((line) => line.product_id).filter(Boolean));
      const stagedSelection = multiPickerDrafts[category] ? new Set(multiPickerDrafts[category]) : selectedProductIds;
      const hasOptions = options.length > 0;
      const placeholder = getMultiSelectPlaceholder(category, cardLabel);
      const selectedLabel = selectedProductIds.size > 0 ? `${selectedProductIds.size} selected` : placeholder;
      const hasPendingChanges = !setsEqual(stagedSelection, selectedProductIds);

      const setPickerDraft = (nextSet) => {
        setMultiPickerDrafts((prev) => ({ ...prev, [category]: Array.from(nextSet) }));
      };

      const clearPickerDraft = () => {
        setMultiPickerDrafts((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, category)) return prev;
          const next = { ...prev };
          delete next[category];
          return next;
        });
      };

      const handleApply = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setCategorySelections(category, stagedSelection);
        clearPickerDraft();
        const picker = event.currentTarget.closest('.qd-multi-picker');
        if (picker) picker.open = false;
      };

      return (
        <details
          className="qd-multi-picker"
          onClick={(e) => e.stopPropagation()}
          onToggle={(e) => {
            const isOpen = e.currentTarget.open;
            if (isOpen) {
              setPickerDraft(selectedProductIds);
              return;
            }
            clearPickerDraft();
          }}
        >
          <summary className="qd-grid-input qd-grid-select qd-multi-picker-summary">
            {hasOptions ? selectedLabel : 'No products available'}
          </summary>
          {hasOptions && (
            <div className="qd-multi-picker-menu">
              <div className="qd-multi-picker-options">
                {options.map((product) => {
                  const checked = stagedSelection.has(product.id);
                  return (
                    <label key={product.id} className="qd-multi-picker-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(stagedSelection);
                          if (e.target.checked) next.add(product.id);
                          else next.delete(product.id);
                          setPickerDraft(next);
                        }}
                      />
                      <span>{product.name}</span>
                    </label>
                  );
                })}
              </div>
              <div className="qd-multi-picker-footer">
                <button
                  type="button"
                  className="qd-multi-picker-apply-btn"
                  onClick={handleApply}
                  disabled={!hasPendingChanges}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </details>
      );
    };

    const renderQtyInput = (line, included = false, className = '') => {
      if (isSupportLine(line)) return <span className="cell-locked">1</span>;
      if (included) return <span className="cell-locked">1</span>;
      const isConcurrentBuildsLine = isConcurrentBuildsQuantityLine(line);
      const hasStepper = isSeatQuantityLine(line) || isConcurrentBuildsLine;
      const qtyStepperClasses = hasStepper ? 'qd-grid-input-qty-stepper' : '';
      const isCreditLine = !isConcurrentBuildsLine && isCreditQuantityLine(line);
      const qtyCreditClass = isCreditLine ? 'qd-grid-input-qty-credits' : '';
      const qtyInputKey = line.id;
      const isEditingQty = Object.prototype.hasOwnProperty.call(quantityInputDrafts, qtyInputKey);
      const currentQty = getEffectiveLineQuantity(line);
      const applyQtyDelta = (delta) => {
        const next = parsePositiveIntegerInput(currentQty + delta, 1, 1);
        updateDraftLineField(line.id, 'quantity', next);
      };
      return (
        <span className={`qd-grid-qty-control${hasStepper || isCreditLine ? ' qd-grid-qty-control--aligned' : ''}${hasStepper ? ' qd-grid-qty-control--stepper' : ''}`}>
          <input
            className={`qd-grid-input qd-grid-input-qty ${qtyStepperClasses} ${qtyCreditClass} ${className}`.trim()}
            type={isCreditLine ? 'text' : 'number'}
            inputMode={isCreditLine ? 'numeric' : undefined}
            min="1"
            step="1"
            value={isCreditLine
              ? (isEditingQty ? quantityInputDrafts[qtyInputKey] : formatIntegerWithCommas(currentQty, 1))
              : currentQty}
            onFocus={() => {
              if (!isCreditLine) return;
              setQuantityInputDrafts((prev) => ({ ...prev, [qtyInputKey]: formatIntegerForEdit(currentQty, 1, 1) }));
            }}
            onChange={(e) => {
              const raw = e.target.value;
              if (isCreditLine) {
                setQuantityInputDrafts((prev) => ({ ...prev, [qtyInputKey]: raw }));
              }
              const next = parsePositiveIntegerInput(raw, 1, 1);
              updateDraftLineField(line.id, 'quantity', next);
            }}
            onBlur={(e) => {
              if (!isCreditLine) return;
              const next = parsePositiveIntegerInput(e.target.value, 1, 1);
              updateDraftLineField(line.id, 'quantity', next);
              setQuantityInputDrafts((prev) => {
                const clone = { ...prev };
                delete clone[qtyInputKey];
                return clone;
              });
            }}
          />
          {hasStepper && (
            <span className="qd-grid-qty-stepper">
              <button
                type="button"
                className="qd-grid-qty-stepper-btn"
                onClick={() => applyQtyDelta(1)}
                aria-label="Increase quantity"
              >
                <span className="qd-grid-qty-stepper-icon">▲</span>
              </button>
              <button
                type="button"
                className="qd-grid-qty-stepper-btn"
                onClick={() => applyQtyDelta(-1)}
                aria-label="Decrease quantity"
              >
                <span className="qd-grid-qty-stepper-icon">▼</span>
              </button>
            </span>
          )}
        </span>
      );
    };

    const renderPackageQtyInput = (line) => {
      if (!isPackageComponentQtyVisible(line)) return null;
      if (!isPackageComponentQtyEditable(line)) {
        return <span className="cell-locked">{fmtQty(getEffectiveLineQuantity(line))}</span>;
      }
      return renderQtyInput(line, false);
    };

    const renderDiscountInput = (line, included = false) => {
      if (included) return <span className="price-annual">—</span>;
      const field = 'discount_amount';
      const key = getCurrencyInputKey(line.id, field);
      const isEditingCurrency = Object.prototype.hasOwnProperty.call(currencyInputDrafts, key);
      const currentValue = typeof line.discount_amount === 'number' && Number.isFinite(line.discount_amount) ? line.discount_amount : 0;
      return (
        <span className={`qd-currency-input-wrap${isEditingCurrency ? ' qd-currency-input-wrap--editing' : ''}`}>
          {isEditingCurrency && <span className="qd-currency-input-symbol" aria-hidden>$</span>}
          <input
            className={`qd-grid-input qd-grid-input-discount${isEditingCurrency ? ' qd-grid-input-currency' : ''}`}
            type="text"
            inputMode="decimal"
            value={isEditingCurrency ? currencyInputDrafts[key] : displayCurrencyValue(currentValue)}
            onFocus={() => {
              setCurrencyInputDrafts((prev) => ({ ...prev, [key]: formatCurrencyForEdit(currentValue) }));
            }}
            onChange={(e) => {
              const raw = e.target.value;
              const next = parseCurrencyFromInput(raw);
              setCurrencyInputDrafts((prev) => ({ ...prev, [key]: raw }));
              updateDraftDiscount(line.id, 'discount_amount', next);
            }}
            onBlur={(e) => {
              const next = parseCurrencyFromInput(e.target.value);
              updateDraftDiscount(line.id, 'discount_amount', next);
              setCurrencyInputDrafts((prev) => {
                const clone = { ...prev };
                delete clone[key];
                return clone;
              });
            }}
          />
        </span>
      );
    };

    const renderEditStandalone = (line, category) => {
      const unitType = line.unit_type || 'flat';
      const included = isIncluded(unitType);
      const extended = calcLineExtended(line);
      const field = 'list_price';
      const key = getCurrencyInputKey(line.id, field);
      const isEditingCurrency = Object.prototype.hasOwnProperty.call(currencyInputDrafts, key);
      const currentValue = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : 0;
      const isMultiCategory = MULTI_SELECT_CATEGORIES.has(category);
      const focusProductSelect = () => {
        const target = document.getElementById(`qd-product-select-${line.id}`);
        target?.focus();
      };
      return (
        <tr key={line.id}>
          <td className="line-td-product qd-col-product">
            <div className="qd-edit-product-cell">
              {renderSkuSelect({
                category,
                line,
                onSelect: (productId) => {
                  if (!productId) {
                    removeDraftLine(line.id);
                    return;
                  }
                  swapDraftLineProduct(line.id, productId);
                },
              })}
              <div className="qd-line-actions">
                {isMultiCategory && (
                  <>
                    <button type="button" className="qd-line-icon-btn qd-line-icon-btn-visible" aria-label={`Edit ${line.product_name}`} title="Edit row" onClick={focusProductSelect}>
                      <i className="fa-solid fa-pen fa-fw" aria-hidden="true" />
                    </button>
                    <button type="button" className="qd-line-icon-btn qd-line-icon-btn-visible" aria-label={`Clone ${line.product_name}`} title="Clone row" onClick={() => cloneDraftLine(line.id)}>
                      <i className="fa-solid fa-clone fa-fw" aria-hidden="true" />
                    </button>
                  </>
                )}
                <button type="button" className="qd-line-icon-btn qd-line-icon-btn-visible" aria-label={`Remove ${line.product_name}`} title="Delete row" onClick={() => removeDraftLine(line.id)}>
                  <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
                </button>
              </div>
            </div>
          </td>
          <td className="qd-col-qty">{renderQtyInput(line, included)}</td>
          <td className="qd-col-list-price">
            {included ? '—' : (
              <span className={`qd-currency-input-wrap${isEditingCurrency ? ' qd-currency-input-wrap--editing' : ''}`}>
                {isEditingCurrency && <span className="qd-currency-input-symbol" aria-hidden>$</span>}
                <input
                  className={`qd-grid-input qd-grid-input-discount${isEditingCurrency ? ' qd-grid-input-currency' : ''}`}
                  type="text"
                  inputMode="decimal"
                  value={isEditingCurrency ? currencyInputDrafts[key] : displayCurrencyValue(currentValue)}
                  onFocus={() => {
                    setCurrencyInputDrafts((prev) => ({ ...prev, [key]: formatCurrencyForEdit(currentValue) }));
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const next = parseCurrencyFromInput(raw);
                    setCurrencyInputDrafts((prev) => ({ ...prev, [key]: raw }));
                    updateDraftLineField(line.id, field, next);
                  }}
                  onBlur={(e) => {
                    const next = parseCurrencyFromInput(e.target.value);
                    updateDraftLineField(line.id, field, next);
                    setCurrencyInputDrafts((prev) => {
                      const clone = { ...prev };
                      delete clone[key];
                      return clone;
                    });
                  }}
                />
              </span>
            )}
          </td>
          <td className="qd-col-discount">{renderDiscountInput(line, included)}</td>
          <td className="qd-col-net-price">{included ? '—' : displayCurrency(line.net_price ?? line.list_price ?? 0)}</td>
          <td className="qd-col-amount"><span>{included ? '—' : displayCurrency(extended)}</span></td>
          <td className="qd-col-annual-price"><span>{included ? '—' : displayCurrency(extended * 12)}</span></td>
        </tr>
      );
    };

    const renderEditEntitlementRow = (line) => {
      const extended = calcLineExtended(line);
      const listField = 'list_price';
      const listKey = getCurrencyInputKey(line.id, listField);
      const isListEditing = Object.prototype.hasOwnProperty.call(currencyInputDrafts, listKey);
      const currentListValue = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : 0;

      return (
        <div key={line.id} className="qd-entitlement-row qd-entitlement-row--edit">
          <span className="qd-entitlement-cell qd-entitlement-cell-product">
            <span className="qd-entitlement-product-name">{line.product_name || 'Unnamed Product'}</span>
            <div className="qd-line-actions">
              <button type="button" className="qd-line-icon-btn qd-line-icon-btn-visible" aria-label={`Remove ${line.product_name}`} title="Delete row" onClick={() => removeDraftLine(line.id)}>
                <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
              </button>
            </div>
          </span>
          <span className="qd-entitlement-cell qd-entitlement-cell-qty">{renderQtyInput(line, false)}</span>
          <span className="qd-entitlement-cell qd-entitlement-cell-list-price">
            <span className={`qd-currency-input-wrap${isListEditing ? ' qd-currency-input-wrap--editing' : ''}`}>
              {isListEditing && <span className="qd-currency-input-symbol" aria-hidden>$</span>}
              <input
                className={`qd-grid-input qd-grid-input-discount${isListEditing ? ' qd-grid-input-currency' : ''}`}
                type="text"
                inputMode="decimal"
                value={isListEditing ? currencyInputDrafts[listKey] : displayCurrencyValue(currentListValue)}
                onFocus={() => {
                  setCurrencyInputDrafts((prev) => ({ ...prev, [listKey]: formatCurrencyForEdit(currentListValue) }));
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = parseCurrencyFromInput(raw);
                  setCurrencyInputDrafts((prev) => ({ ...prev, [listKey]: raw }));
                  updateDraftLineField(line.id, listField, next);
                }}
                onBlur={(e) => {
                  const next = parseCurrencyFromInput(e.target.value);
                  updateDraftLineField(line.id, listField, next);
                  setCurrencyInputDrafts((prev) => {
                    const clone = { ...prev };
                    delete clone[listKey];
                    return clone;
                  });
                }}
              />
            </span>
          </span>
          <span className="qd-entitlement-cell qd-entitlement-cell-discount">{renderDiscountInput(line, false)}</span>
          <span className="qd-entitlement-cell qd-entitlement-cell-net-price">{displayCurrency(line.net_price ?? line.list_price ?? 0)}</span>
          <span className="qd-entitlement-cell qd-entitlement-cell-monthly">{displayCurrency(extended)}</span>
          <span className="qd-entitlement-cell qd-entitlement-cell-annual">{displayCurrency(extended * 12)}</span>
        </div>
      );
    };

    const renderEditPlatformAddonRow = (line, showQtyColumn = false) => {
      const extended = calcLineExtended(line);
      const listField = 'list_price';
      const listKey = getCurrencyInputKey(line.id, listField);
      const isListEditing = Object.prototype.hasOwnProperty.call(currencyInputDrafts, listKey);
      const currentListValue = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : 0;

      return (
        <div key={line.id} className={`qd-platform-addon-row qd-platform-addon-row--edit${showQtyColumn ? ' qd-platform-addon-row--with-qty' : ''}`}>
          <span className="qd-platform-addon-cell qd-platform-addon-cell-product">
            <span className="qd-platform-addon-product-name">{line.product_name || 'Unnamed Product'}</span>
            <div className="qd-line-actions">
              <button type="button" className="qd-line-icon-btn qd-line-icon-btn-visible" aria-label={`Remove ${line.product_name}`} title="Delete row" onClick={() => removeDraftLine(line.id)}>
                <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
              </button>
            </div>
          </span>
          {showQtyColumn && <span className="qd-platform-addon-cell qd-platform-addon-cell-qty">{renderQtyInput(line, false)}</span>}
          <span className="qd-platform-addon-cell qd-platform-addon-cell-list-price">
            <span className={`qd-currency-input-wrap${isListEditing ? ' qd-currency-input-wrap--editing' : ''}`}>
              {isListEditing && <span className="qd-currency-input-symbol" aria-hidden>$</span>}
              <input
                className={`qd-grid-input qd-grid-input-discount${isListEditing ? ' qd-grid-input-currency' : ''}`}
                type="text"
                inputMode="decimal"
                value={isListEditing ? currencyInputDrafts[listKey] : displayCurrencyValue(currentListValue)}
                onFocus={() => {
                  setCurrencyInputDrafts((prev) => ({ ...prev, [listKey]: formatCurrencyForEdit(currentListValue) }));
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = parseCurrencyFromInput(raw);
                  setCurrencyInputDrafts((prev) => ({ ...prev, [listKey]: raw }));
                  updateDraftLineField(line.id, listField, next);
                }}
                onBlur={(e) => {
                  const next = parseCurrencyFromInput(e.target.value);
                  updateDraftLineField(line.id, listField, next);
                  setCurrencyInputDrafts((prev) => {
                    const clone = { ...prev };
                    delete clone[listKey];
                    return clone;
                  });
                }}
              />
            </span>
          </span>
          <span className="qd-platform-addon-cell qd-platform-addon-cell-discount">{renderDiscountInput(line, false)}</span>
          <span className="qd-platform-addon-cell qd-platform-addon-cell-net-price">{displayCurrency(line.net_price ?? line.list_price ?? 0)}</span>
          <span className="qd-platform-addon-cell qd-platform-addon-cell-monthly">{displayCurrency(extended)}</span>
          <span className="qd-platform-addon-cell qd-platform-addon-cell-annual">{displayCurrency(extended * 12)}</span>
        </div>
      );
    };

    const updateSupportSelection = (productId) => {
      updateDraft((d) => {
        const supportLines = d.line_items.filter((line) => !line.parent_line_id && getLineCategory(line) === 'support');
        const keepLine = supportLines[0] || null;
        const supportLineIds = new Set(supportLines.map((line) => line.id));
        const nextItems = d.line_items.filter((line) => !supportLineIds.has(line.id));

        if (productId) {
          const product = productsById.get(productId);
          if (product) {
            const nextLineBase = emptyLineItem(product, getPriceOverride(product.id));
            const nextLine = keepLine
              ? {
                ...nextLineBase,
                id: keepLine.id,
                sort_order: keepLine.sort_order,
                group_id: keepLine.group_id ?? null,
              }
              : {
                ...nextLineBase,
                sort_order: nextItems.length,
              };
            const insertionIndex = keepLine
              ? Math.max(0, Math.min(keepLine.sort_order ?? nextItems.length, nextItems.length))
              : nextItems.length;
            nextItems.splice(insertionIndex, 0, nextLine);
          }
        }

        d.line_items = nextItems.map((line, index) => ({ ...line, sort_order: index }));
        return d;
      });
    };

    const renderSupportTierSelector = (line) => {
      const options = getCategorySkuOptions('support', line?.product_id);
      return (
        <select
          id="qd-support-tier-select"
          className="qd-grid-input qd-grid-select qd-support-tier-select"
          value={line?.product_id || ''}
          onChange={(e) => updateSupportSelection(e.target.value || null)}
          disabled={options.length === 0}
        >
          <option value="">{options.length === 0 ? 'No Support options available' : 'No Support'}</option>
          {options.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      );
    };

    const renderSupportNetPriceInput = (line) => {
      const netField = 'net_price';
      const netKey = getCurrencyInputKey(line.id, netField);
      const isNetEditing = Object.prototype.hasOwnProperty.call(currencyInputDrafts, netKey);
      const currentNetValue = typeof line.net_price === 'number' && Number.isFinite(line.net_price)
        ? line.net_price
        : (line.list_price ?? 0);
      return (
        <span className={`qd-currency-input-wrap${isNetEditing ? ' qd-currency-input-wrap--editing' : ''}`}>
          {isNetEditing && <span className="qd-currency-input-symbol" aria-hidden>$</span>}
          <input
            className={`qd-grid-input qd-grid-input-discount${isNetEditing ? ' qd-grid-input-currency' : ''}`}
            type="text"
            inputMode="decimal"
            value={isNetEditing ? currencyInputDrafts[netKey] : displayCurrencyValue(currentNetValue)}
            onFocus={() => {
              setCurrencyInputDrafts((prev) => ({ ...prev, [netKey]: formatCurrencyForEdit(currentNetValue) }));
            }}
            onChange={(e) => {
              const raw = e.target.value;
              const nextNet = parseCurrencyFromInput(raw);
              const list = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : 0;
              const synced = syncDiscountFromAmount(list, Math.max(0, list - nextNet));
              setCurrencyInputDrafts((prev) => ({ ...prev, [netKey]: raw }));
              updateDraftLine(line.id, synced);
            }}
            onBlur={(e) => {
              const nextNet = parseCurrencyFromInput(e.target.value);
              const list = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : 0;
              const synced = syncDiscountFromAmount(list, Math.max(0, list - nextNet));
              updateDraftLine(line.id, synced);
              setCurrencyInputDrafts((prev) => {
                const clone = { ...prev };
                delete clone[netKey];
                return clone;
              });
            }}
          />
        </span>
      );
    };

    const renderEditableListPriceInput = (line) => {
      const listField = 'list_price';
      const listKey = getCurrencyInputKey(line.id, listField);
      const isListEditing = Object.prototype.hasOwnProperty.call(currencyInputDrafts, listKey);
      const currentListValue = typeof line.list_price === 'number' && Number.isFinite(line.list_price) ? line.list_price : 0;
      return (
        <span className={`qd-currency-input-wrap${isListEditing ? ' qd-currency-input-wrap--editing' : ''}`}>
          {isListEditing && <span className="qd-currency-input-symbol" aria-hidden>$</span>}
          <input
            className={`qd-grid-input qd-grid-input-discount${isListEditing ? ' qd-grid-input-currency' : ''}`}
            type="text"
            inputMode="decimal"
            value={isListEditing ? currencyInputDrafts[listKey] : displayCurrencyValue(currentListValue)}
            onFocus={() => {
              setCurrencyInputDrafts((prev) => ({ ...prev, [listKey]: formatCurrencyForEdit(currentListValue) }));
            }}
            onChange={(e) => {
              const raw = e.target.value;
              const next = parseCurrencyFromInput(raw);
              setCurrencyInputDrafts((prev) => ({ ...prev, [listKey]: raw }));
              updateDraftLineField(line.id, listField, next);
            }}
            onBlur={(e) => {
              const next = parseCurrencyFromInput(e.target.value);
              updateDraftLineField(line.id, listField, next);
              setCurrencyInputDrafts((prev) => {
                const clone = { ...prev };
                delete clone[listKey];
                return clone;
              });
            }}
          />
        </span>
      );
    };

    const renderEditSupportRow = (line) => {
      const extended = calcLineExtended(line);
      return (
        <div className="qd-support-row qd-support-row--edit">
          <span className="qd-support-cell qd-support-cell-product">
            {renderSupportTierSelector(line)}
          </span>
          <span className="qd-support-cell qd-support-cell-list-price">
            {renderEditableListPriceInput(line)}
          </span>
          <span className="qd-support-cell qd-support-cell-discount">{renderDiscountInput(line, false)}</span>
          <span className="qd-support-cell qd-support-cell-net-price">{renderSupportNetPriceInput(line)}</span>
          <span className="qd-support-cell qd-support-cell-monthly">{displayCurrency(extended)}</span>
          <span className="qd-support-cell qd-support-cell-annual">{displayCurrency(extended * 12)}</span>
        </div>
      );
    };

    const renderEditBasePackagePricingRow = (line) => {
      const extended = calcLineExtended(line);
      return (
        <div className="qd-support-row qd-support-row--edit qd-base-package-pricing-row">
          <span className="qd-support-cell qd-support-cell-product">
            <div className="qd-edit-product-cell">
              {renderSkuSelect({
                category: 'bundle',
                line,
                className: 'qd-grid-select--package qd-base-package-selector-inline',
                onSelect: (productId) => {
                  if (!productId) {
                    removeDraftLine(line.id);
                    return;
                  }
                  swapDraftLineProduct(line.id, productId);
                },
              })}
            </div>
          </span>
          <span className="qd-support-cell qd-support-cell-qty"><span className="cell-locked">1</span></span>
          <span className="qd-support-cell qd-support-cell-list-price">{renderEditableListPriceInput(line)}</span>
          <span className="qd-support-cell qd-support-cell-discount">{renderDiscountInput(line, false)}</span>
          <span className="qd-support-cell qd-support-cell-net-price">{renderSupportNetPriceInput(line)}</span>
          <span className="qd-support-cell qd-support-cell-monthly">{displayCurrency(extended)}</span>
          <span className="qd-support-cell qd-support-cell-annual">{displayCurrency(extended * 12)}</span>
        </div>
      );
    };

    const renderEmptyBasePackagePricingRow = () => (
      <div className="qd-support-row qd-support-row--empty qd-base-package-pricing-row">
        <span className="qd-support-cell qd-support-cell-product">
          <div className="qd-edit-product-cell">
            {renderSkuSelect({
              category: 'bundle',
              line: null,
              className: 'qd-grid-select--package qd-base-package-selector-inline',
              onSelect: (productId) => addDraftLineFromCategory('bundle', productId),
            })}
          </div>
        </span>
        <span className="qd-support-cell qd-support-cell-qty">—</span>
        <span className="qd-support-cell qd-support-cell-list-price">—</span>
        <span className="qd-support-cell qd-support-cell-discount">—</span>
        <span className="qd-support-cell qd-support-cell-net-price">—</span>
        <span className="qd-support-cell qd-support-cell-monthly">—</span>
        <span className="qd-support-cell qd-support-cell-annual">—</span>
      </div>
    );

    const renderEmptySupportRow = () => (
      <div className="qd-support-row qd-support-row--empty">
        <span className="qd-support-cell qd-support-cell-product">
          {renderSupportTierSelector(null)}
        </span>
        <span className="qd-support-cell qd-support-cell-list-price">—</span>
        <span className="qd-support-cell qd-support-cell-discount">—</span>
        <span className="qd-support-cell qd-support-cell-net-price">—</span>
        <span className="qd-support-cell qd-support-cell-monthly">—</span>
        <span className="qd-support-cell qd-support-cell-annual">—</span>
      </div>
    );

    const renderEditPackage = (line) => {
      const subs = getSubLines(items, line.id);
      const sections = groupBasePackageSectionsForDisplay(subs);
      return (
        <div key={line.id} className="qd-pkg-block qd-base-package-block">
          <div className="qd-pkg-table-head qd-support-table-head">
            <span className="qd-support-col-product">Product</span>
            <span className="qd-support-col-qty">QTY</span>
            <span className="qd-support-col-list-price">List Price</span>
            <span className="qd-support-col-discount">Discount</span>
            <span className="qd-support-col-net-price">Net Price</span>
            <span className="qd-support-col-monthly">Monthly Price</span>
            <span className="qd-support-col-annual">Annual Price</span>
          </div>
          <div className="qd-support-table-body qd-base-package-pricing-body">
            {renderEditBasePackagePricingRow(line)}
          </div>
          {sections.filter((s) => !s.isConfiguration).map((section) => (
            <div key={section.key} className="qd-base-config-section qd-base-config-section--included">
              <div className="qd-pkg-section-label qd-base-config-label">{section.label}</div>
              <div className="qd-base-config-body">
                {section.lines.map((sub) => (
                  <div key={sub.id} className="qd-entitlement-row qd-entitlement-row--edit qd-base-config-row">
                    <span className="qd-entitlement-cell qd-entitlement-cell-product">
                      <span className="qd-entitlement-product-name">{sub.product_name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {sections.filter((s) => s.isConfiguration).map((section) => (
            <div key={section.key} className="qd-base-config-section qd-base-config-section--configuration">
              <div className="qd-pkg-section-label qd-base-config-label">{section.label}</div>
              <div className="qd-base-config-body">
                {section.lines.map((sub) => (
                  <div key={sub.id} className="qd-entitlement-row qd-entitlement-row--edit qd-base-config-row">
                    <span className="qd-entitlement-cell qd-entitlement-cell-product">
                      <span className="qd-entitlement-product-name">{sub.product_name}</span>
                    </span>
                    <span className="qd-entitlement-cell qd-entitlement-cell-qty">{renderPackageQtyInput(sub)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    };

    const renderEmptyCategoryRow = (category) => (
      <tr key={`${category}-empty`}>
        <td className="line-td-product qd-col-product">
          <div className="qd-edit-product-cell">
            {MULTI_SELECT_CATEGORIES.has(category)
              ? <span className="cell-muted">Select one or more SKUs above</span>
              : renderSkuSelect({ category, line: null, onSelect: (productId) => addDraftLineFromCategory(category, productId) })}
          </div>
        </td>
        <td className="qd-col-qty">{category === 'support' ? <span className="cell-locked">0</span> : ''}</td>
        <td className="qd-col-list-price">—</td>
        <td className="qd-col-discount">—</td>
        <td className="qd-col-net-price">—</td>
        <td className="qd-col-amount">—</td>
        <td className="qd-col-annual-price">—</td>
      </tr>
    );

    const renderEmptyPackageRow = () => (
      <div className="qd-pkg-block qd-base-package-block qd-base-package-block--empty" key="bundle-empty">
        <div className="qd-pkg-table-head qd-support-table-head">
          <span className="qd-support-col-product">Product</span>
          <span className="qd-support-col-qty">QTY</span>
          <span className="qd-support-col-list-price">List Price</span>
          <span className="qd-support-col-discount">Discount</span>
          <span className="qd-support-col-net-price">Net Price</span>
          <span className="qd-support-col-monthly">Monthly Price</span>
          <span className="qd-support-col-annual">Annual Price</span>
        </div>
        <div className="qd-support-table-body qd-base-package-pricing-body">
          {renderEmptyBasePackagePricingRow()}
        </div>
      </div>
    );

    const renderEmptyEntitlementRow = () => (
      <div className="qd-entitlement-row qd-entitlement-row--empty" key="entitlements-empty">
        <span className="qd-entitlement-cell qd-entitlement-cell-product">
          <span className="cell-muted">Select one or more SKUs above</span>
        </span>
        <span className="qd-entitlement-cell qd-entitlement-cell-qty">—</span>
        <span className="qd-entitlement-cell qd-entitlement-cell-list-price">—</span>
        <span className="qd-entitlement-cell qd-entitlement-cell-discount">—</span>
        <span className="qd-entitlement-cell qd-entitlement-cell-net-price">—</span>
        <span className="qd-entitlement-cell qd-entitlement-cell-monthly">—</span>
        <span className="qd-entitlement-cell qd-entitlement-cell-annual">—</span>
      </div>
    );

    const renderEmptyPlatformAddonRow = (showQtyColumn = false) => (
      <div className={`qd-platform-addon-row qd-platform-addon-row--empty${showQtyColumn ? ' qd-platform-addon-row--with-qty' : ''}`} key="platform-addons-empty">
        <span className="qd-platform-addon-cell qd-platform-addon-cell-product">
          <span className="cell-muted">Select one or more SKUs above</span>
        </span>
        {showQtyColumn && <span className="qd-platform-addon-cell qd-platform-addon-cell-qty">—</span>}
        <span className="qd-platform-addon-cell qd-platform-addon-cell-list-price">—</span>
        <span className="qd-platform-addon-cell qd-platform-addon-cell-discount">—</span>
        <span className="qd-platform-addon-cell qd-platform-addon-cell-net-price">—</span>
        <span className="qd-platform-addon-cell qd-platform-addon-cell-monthly">—</span>
        <span className="qd-platform-addon-cell qd-platform-addon-cell-annual">—</span>
      </div>
    );

    return (
      <div className="qd-lines-card">
        <div className="qd-grouped-cards">
          {editCategoryGroups.map((group) => (
            <div
              key={group.category}
              className={`qd-category-card${group.category === 'bundle' ? ' qd-category-card--base-package' : ''}${group.category === 'support' ? ' qd-category-card--support' : ''}`}
            >
              <div className="qd-category-card-header">
                <span className="qd-category-card-title">{group.label}</span>
              </div>
              {group.category === 'bundle' ? (
                <div className="qd-pkg-table qd-base-package-table">
                  {group.lines.length > 0 ? group.lines.map((line) => renderEditPackage(line)) : renderEmptyPackageRow()}
                </div>
              ) : group.category === 'support' ? (
                <div className="qd-pkg-table qd-support-table">
                  <div className="qd-pkg-table-head qd-support-table-head">
                    <span className="qd-support-col-product">Product</span>
                    <span className="qd-support-col-list-price">List Price</span>
                    <span className="qd-support-col-discount">Discount</span>
                    <span className="qd-support-col-net-price">Net Price</span>
                    <span className="qd-support-col-monthly">Monthly Price</span>
                    <span className="qd-support-col-annual">Annual Price</span>
                  </div>
                  <div className="qd-support-table-body">
                    {group.lines.length > 0 ? renderEditSupportRow(group.lines[0]) : renderEmptySupportRow()}
                  </div>
                </div>
              ) : group.category === 'entitlements' ? (
                <div className="qd-pkg-table qd-entitlements-table">
                  <div className="qd-category-picker-row qd-category-picker-row--entitlements">
                    {renderCategoryMultiSelect(group.category, group.lines, group.label)}
                  </div>
                  <div className="qd-pkg-table-head qd-entitlements-table-head">
                    <span className="qd-support-col-product">Product</span>
                    <span className="qd-support-col-qty">QTY</span>
                    <span className="qd-support-col-list-price">List Price</span>
                    <span className="qd-support-col-discount">Discount</span>
                    <span className="qd-support-col-net-price">Net Price</span>
                    <span className="qd-support-col-monthly">Monthly Price</span>
                    <span className="qd-support-col-annual">Annual Price</span>
                  </div>
                  <div className="qd-entitlements-table-body">
                    {group.lines.length > 0 ? group.lines.map((line) => renderEditEntitlementRow(line)) : renderEmptyEntitlementRow()}
                  </div>
                </div>
              ) : group.category === 'addon' ? (
                (() => {
                  const showQtyColumn = group.lines.some((line) => shouldShowPlatformAddonQty(line));
                  return (
                    <div className="qd-pkg-table qd-platform-addons-table">
                      <div className="qd-category-picker-row qd-category-picker-row--platform-addons">
                        {renderCategoryMultiSelect(group.category, group.lines, group.label)}
                      </div>
                      <div className={`qd-pkg-table-head qd-platform-addons-table-head${showQtyColumn ? ' qd-platform-addons-table-head--with-qty' : ''}`}>
                        <span className="qd-platform-addon-col-product">Product</span>
                        {showQtyColumn && <span className="qd-platform-addon-col-qty">Qty</span>}
                        <span className="qd-platform-addon-col-list-price">List Price</span>
                        <span className="qd-platform-addon-col-discount">Discount</span>
                        <span className="qd-platform-addon-col-net-price">Net Price</span>
                        <span className="qd-platform-addon-col-monthly">Monthly Price</span>
                        <span className="qd-platform-addon-col-annual">Annual Price</span>
                      </div>
                      <div className="qd-platform-addons-table-body">
                        {group.lines.length > 0
                          ? group.lines.map((line) => renderEditPlatformAddonRow(line, showQtyColumn))
                          : renderEmptyPlatformAddonRow(showQtyColumn)}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  {MULTI_SELECT_CATEGORIES.has(group.category) && (
                    <div className="qd-category-picker-row">
                      {renderCategoryMultiSelect(group.category, group.lines, group.label)}
                    </div>
                  )}
                  <table className="data-table line-table">
                    <colgroup>
                      <col className="qd-col-product" />
                      <col className="qd-col-qty" />
                      <col className="qd-col-list-price" />
                      <col className="qd-col-discount" />
                      <col className="qd-col-net-price" />
                      <col className="qd-col-amount" />
                      <col className="qd-col-annual-price" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="qd-col-product">Product</th>
                        <th className="qd-col-qty">Qty</th>
                        <th className="qd-col-list-price">List Price</th>
                        <th className="qd-col-discount">Discount</th>
                        <th className="qd-col-net-price">Net Price</th>
                        <th className="qd-col-amount">Monthly Price</th>
                        <th className="qd-col-annual-price">Annual Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.lines.length > 0
                        ? group.lines.map((line) => renderEditStandalone(line, group.category))
                        : renderEmptyCategoryRow(group.category)}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFooterInfo = (source) => {
    if (!source.comments && !source.prepared_by) return null;
    return (
      <div className="qd-footer-info">
        {source.prepared_by && <div className="qd-footer-row"><span className="qd-footer-label">Prepared by</span><span className="qd-footer-value">{source.prepared_by}</span></div>}
        {source.comments && <div className="qd-footer-row"><span className="qd-footer-label">Comments</span><span className="qd-footer-value">{source.comments}</span></div>}
      </div>
    );
  };

  const renderEntitlementsSummaryTable = () => {
    const rows = [
      { label: 'Credits', data: entitlementSummary.credits, overageField: 'overage_rate_credits', unitLabel: '/1,500 Credits', unitDivisor: 1500 },
      { label: 'Seats', data: entitlementSummary.seats, overageField: 'overage_rate_seats', unitLabel: '/Seat/Month', unitDivisor: 1 },
    ];
    return (
      <table className="qd-entitlements-summary-table">
        <thead>
          <tr>
            <th className="qd-es-th qd-es-th--product"></th>
            <th className="qd-es-th qd-es-th--qty">QTY</th>
            <th className="qd-es-th qd-es-th--rate">COMMITTED RATE</th>
            <th className="qd-es-th qd-es-th--rate">OVERAGE RATE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const totalQty = row.data.includedQty + row.data.additionalQty;
            const committedRate = row.data.additionalQty > 0
              ? fmtCurrency((row.data.committedPrice / row.data.additionalQty) * row.unitDivisor)
              : '—';
            return (
              <tr key={row.label}>
                <td className="qd-es-cell qd-es-cell--product">{row.label}</td>
                <td className="qd-es-cell qd-es-cell--qty">{fmtQty(totalQty)}</td>
                <td className="qd-es-cell qd-es-cell--rate">
                  <span className="qd-es-rate-value">{committedRate}</span>
                  {committedRate !== '—' && <span className="qd-es-rate-unit">{row.unitLabel}</span>}
                </td>
                <td className="qd-es-cell qd-es-cell--rate">
                  {isEditing
                    ? <input className="qd-overage-input" value={q[row.overageField] || ''} placeholder="$0.00" onChange={(e) => handleFieldChange(row.overageField, e.target.value)} onBlur={(e) => handleFieldBlur(row.overageField, e.target.value)} />
                    : <>
                        <span className="qd-es-rate-value">{q[row.overageField] || '—'}</span>
                        {q[row.overageField] && <span className="qd-es-rate-unit">{row.unitLabel}</span>}
                      </>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const renderConfirmModal = () => (
    <div className="modal-overlay" onClick={() => setConfirm(null)}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">Confirm</div>
        <div className="confirm-message">{confirm.msg}</div>
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn-save" onClick={confirm.fn}>{confirm.label || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );

  const isEditing = mode === 'edit';
  const canEditLines = ['draft', 'draft_revision'].includes(q.status);

  const groupLinesByCategory = (items) => {
    const hasPackage = items.some((l) => l.is_package);
    const order = hasPackage ? CARD_ORDER_WITH_PACKAGE : CARD_ORDER_NO_PACKAGE;
    const topLevel = items.filter((l) => !l.parent_line_id);
    const groups = {};
    topLevel.forEach((line) => {
      const cat = line.is_package ? 'bundle' : (line.product_type || 'platform');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(line);
    });
    return order.filter((cat) => groups[cat] && groups[cat].length > 0).map((cat) => ({
      category: cat,
      label: getCategoryCardLabel(cat, hasPackage),
      lines: groups[cat],
    }));
  };

  return (
    <div className={`quote-detail${isEditing ? ' quote-detail--editing' : ''}`}>
      <div className="qd-header">
        <button className="back-btn" onClick={onBack}>Back to Quotes</button>
        <div className="qd-header-info" style={{ flex: 1 }}>
          <div className="qd-quote-number">{q.quote_number}</div>
          <div className="qd-header-title-row">
            {editingTitle ? (
              <input autoFocus type="text" value={q.name} placeholder="Quote name"
                onChange={(e) => setQ((prev) => ({ ...prev, name: e.target.value }))}
                onBlur={(e) => { setEditingTitle(false); persistQuote((prev) => ({ ...prev, name: e.target.value })); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="qd-title-input" />
            ) : (
              <h1 className="qd-title" onClick={() => setEditingTitle(true)} style={{ cursor: 'pointer', flex: 1 }}>{q.name || 'Untitled Quote'}</h1>
            )}
            {!isEditing && (
              <div className="qd-status-eyebrow" style={{ color: STATUS_EYEBROW_COLORS[q.status] || '#6b7280' }}>
                {(STATUS_META[q.status] || STATUS_META.draft).label}
              </div>
            )}
          </div>
        </div>
      </div>

      {q.status === 'archived' && <div className="qd-archived-banner">This quote is archived</div>}

      {validationErrors && (
        <div className="qd-validation-errors">
          <div className="qd-validation-errors-title">Cannot submit — missing required fields:</div>
          <ul>{validationErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
        </div>
      )}

      <div className="qd-action-bar">
        {isEditing ? (
          <div className="qd-action-group">
            <button className="qd-action-btn" onClick={cancelEdit}>Cancel</button>
            <button className="qd-action-btn qd-action-btn-primary" onClick={saveEdit}>Save</button>
          </div>
        ) : (
          <div className="qd-action-group">

            {q.status === 'draft' && (
              <>
                <button className="qd-action-btn" onClick={enterEditMode}>{q.line_items.length === 0 ? 'Add Lines' : 'Edit Lines'}</button>
                <button className="qd-action-btn" onClick={() => generateQuotePDF(q, products, settings, { preview: true })}>Preview PDF</button>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('sent')}>Send to Customer</button>
              </>
            )}

            {q.status === 'sent' && (
              <>
                <button className="qd-action-btn" onClick={() => { setFeedbackText(q.comments || ''); setFeedbackModal(true); }}>Record Feedback</button>
                <button className="qd-action-btn" onClick={() => { const cloned = onClone(q); if (cloned) persistQuote(() => ({ ...cloned, name: (q.name || 'Quote') + ' — Scenario', status: 'draft' })); }}>Clone as Scenario</button>
                <button className="qd-action-btn" onClick={() => generateQuotePDF(q, products, settings)}>Download PDF</button>
                <button className="qd-action-btn" onClick={() => changeStatus('draft')}>Revise Quote</button>
              </>
            )}

            {q.status === 'draft_revision' && (
              <>
                <button className="qd-action-btn" onClick={enterEditMode}>{q.line_items.length === 0 ? 'Add Lines' : 'Edit Lines'}</button>
                <button className="qd-action-btn" onClick={() => generateQuotePDF(q, products, settings, { preview: true })}>Preview PDF</button>
                <button className="qd-action-btn" onClick={() => { persistQuote((prev) => ({ ...prev, is_primary: true })); showToast('Marked as primary quote'); }}>Mark as Primary</button>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('sent')}>Send to Customer</button>
              </>
            )}

            {q.status === 'ready_to_submit' && (
              <button className="qd-action-btn qd-action-btn-teal" onClick={() => {
                const errors = validateForSubmission();
                if (errors.length > 0) { setValidationErrors(errors); return; }
                setValidationErrors(null);
                changeStatus('pending_approval');
              }}>Submit to Deal Desk</button>
            )}

            {q.status === 'pending_approval' && (
              <>
                <button className="qd-action-btn" onClick={() => showToast('Submission details coming soon')}>View Submission</button>
                <button className="qd-action-btn" onClick={() => setConfirm({ msg: 'Are you sure? This will pull the quote back to Draft.', label: 'Withdraw', fn: () => { changeStatus('draft'); setConfirm(null); } })}>Withdraw Submission</button>
              </>
            )}

            {q.status === 'approved' && (
              <>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('converted')}>Convert to Order</button>
                <button className="qd-action-btn" onClick={() => generateQuotePDF(q, products, settings)}>Download Final PDF</button>
              </>
            )}

            {q.status === 'rejected' && (
              <>
                <button className="qd-action-btn" onClick={() => setDdNotesModal(true)}>View DD Notes</button>
                <button className="qd-action-btn qd-action-btn-primary" onClick={() => changeStatus('draft')}>Revise Quote</button>
              </>
            )}

            {q.status === 'converted' && (
              <>
                <button className="qd-action-btn" onClick={() => showToast('Order view coming soon')}>View Order</button>
                <button className="qd-action-btn" onClick={() => generateQuotePDF(q, products, settings)}>Download Executed Quote PDF</button>
              </>
            )}

            {q.status === 'archived' && (
              <button className="qd-action-btn" onClick={() => setConfirm({ msg: 'Restore this quote as a Draft? It will become editable again.', label: 'Restore', fn: () => { changeStatus('draft'); setConfirm(null); } })}>Restore as Draft</button>
            )}

            {['draft', 'sent', 'draft_revision', 'ready_to_submit', 'pending_approval', 'rejected', 'archived'].includes(q.status) && (
              <div className="qd-more-wrap" ref={moreRef}>
                <button className="qd-more-btn qd-more-btn--reset" onClick={() => setShowMoreMenu(!showMoreMenu)}>···</button>
                {showMoreMenu && (
                  <div className="qd-more-menu">
                    {q.status === 'draft' && (<><button className="qd-more-item" onClick={() => { setShowMoreMenu(false); onClone(q); }}>Clone Quote</button><button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this quote? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>Archive</button></>)}
                    {q.status === 'sent' && (<><button className="qd-more-item" onClick={() => { setShowMoreMenu(false); onClone(q); }}>Clone Quote</button><button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this quote? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>Archive</button></>)}
                    {q.status === 'draft_revision' && (<button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this scenario? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>Archive Scenario</button>)}
                    {q.status === 'ready_to_submit' && (<><button className="qd-more-item" onClick={() => { setShowMoreMenu(false); generateQuotePDF(q, products, settings); }}>Download PDF</button><button className="qd-more-item" onClick={() => { setShowMoreMenu(false); changeStatus('draft'); }}>Revise Quote</button></>)}
                    {q.status === 'pending_approval' && (<button className="qd-more-item" onClick={() => { setShowMoreMenu(false); generateQuotePDF(q, products, settings); }}>Download PDF</button>)}
                    {q.status === 'rejected' && (<button className="qd-more-item" onClick={() => { setShowMoreMenu(false); setConfirm({ msg: 'Archive this quote? It will become read-only.', label: 'Archive', fn: () => { changeStatus('archived'); setConfirm(null); } }); }}>Archive</button>)}
                    {q.status === 'archived' && (<button className="qd-more-item" onClick={() => { setShowMoreMenu(false); generateQuotePDF(q, products, settings); }}>Download PDF</button>)}
                    <button className="qd-more-item qd-more-danger" onClick={() => { setShowMoreMenu(false); onDelete(q.id); }}>Delete Quote</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {renderDetailCards(q)}

      <div className={`qd-lines-section${isEditing ? ' qd-lines-section--editing' : ''}`}>
        {isEditing ? renderEditTable() : (
          <>
            {q.line_items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-numeral">0</div>
                <div className="empty-state-title">No line items</div>
                <div className="empty-state-text">Click "Edit Lines" to add products to this quote</div>
              </div>
            ) : (
              <div className="qd-grouped-cards">
                {groupLinesByCategory(q.line_items).map((group) => (
                  <div
                    key={group.category}
                    className={`qd-category-card${group.category === 'bundle' ? ' qd-category-card--base-package' : ''}${group.category === 'support' ? ' qd-category-card--support' : ''}`}
                  >
                    <div className="qd-category-card-header">
                      <span className="qd-category-card-title">{group.label}</span>
                    </div>
                    {group.category === 'bundle' ? (
                      <div className="qd-pkg-table qd-base-package-table">
                        {group.lines.map((line) => {
                          const subs = getSubLines(q.line_items, line.id);
                          const sections = groupBasePackageSectionsForDisplay(subs);
                          const extended = calcLineExtended(line);
                          return (
                            <div key={line.id} className="qd-pkg-block qd-base-package-block">
                              <div className="qd-pkg-table-head qd-support-table-head">
                                <span className="qd-support-col-product">Product</span>
                                <span className="qd-support-col-qty">QTY</span>
                                <span className="qd-support-col-list-price">List Price</span>
                                <span className="qd-support-col-discount">Discount</span>
                                <span className="qd-support-col-net-price">Net Price</span>
                                <span className="qd-support-col-monthly">Monthly Price</span>
                                <span className="qd-support-col-annual">Annual Price</span>
                              </div>
                              <div className="qd-support-table-body qd-base-package-pricing-body">
                                <div className="qd-support-row">
                                  <span className="qd-support-cell qd-support-cell-product">
                                    <span className="cell-name">{line.product_name}</span>
                                  </span>
                                  <span className="qd-support-cell qd-support-cell-qty">1</span>
                                  <span className="qd-support-cell qd-support-cell-list-price">{displayCurrency(line.list_price ?? 0)}</span>
                                  <span className="qd-support-cell qd-support-cell-discount">{displayCurrency(line.discount_amount ?? 0)}</span>
                                  <span className="qd-support-cell qd-support-cell-net-price">{displayCurrency(line.net_price ?? line.list_price ?? 0)}</span>
                                  <span className="qd-support-cell qd-support-cell-monthly">{displayCurrency(extended)}</span>
                                  <span className="qd-support-cell qd-support-cell-annual">{displayCurrency(extended * 12)}</span>
                                </div>
                              </div>
                              {sections.filter((s) => !s.isConfiguration).map((section) => (
                                <div key={section.key} className="qd-base-config-section qd-base-config-section--included">
                                  <div className="qd-pkg-section-label qd-base-config-label">{section.label}</div>
                                  <div className="qd-base-config-body">
                                    {section.lines.map((sub) => (
                                      <div key={sub.id} className="qd-entitlement-row qd-base-config-row">
                                        <span className="qd-entitlement-cell qd-entitlement-cell-product">
                                          <span className="qd-entitlement-product-name">{sub.product_name}</span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {sections.filter((s) => s.isConfiguration).map((section) => (
                                <div key={section.key} className="qd-base-config-section qd-base-config-section--configuration">
                                  <div className="qd-pkg-section-label qd-base-config-label">{section.label}</div>
                                  <div className="qd-base-config-body">
                                    {section.lines.map((sub) => (
                                      <div key={sub.id} className="qd-entitlement-row qd-base-config-row">
                                        <span className="qd-entitlement-cell qd-entitlement-cell-product">
                                          <span className="qd-entitlement-product-name">{sub.product_name}</span>
                                        </span>
                                        <span className="qd-entitlement-cell qd-entitlement-cell-qty">
                                          {isPackageComponentQtyVisible(sub) ? fmtQty(sub.quantity ?? 1) : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : group.category === 'support' ? (
                      <div className="qd-pkg-table qd-support-table qd-support-table--readonly">
                        <div className="qd-pkg-table-head qd-support-table-head">
                          <span className="qd-support-col-product">Product</span>
                          <span className="qd-support-col-list-price">List Price</span>
                          <span className="qd-support-col-discount">Discount</span>
                          <span className="qd-support-col-net-price">Net Price</span>
                          <span className="qd-support-col-monthly">Monthly Price</span>
                          <span className="qd-support-col-annual">Annual Price</span>
                        </div>
                        <div className="qd-support-table-body">
                          {group.lines[0] ? (
                            <div className="qd-support-row">
                              <span className="qd-support-cell qd-support-cell-product">
                                <span className="cell-name">{group.lines[0].product_name}</span>
                              </span>
                              <span className="qd-support-cell qd-support-cell-list-price">{displayCurrency(group.lines[0].list_price ?? 0)}</span>
                              <span className="qd-support-cell qd-support-cell-discount">{displayCurrency(group.lines[0].discount_amount ?? 0)}</span>
                              <span className="qd-support-cell qd-support-cell-net-price">{displayCurrency(group.lines[0].net_price ?? group.lines[0].list_price ?? 0)}</span>
                              <span className="qd-support-cell qd-support-cell-monthly">{displayCurrency(calcLineExtended(group.lines[0]))}</span>
                              <span className="qd-support-cell qd-support-cell-annual">{displayCurrency(calcLineExtended(group.lines[0]) * 12)}</span>
                            </div>
                          ) : (
                            <div className="qd-support-row qd-support-row--empty">
                              <span className="qd-support-cell qd-support-cell-product">
                                <span className="cell-muted">No support tier selected</span>
                              </span>
                              <span className="qd-support-cell qd-support-cell-list-price">—</span>
                              <span className="qd-support-cell qd-support-cell-discount">—</span>
                              <span className="qd-support-cell qd-support-cell-net-price">—</span>
                              <span className="qd-support-cell qd-support-cell-monthly">—</span>
                              <span className="qd-support-cell qd-support-cell-annual">—</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : group.category === 'entitlements' ? (
                      <div className="qd-pkg-table qd-entitlements-table qd-entitlements-table--readonly">
                        <div className="qd-pkg-table-head qd-entitlements-table-head">
                          <span className="qd-support-col-product">Product</span>
                          <span className="qd-support-col-qty">QTY</span>
                          <span className="qd-support-col-list-price">List Price</span>
                          <span className="qd-support-col-discount">Discount</span>
                          <span className="qd-support-col-net-price">Net Price</span>
                          <span className="qd-support-col-monthly">Monthly Price</span>
                          <span className="qd-support-col-annual">Annual Price</span>
                        </div>
                        <div className="qd-entitlements-table-body">
                          {group.lines.map((line) => {
                            const extended = calcLineExtended(line);
                            return (
                              <div key={line.id} className="qd-entitlement-row">
                                <span className="qd-entitlement-cell qd-entitlement-cell-product">
                                  <span className="cell-name">{line.product_name}</span>
                                </span>
                                <span className="qd-entitlement-cell qd-entitlement-cell-qty">{fmtQty(getEffectiveLineQuantity(line))}</span>
                                <span className="qd-entitlement-cell qd-entitlement-cell-list-price">{displayCurrency(line.list_price ?? 0)}</span>
                                <span className="qd-entitlement-cell qd-entitlement-cell-discount">{displayCurrency(line.discount_amount ?? 0)}</span>
                                <span className="qd-entitlement-cell qd-entitlement-cell-net-price">{displayCurrency(line.net_price ?? line.list_price ?? 0)}</span>
                                <span className="qd-entitlement-cell qd-entitlement-cell-monthly">{displayCurrency(extended)}</span>
                                <span className="qd-entitlement-cell qd-entitlement-cell-annual">{displayCurrency(extended * 12)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : group.category === 'addon' ? (
                      (() => {
                        const showQtyColumn = group.lines.some((line) => shouldShowPlatformAddonQty(line));
                        return (
                          <div className="qd-pkg-table qd-platform-addons-table qd-platform-addons-table--readonly">
                            <div className={`qd-pkg-table-head qd-platform-addons-table-head${showQtyColumn ? ' qd-platform-addons-table-head--with-qty' : ''}`}>
                              <span className="qd-platform-addon-col-product">Product</span>
                              {showQtyColumn && <span className="qd-platform-addon-col-qty">Qty</span>}
                              <span className="qd-platform-addon-col-list-price">List Price</span>
                              <span className="qd-platform-addon-col-discount">Discount</span>
                              <span className="qd-platform-addon-col-net-price">Net Price</span>
                              <span className="qd-platform-addon-col-monthly">Monthly Price</span>
                              <span className="qd-platform-addon-col-annual">Annual Price</span>
                            </div>
                            <div className="qd-platform-addons-table-body">
                              {group.lines.map((line) => {
                                const extended = calcLineExtended(line);
                                return (
                                  <div key={line.id} className={`qd-platform-addon-row${showQtyColumn ? ' qd-platform-addon-row--with-qty' : ''}`}>
                                    <span className="qd-platform-addon-cell qd-platform-addon-cell-product">
                                      <span className="cell-name">{line.product_name}</span>
                                    </span>
                                    {showQtyColumn && <span className="qd-platform-addon-cell qd-platform-addon-cell-qty">{fmtQty(getEffectiveLineQuantity(line))}</span>}
                                    <span className="qd-platform-addon-cell qd-platform-addon-cell-list-price">{displayCurrency(line.list_price ?? 0)}</span>
                                    <span className="qd-platform-addon-cell qd-platform-addon-cell-discount">{displayCurrency(line.discount_amount ?? 0)}</span>
                                    <span className="qd-platform-addon-cell qd-platform-addon-cell-net-price">{displayCurrency(line.net_price ?? line.list_price ?? 0)}</span>
                                    <span className="qd-platform-addon-cell qd-platform-addon-cell-monthly">{displayCurrency(extended)}</span>
                                    <span className="qd-platform-addon-cell qd-platform-addon-cell-annual">{displayCurrency(extended * 12)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <table className="data-table line-table">
                        <colgroup>
                          <col className="qd-col-product" />
                          <col className="qd-col-qty" />
                          <col className="qd-col-list-price" />
                          <col className="qd-col-discount" />
                          <col className="qd-col-net-price" />
                          <col className="qd-col-amount" />
                          <col className="qd-col-annual-price" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="qd-col-product">Product</th>
                            <th className="qd-col-qty">Qty</th>
                            <th className="qd-col-list-price">List Price</th>
                            <th className="qd-col-discount">Discount</th>
                            <th className="qd-col-net-price">Net Price</th>
                            <th className="qd-col-amount">Monthly Price</th>
                            <th className="qd-col-annual-price">Annual Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line) => {
                            const unitType = line.unit_type || 'flat';
                            const extended = calcLineExtended(line);
                            return (
                              <tr key={line.id}>
                                <td className="line-td-product qd-col-product"><div className="cell-name">{line.product_name}</div></td>
                                <td className="qd-col-qty">{!isSupportLine(line) && getEffectiveLineQuantity(line) > 1 ? fmtQty(getEffectiveLineQuantity(line)) : ''}</td>
                                <td className="qd-col-list-price">{isIncluded(unitType) ? '—' : displayCurrency(line.list_price ?? 0)}</td>
                                <td className="qd-col-discount">{isIncluded(unitType) ? '' : displayCurrency(line.discount_amount ?? 0)}</td>
                                <td className="qd-col-net-price">{isIncluded(unitType) ? '—' : displayCurrency(line.net_price ?? line.list_price ?? 0)}</td>
                                <td className="qd-col-amount"><span>{isIncluded(unitType) ? '—' : displayCurrency(extended)}</span></td>
                                <td className="qd-col-annual-price"><span>{isIncluded(unitType) ? '—' : displayCurrency(extended * 12)}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="qd-overage-section qd-summary-row">
        <div className="qd-overage-card">
          <div className="qd-category-card-header qd-detail-card-header">
            <span className="qd-category-card-title">Entitlements Summary</span>
          </div>
          <div className="qd-overage-body">
            {renderEntitlementsSummaryTable()}
          </div>
        </div>
        <div className="qd-overage-card qd-pricing-summary-card">
          <div className="qd-category-card-header qd-detail-card-header">
            <span className="qd-category-card-title">Summary</span>
          </div>
          <div className="qd-overage-body qd-pricing-summary-body">
            <div className="qd-pricing-summary-group">
              <div className="qd-pricing-summary-row">
                <span className="qd-pricing-summary-label">Subtotal</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.preDiscountMonthly)}</span>
              </div>
              <div className="qd-pricing-summary-row">
                <span className="qd-pricing-summary-label">Discount</span>
                {isEditing
                  ? <input className="qd-overage-input" type="number" min="0" max="100" step="any" value={draft.header_discount || ''} placeholder="0%" onChange={(e) => updateDraft((d) => ({ ...d, header_discount: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} />
                  : <span className="qd-pricing-summary-value">{totals.preDiscountMonthly - totals.monthly > 0 ? `−${fmtCurrency(totals.preDiscountMonthly - totals.monthly)}` : '—'}</span>}
              </div>
            </div>
            <div className="qd-pricing-summary-divider" />
            <div className="qd-pricing-summary-group">
              <div className="qd-pricing-summary-row qd-pricing-summary-row--bold">
                <span className="qd-pricing-summary-label">Net Total</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.monthly)}</span>
              </div>
            </div>
            <div className="qd-pricing-summary-divider" />
            <div className="qd-pricing-summary-group">
              <div className="qd-pricing-summary-row qd-pricing-summary-row--bold">
                <span className="qd-pricing-summary-label">Total Monthly Price</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.monthly)}</span>
              </div>
              <div className="qd-pricing-summary-row qd-pricing-summary-row--bold">
                <span className="qd-pricing-summary-label">Total Annual Price</span>
                <span className="qd-pricing-summary-value">{fmtCurrency(totals.annual)}</span>
              </div>
              <div className="qd-pricing-summary-row">
                <span className="qd-pricing-summary-label">Effective Discount</span>
                <span className="qd-pricing-summary-value">{displayPercent(totals.effectiveDiscountPercent)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>{renderFooterInfo(q)}</div>

      <div className="qd-activity-section">
        <div className="qd-footer-label" style={{ marginBottom: '12px' }}>Activity</div>
        <div className="qd-activity-timeline">
          {[...(q.activity_log || [])].reverse().map((entry, i, arr) => {
            let dotColor = '#05BDBA';
            let text = '';
            if (entry.type === 'status_change') {
              dotColor = ACTIVITY_DOT_COLORS[entry.to_status] || '#6b7280';
              const fromLabel = (STATUS_META[entry.from_status] || {}).label || entry.from_status;
              const toLabel = (STATUS_META[entry.to_status] || {}).label || entry.to_status;
              text = `${entry.actor || 'System'} moved quote from ${fromLabel} → ${toLabel}`;
            } else if (entry.type === 'created') {
              dotColor = '#05BDBA';
              text = `Quote created${entry.actor ? ` by ${entry.actor}` : ''}`;
            } else if (entry.type === 'note') {
              dotColor = '#FBB13D';
              const noteText = entry.note || '';
              text = `Feedback recorded: ${noteText.length > 80 ? noteText.slice(0, 80) + '…' : noteText}`;
            }
            const isLast = i === arr.length - 1;
            return (
              <div key={i} className="qd-activity-entry">
                <div className="qd-activity-dot-col">
                  <div className="qd-activity-dot" style={{ background: dotColor }} />
                  {!isLast && <div className="qd-activity-line" />}
                </div>
                <div className="qd-activity-content">
                  <span className="qd-activity-text">{text}</span>
                  <span className="qd-activity-time">{relativeTime(entry.timestamp)}</span>
                </div>
              </div>
            );
          })}
          {(!q.activity_log || q.activity_log.length === 0) && <div className="text-empty">No activity recorded.</div>}
        </div>
      </div>

      {feedbackModal && (
        <div className="modal-overlay" onClick={() => setFeedbackModal(false)}>
          <div className="modal modal-theme-quotes modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Customer Feedback</div>
            <div className="modal-section">
              <div className="field">
                <label className="field-label">Revision Notes</label>
                <textarea className="field-textarea field-textarea--tall" value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="Enter customer feedback and revision notes..." autoFocus />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setFeedbackModal(false)}>Cancel</button>
              <button className="btn-save" onClick={() => {
                const now = new Date().toISOString();
                persistQuote((prev) => ({ ...prev, comments: feedbackText, status: 'draft_revision', activity_log: [...(prev.activity_log || []), { type: 'note', timestamp: now, note: feedbackText, actor: prev.prepared_by || '' }, { type: 'status_change', from_status: prev.status, to_status: 'draft_revision', timestamp: now, actor: prev.prepared_by || '' }] }));
                setFeedbackModal(false);
              }}>Save Feedback</button>
            </div>
          </div>
        </div>
      )}

      {ddNotesModal && (
        <div className="modal-overlay" onClick={() => setDdNotesModal(false)}>
          <div className="modal modal-theme-quotes modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Deal Desk Notes</div>
            <div className="modal-section">
              <div className="qd-notes-body">{q.comments || 'No notes recorded.'}</div>
            </div>
            <div className="modal-actions"><button className="btn-cancel" onClick={() => setDdNotesModal(false)}>Close</button></div>
          </div>
        </div>
      )}

      {toast && <div className="qd-toast">{toast}</div>}
      {confirm && renderConfirmModal()}
    </div>
  );
}
