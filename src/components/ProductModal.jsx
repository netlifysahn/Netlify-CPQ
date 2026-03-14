import React, { useMemo, useState } from 'react';
import {
  PACKAGE_PRICING_DISPLAYS,
  PACKAGE_QTY_BEHAVIORS,
  PACKAGE_QUOTE_EDIT_MODES,
  PRICE_UNITS,
  PRICING_METHODS,
  PRODUCT_TYPES,
  TERM_BEHAVIORS,
  TYPE_LABELS,
  UNIT_LABELS,
  emptyProduct,
  getProductCategory,
  getProductPackageComponents,
  isBundleProduct,
  packageComponentToLegacyMember,
} from '../data/catalog';
import {
  formatIntegerForEdit,
  formatIntegerWithCommas,
  parsePositiveIntegerInput,
} from '../utils/numberFormat';

const PILL_COLORS = ['blue', 'green', 'amber', 'purple', 'teal'];
const QTY_BEHAVIOR_OPTIONS = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'editable', label: 'Editable' },
];
const QUOTE_EDIT_OPTIONS = [
  { value: 'read_only', label: 'Locked' },
  { value: 'editable_qty', label: 'Qty Editable' },
  { value: 'editable_price', label: 'Price Editable' },
  { value: 'editable_qty_and_price', label: 'Qty + Price Editable' },
];
const PRICING_DISPLAY_OPTIONS = [
  { value: 'package_only', label: 'Package Only' },
  { value: 'row_level', label: 'Row Level' },
  { value: 'hidden', label: 'Hidden' },
];

function getPillColor(index) {
  return PILL_COLORS[index % PILL_COLORS.length];
}

function coerceProduct(product) {
  const next = { ...(product || emptyProduct()) };
  next.category = getProductCategory(next);
  next.type = next.category;
  if (!next.configuration_method) next.configuration_method = 'none';
  if (!next.bundle_pricing) next.bundle_pricing = 'header_only';
  if (typeof next.print_members !== 'boolean') next.print_members = true;
  next.package_components = getProductPackageComponents(next);
  next.members = Array.isArray(next.members) ? next.members : [];
  if (!Array.isArray(next.components)) next.components = [];
  return next;
}

function parseNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SEAT_INPUT_PATTERN = /\b(seat|seats|user|users|license|licenses)\b/i;
const CONCURRENT_BUILDS_INPUT_PATTERN = /\bconcurrent\s*builds?\b/i;
const CREDIT_INPUT_PATTERN = /\bcredits?\b/i;

function isSeatLikeProduct(product) {
  if (!product) return false;
  const type = String(product.type || product.category || '').toLowerCase();
  const name = String(product.name || '');
  const sku = String(product.sku || '');
  const unitType = String(product.default_price?.unit || product.unit_type || '').toLowerCase();
  return type === 'seats'
    || unitType === 'per_member'
    || SEAT_INPUT_PATTERN.test(name)
    || SEAT_INPUT_PATTERN.test(sku);
}

function isCreditLikeProduct(product) {
  if (!product) return false;
  const type = String(product.type || product.category || '').toLowerCase();
  const name = String(product.name || '');
  const sku = String(product.sku || '');
  const unitType = String(product.default_price?.unit || product.unit_type || '').toLowerCase();
  return type === 'credits'
    || unitType === 'per_credit'
    || CREDIT_INPUT_PATTERN.test(name)
    || CREDIT_INPUT_PATTERN.test(sku);
}

function isConcurrentBuildsLikeProduct(product) {
  if (!product) return false;
  const name = String(product.name || '');
  const sku = String(product.sku || '');
  return CONCURRENT_BUILDS_INPUT_PATTERN.test(name) || sku === 'CC-B';
}

const COLLAPSIBLE_SECTION_KEYS = {
  BASIC_INFO: 'basicInfo',
  PRICING: 'pricing',
  PACKAGE_COMPONENTS: 'packageComponents',
  SERVICE: 'service',
  ENTITLEMENTS: 'entitlements',
  CONFIGURATION: 'configuration',
  TERMS: 'terms',
};

export default function ProductModal({ product, products, onSave, onClose }) {
  const [f, setF] = useState(coerceProduct(product));
  const [jsonError, setJsonError] = useState('');
  const [creditInputDrafts, setCreditInputDrafts] = useState({});
  const [openSections, setOpenSections] = useState({
    [COLLAPSIBLE_SECTION_KEYS.BASIC_INFO]: true,
    [COLLAPSIBLE_SECTION_KEYS.PRICING]: true,
    [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true,
    [COLLAPSIBLE_SECTION_KEYS.SERVICE]: true,
    [COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]: false,
    [COLLAPSIBLE_SECTION_KEYS.CONFIGURATION]: false,
    [COLLAPSIBLE_SECTION_KEYS.TERMS]: false,
  });

  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const sp = (k, v) => setF((p) => ({ ...p, default_price: { ...p.default_price, [k]: v } }));
  const sc = (k, v) => setF((p) => ({ ...p, config: { ...p.config, [k]: v } }));

  const ok = f.name.trim() && f.sku.trim();

  const validateJson = (val) => {
    s('default_entitlements', val);
    if (!val.trim() || val.trim() === '{}') {
      setJsonError('');
      return;
    }
    try {
      JSON.parse(val);
      setJsonError('');
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const parsedEntitlements = (() => {
    try {
      const raw = typeof f.default_entitlements === 'string' ? f.default_entitlements : JSON.stringify(f.default_entitlements);
      return Object.entries(JSON.parse(raw) || {});
    } catch {
      return [];
    }
  })();

  const isBasePackage = getProductCategory(f) === 'bundle';
  const isPackage = isBundleProduct(f) || isBasePackage;
  const isSeatProduct = isSeatLikeProduct(f);
  const isConcurrentBuildsProduct = isConcurrentBuildsLikeProduct(f);
  const isStepperProduct = isSeatProduct || isConcurrentBuildsProduct;
  const isCreditProduct = !isConcurrentBuildsProduct && isCreditLikeProduct(f);
  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);
  const COMPONENT_CARD_ORDER = ['platform', 'support', 'entitlement'];
  const COMPONENT_CARD_LABELS = { platform: 'Platform', support: 'Support', entitlement: 'Entitlements' };
  const COMPONENT_ADD_LABELS = { platform: 'Add Platform', support: 'Add Support', entitlement: 'Add Entitlement' };
  const COMPONENT_EMPTY_LABELS = { platform: 'No platform items yet', support: 'No support tier selected.', entitlement: 'No entitlement items yet' };

  const productsByCategory = useMemo(() => {
    const grouped = { platform: [], support: [], entitlement: [] };
    (products || []).forEach((p) => {
      if (p.id === f.id || isBundleProduct(p) || getProductCategory(p) === 'bundle') return;
      const cat = getProductCategory(p);
      if (cat === 'entitlements') {
        grouped.entitlement.push(p);
      } else if (grouped[cat]) {
        grouped[cat].push(p);
      }
    });
    Object.values(grouped).forEach((list) => list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    return grouped;
  }, [products, f.id]);

  const membersByCategory = useMemo(() => {
    const grouped = { platform: [], support: [], entitlement: [] };
    (f.package_components || []).forEach((component, index) => {
      const normalizedCat = grouped[component.section] ? component.section : 'platform';
      grouped[normalizedCat].push({ ...component, _index: index });
    });
    return grouped;
  }, [f.package_components]);

  const swapMember = (index, newProductId) => {
    const newProd = productMap.get(newProductId);
    if (!newProd) return;
    setF((prev) => {
      const components = [...(prev.package_components || [])];
      components[index] = {
        ...components[index],
        component_product_id: newProductId,
      };
      return { ...prev, package_components: components };
    });
  };

  const addMemberFromCategory = (category, productId) => {
    const prod = productMap.get(productId);
    if (!prod) return;
    if (category === 'support') {
      setF((prev) => {
        const existingComponents = [...(prev.package_components || [])];
        const existingIdx = existingComponents.findIndex((component) => component.section === 'support');
        let packageComponents;
        if (existingIdx >= 0) {
          packageComponents = existingComponents
            .map((component, idx) => (idx === existingIdx ? { ...component, component_product_id: productId } : component))
            .filter((component, idx) => component.section !== 'support' || idx === existingIdx);
        } else {
          packageComponents = [...existingComponents, {
            id: `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            package_product_id: prev.id,
            component_product_id: productId,
            section: 'support',
            is_included: true,
            sort_order: existingComponents.length + 1,
            default_qty: 1,
            min_qty: 1,
            max_qty: 1,
            qty_behavior: 'hidden',
            pricing_display: 'package_only',
            quote_edit_mode: 'read_only',
            is_required: false,
            is_default_selected: true,
            notes: null,
          }];
        }
        return {
          ...prev,
          package_components: packageComponents.map((component, index) => ({ ...component, sort_order: index + 1 })),
        };
      });
      return;
    }
    addMember(prod, category);
  };

  const categoryOptions = useMemo(() => {
    const values = [...PRODUCT_TYPES];
    const seen = new Set(values);
    const include = (value) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      values.push(value);
    };
    include(getProductCategory(f));
    (products || []).forEach((product) => include(getProductCategory(product)));
    return values;
  }, [f, products]);

  const addMember = (productOrId, forcedSection = null) => {
    const productId = typeof productOrId === 'string' ? productOrId : productOrId?.id;
    const prod = typeof productOrId === 'string' ? productMap.get(productId) : productOrId;
    if (!prod) return;
    const inferredSection = getProductCategory(prod) === 'support'
      ? 'support'
      : getProductCategory(prod) === 'entitlements'
        ? 'entitlement'
        : 'platform';
    const section = forcedSection || inferredSection;
    const defaults = section === 'platform'
      ? { default_qty: null, min_qty: null, max_qty: null, qty_behavior: 'hidden', quote_edit_mode: 'read_only' }
      : section === 'support'
        ? { default_qty: 1, min_qty: 1, max_qty: 1, qty_behavior: 'hidden', quote_edit_mode: 'read_only' }
        : { default_qty: 1, min_qty: 1, max_qty: null, qty_behavior: 'editable', quote_edit_mode: 'editable_qty' };
    setF((prev) => ({
      ...prev,
      package_components: [...(prev.package_components || []), {
        id: `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        package_product_id: prev.id,
        component_product_id: productId,
        section,
        is_included: true,
        sort_order: (prev.package_components || []).length + 1,
        default_qty: defaults.default_qty,
        min_qty: defaults.min_qty,
        max_qty: defaults.max_qty,
        qty_behavior: defaults.qty_behavior,
        pricing_display: 'package_only',
        quote_edit_mode: defaults.quote_edit_mode,
        is_required: false,
        is_default_selected: true,
        notes: null,
      }],
    }));
  };

  const updateMember = (index, key, value) => {
    setF((prev) => {
      const packageComponents = [...(prev.package_components || [])];
      const nextValue = ['default_qty', 'min_qty', 'max_qty', 'sort_order'].includes(key)
        ? (value === null ? null : Math.max(1, parseNumber(value, 1)))
        : value;
      packageComponents[index] = { ...packageComponents[index], [key]: nextValue };
      return { ...prev, package_components: packageComponents };
    });
  };

  const updateEntitlementDefaultQty = (index, rawValue) => {
    setF((prev) => {
      const packageComponents = [...(prev.package_components || [])];
      const component = packageComponents[index];
      if (!component || component.section !== 'entitlement') return prev;
      if (rawValue === '') {
        packageComponents[index] = { ...component, default_qty: '' };
        return { ...prev, package_components: packageComponents };
      }
      const parsed = parseInt(rawValue, 10);
      if (!Number.isFinite(parsed)) return prev;
      packageComponents[index] = { ...component, default_qty: parsed };
      return { ...prev, package_components: packageComponents };
    });
  };

  const removeMember = (index) => {
    setF((prev) => {
      const packageComponents = [...(prev.package_components || [])];
      packageComponents.splice(index, 1);
      return {
        ...prev,
        package_components: packageComponents.map((component, i) => ({ ...component, sort_order: i + 1 })),
      };
    });
  };

  const toggleSection = (sectionKey) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const toggleIsPackage = (enabled) => {
    setF((prev) => ({
      ...prev,
      category: enabled ? 'bundle' : 'platform',
      type: enabled ? 'bundle' : 'platform',
      configuration_method: enabled ? 'bundle' : 'none',
    }));
    setOpenSections((prev) => ({
      ...prev,
      [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: enabled ? true : prev[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS],
    }));
  };

  const handleSave = () => {
    if (!ok) return;

    let entitlements = f.default_entitlements;
    try {
      if (typeof entitlements === 'string') JSON.parse(entitlements);
    } catch {
      entitlements = '{}';
    }

    const normalizedPackageComponents = (f.package_components || [])
      .map((component, index) => {
        const referencedProduct = productMap.get(component.component_product_id);
        if (!referencedProduct) return null;
        const section = component.section === 'entitlement' ? 'entitlement' : (component.section || 'platform');
        return {
          ...component,
          package_product_id: f.id,
          component_product_id: component.component_product_id,
          section,
          is_included: typeof component.is_included === 'boolean' ? component.is_included : true,
          sort_order: Math.max(1, parseInt(component.sort_order, 10) || (index + 1)),
          default_qty: component.default_qty == null ? null : Math.max(1, parseInt(component.default_qty, 10) || 1),
          min_qty: component.min_qty == null ? null : Math.max(1, parseInt(component.min_qty, 10) || 1),
          max_qty: component.max_qty == null ? null : Math.max(1, parseInt(component.max_qty, 10) || 1),
          qty_behavior: PACKAGE_QTY_BEHAVIORS.includes(component.qty_behavior) ? component.qty_behavior : 'hidden',
          pricing_display: PACKAGE_PRICING_DISPLAYS.includes(component.pricing_display) ? component.pricing_display : 'package_only',
          quote_edit_mode: PACKAGE_QUOTE_EDIT_MODES.includes(component.quote_edit_mode) ? component.quote_edit_mode : 'read_only',
          is_required: Boolean(component.is_required),
          is_default_selected: typeof component.is_default_selected === 'boolean' ? component.is_default_selected : true,
          notes: component.notes ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order);
    const normalizedMembers = normalizedPackageComponents.map((component, index) => {
      const referencedProduct = productMap.get(component.component_product_id);
      return packageComponentToLegacyMember(component, referencedProduct, index);
    });

    onSave({
      ...f,
      category: getProductCategory(f),
      type: getProductCategory(f),
      default_price: { ...f.default_price, amount: parseFloat(f.default_price.amount) || 0 },
      default_entitlements: entitlements,
      config: {
        ...f.config,
        default_quantity: parseInt(f.config.default_quantity, 10) || 1,
        min_quantity: parseInt(f.config.min_quantity, 10) || 1,
        max_quantity: parseInt(f.config.max_quantity, 10) || 999,
      },
      configuration_method: isPackage ? 'bundle' : 'none',
      package_components: isPackage ? normalizedPackageComponents : [],
      members: isPackage ? normalizedMembers : [],
      components: isPackage ? normalizedMembers : [],
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-theme-products product-modal ${isPackage ? 'product-modal-base-package' : ''} ${isBasePackage ? 'product-modal-base-package-category' : ''}`.trim()} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{product ? 'Edit Product' : 'New Product'}</div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.BASIC_INFO)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO]}
          >
            <span>Basic Info</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.BASIC_INFO] ? 'is-open' : ''}`}>
            <div className="field">
              <label className="field-label">Product Name</label>
              <input className="field-input" value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="e.g. Netlify Enterprise" />
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="field-label">SKU</label>
                <input className="field-input" value={f.sku} onChange={(e) => s('sku', e.target.value.toUpperCase())} placeholder="NTL-XXX" style={{ fontFamily: "'Menlo', monospace" }} />
              </div>
              <div className="field">
                <label className="field-label">Category</label>
                <select
                  className="field-select"
                  value={getProductCategory(f)}
                  onChange={(e) => {
                    const val = e.target.value;
                    s('category', val);
                    s('type', val);
                    // Auto-set configuration_method when switching to/from bundle
                    s('configuration_method', val === 'bundle' ? 'bundle' : 'none');
                    if (val === 'bundle') {
                      setOpenSections((prev) => ({ ...prev, [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true }));
                    }
                  }}
                >
                  {categoryOptions.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1))}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label className="field-label">Description</label>
              <textarea className="field-textarea" value={f.description} onChange={(e) => s('description', e.target.value)} placeholder="Product description..." />
            </div>

            <div className="grid-2">
              <div className="checkbox-row">
                <input type="checkbox" checked={f.active} onChange={(e) => s('active', e.target.checked)} id="pActive" />
                <label htmlFor="pActive" className="checkbox-label">Active in catalog</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" checked={f.hide} onChange={(e) => s('hide', e.target.checked)} id="pHide" />
                <label htmlFor="pHide" className="checkbox-label">Hide from quotes</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" checked={isPackage} onChange={(e) => toggleIsPackage(e.target.checked)} id="pPackage" />
                <label htmlFor="pPackage" className="checkbox-label">Is a package</label>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.PRICING)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.PRICING]}
          >
            <span>Pricing</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.PRICING] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.PRICING] ? 'is-open' : ''}`}>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">Monthly Price ($)</label>
                <input className="field-input" type="number" min="0" step="0.01" value={f.default_price.amount} onChange={(e) => sp('amount', e.target.value)} placeholder="0.00" />
              </div>
              <div className="field">
                <label className="field-label">Unit</label>
                <select className="field-select" value={f.default_price.unit} onChange={(e) => sp('unit', e.target.value)}>
                  {PRICE_UNITS.map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Method</label>
                <select className="field-select" value={f.default_price.pricing_method} onChange={(e) => sp('pricing_method', e.target.value)}>
                  {PRICING_METHODS.map((m) => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

          </div>
        </div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.SERVICE)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE]}
          >
            <span>Service</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.SERVICE] ? 'is-open' : ''}`}>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Default Term (months)</label>
                <input className="field-input" type="number" value={f.default_term} onChange={(e) => s('default_term', parseInt(e.target.value, 10) || 0)} />
              </div>
              <div className="field">
                <label className="field-label">Term Behavior</label>
                <select className="field-select" value={f.term_behavior} onChange={(e) => s('term_behavior', e.target.value)}>
                  {TERM_BEHAVIORS.map((b) => (
                    <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {isPackage && (
          <div className="modal-section">
            <button
              type="button"
              className="modal-section-label modal-section-toggle"
              onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS)}
              aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]}
            >
              <span>Package Components</span>
              <span>{openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS] ? '▾' : '▸'}</span>
            </button>

            <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS] ? 'is-open' : ''}`}>
              <div className="pkg-components-helper">
                Define what is included in this package and how components behave in quotes.
              </div>
              <div className="pkg-components pkg-components-categorized">
                {COMPONENT_CARD_ORDER.map((category) => {
                  const membersForCategory = membersByCategory[category] || [];
                  const catMembers = category === 'support' ? membersForCategory.slice(0, 1) : membersForCategory;
                  const catLabel = COMPONENT_CARD_LABELS[category];
                  const catProducts = productsByCategory[category] || [];
                  const addLabel = COMPONENT_ADD_LABELS[category];
                  const emptyLabel = COMPONENT_EMPTY_LABELS[category];

                  return (
                    <div key={category} className={`pkg-category-card pkg-category-card-${category}`}>
                      <div className="pkg-category-card-header">
                        <span className="pkg-category-card-title">{catLabel}</span>
                        <select
                          className="field-select pkg-category-picker"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) addMemberFromCategory(category, e.target.value);
                          }}
                          disabled={catProducts.length === 0}
                        >
                          <option value="">{addLabel}</option>
                          {catProducts
                            .filter((p) => category === 'support' || !catMembers.some((m) => m.component_product_id === p.id))
                            .map((p) => (
                              <option key={p.id} value={p.id}>{p.sku ? `${p.name} (${p.sku})` : p.name}</option>
                            ))}
                        </select>
                      </div>
                      {category === 'entitlement' ? (
                        <div className="pkg-entitlement-list">
                          {catMembers.length > 0 ? catMembers.map((member) => {
                            const index = member._index;
                            const referencedProduct = productMap.get(member.component_product_id);
                            const memberSku = referencedProduct?.sku || '';

                            return (
                              <div key={`${member.component_product_id}_${index}`} className="pkg-entitlement-card">
                                <div className="pkg-entitlement-card-top">
                                  <div className="pkg-entitlement-card-header-main">
                                    <div className="pkg-cell-handle pkg-entitlement-handle">
                                      <span className="pkg-drag-handle" title="Reordering coming soon" aria-hidden="true">
                                        <i className="fa-solid fa-grip-vertical fa-fw" />
                                      </span>
                                    </div>
                                    <div className="pkg-product-cell-stack pkg-entitlement-product">
                                      <span className="pkg-member-name">{referencedProduct?.name || 'Unknown'}</span>
                                      <span className="pkg-member-sku pkg-entitlement-sku">{memberSku || '\u00A0'}</span>
                                    </div>
                                  </div>
                                  <button type="button" className="pkg-remove-btn" onClick={() => removeMember(index)} title="Delete">
                                    <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
                                  </button>
                                </div>

                                <div className="pkg-entitlement-field-rows">
                                  <div className="pkg-entitlement-fields-row pkg-entitlement-fields-row--qty">
                                    <div className="field pkg-entitlement-qty-field">
                                      <label className="field-label">Default Qty</label>
                                      <input
                                        className="field-input pkg-inline-number"
                                        type="number"
                                        min="1"
                                        value={member.default_qty ?? ''}
                                        onChange={(e) => updateEntitlementDefaultQty(index, e.target.value)}
                                      />
                                    </div>
                                    <div className="field pkg-entitlement-qty-field">
                                      <label className="field-label">Min Qty</label>
                                      <input
                                        className="field-input pkg-inline-number"
                                        type="number"
                                        min="1"
                                        value={member.min_qty ?? ''}
                                        onChange={(e) => updateMember(index, 'min_qty', e.target.value)}
                                      />
                                    </div>
                                    <div className="field pkg-entitlement-qty-field">
                                      <label className="field-label">Max Qty</label>
                                      <input
                                        className="field-input pkg-inline-number"
                                        type="number"
                                        min="1"
                                        value={member.max_qty ?? ''}
                                        onChange={(e) => updateMember(index, 'max_qty', e.target.value)}
                                      />
                                    </div>
                                  </div>
                                  <div className="pkg-entitlement-fields-row">
                                    <div className="field">
                                      <label className="field-label">Qty Behavior</label>
                                      <select
                                        className="field-select pkg-inline-select"
                                        value={member.qty_behavior || 'editable'}
                                        onChange={(e) => updateMember(index, 'qty_behavior', e.target.value)}
                                      >
                                        {QTY_BEHAVIOR_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label className="field-label">Quote Editability</label>
                                      <select
                                        className="field-select pkg-inline-select"
                                        value={member.quote_edit_mode || 'editable_qty'}
                                        onChange={(e) => updateMember(index, 'quote_edit_mode', e.target.value)}
                                      >
                                        {QUOTE_EDIT_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label className="field-label">Pricing Display</label>
                                      <select
                                        className="field-select pkg-inline-select"
                                        value={member.pricing_display || 'package_only'}
                                        onChange={(e) => updateMember(index, 'pricing_display', e.target.value)}
                                      >
                                        {PRICING_DISPLAY_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }) : (
                            <div className="pkg-empty-row pkg-empty-card-row">{emptyLabel}</div>
                          )}
                        </div>
                      ) : (
                        <table className="pkg-components-table">
                          <thead>
                            {category === 'platform' && (
                              <tr>
                                <th className="pkg-col-handle" aria-label="Reorder" />
                                <th>Product</th>
                                <th>Quote Editability</th>
                                <th>Pricing Display</th>
                                <th className="pkg-col-delete" aria-label="Remove" />
                              </tr>
                            )}
                            {category === 'support' && (
                              <tr>
                                <th>Product</th>
                                <th>Quote Editability</th>
                                <th>Pricing Display</th>
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {catMembers.length > 0 ? catMembers.map((member) => {
                              const index = member._index;
                              const referencedProduct = productMap.get(member.component_product_id);
                              const memberSku = referencedProduct?.sku || '';

                              return (
                                <tr key={`${member.component_product_id}_${index}`}>
                                  {category !== 'support' && (
                                    <td className="pkg-cell-handle">
                                      <span className="pkg-drag-handle" title="Reordering coming soon" aria-hidden="true">
                                        <i className="fa-solid fa-grip-vertical fa-fw" />
                                      </span>
                                    </td>
                                  )}
                                  <td className="pkg-cell-product">
                                    {category === 'support' ? (
                                      <div className="pkg-product-cell-stack">
                                        <select
                                          className="field-select pkg-inline-select"
                                          value={member.component_product_id}
                                          onChange={(e) => {
                                            if (e.target.value) swapMember(index, e.target.value);
                                          }}
                                        >
                                          {catProducts.map((p) => (
                                            <option key={p.id} value={p.id}>{p.sku ? `${p.name} (${p.sku})` : p.name}</option>
                                          ))}
                                        </select>
                                        {memberSku && <span className="pkg-member-sku">{memberSku}</span>}
                                      </div>
                                    ) : (
                                      <div className="pkg-product-cell-stack">
                                        <span className="pkg-member-name">{referencedProduct?.name || 'Unknown'}</span>
                                        {memberSku && <span className="pkg-member-sku">{memberSku}</span>}
                                      </div>
                                    )}
                                  </td>
                                  {category === 'platform' && (
                                    <>
                                      <td>
                                        <select
                                          className="field-select pkg-inline-select"
                                          value={member.quote_edit_mode || 'read_only'}
                                          onChange={(e) => updateMember(index, 'quote_edit_mode', e.target.value)}
                                        >
                                          {QUOTE_EDIT_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td>
                                        <select
                                          className="field-select pkg-inline-select"
                                          value={member.pricing_display || 'package_only'}
                                          onChange={(e) => updateMember(index, 'pricing_display', e.target.value)}
                                        >
                                          {PRICING_DISPLAY_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                    </>
                                  )}
                                  {category === 'support' && (
                                    <>
                                      <td>
                                        <select
                                          className="field-select pkg-inline-select"
                                          value={member.quote_edit_mode || 'read_only'}
                                          onChange={(e) => updateMember(index, 'quote_edit_mode', e.target.value)}
                                        >
                                          {QUOTE_EDIT_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td>
                                        <select
                                          className="field-select pkg-inline-select"
                                          value={member.pricing_display || 'package_only'}
                                          onChange={(e) => updateMember(index, 'pricing_display', e.target.value)}
                                        >
                                          {PRICING_DISPLAY_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                    </>
                                  )}
                                  {category !== 'support' && (
                                    <td className="pkg-cell-delete">
                                      <button type="button" className="pkg-remove-btn" onClick={() => removeMember(index)} title="Delete">
                                        <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={category === 'platform' ? 5 : 3} className="pkg-empty-row">
                                  {emptyLabel}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              Entitlement Rules
              <span
                title="Defines the entitlement behavior for this product — e.g. how credits refresh and over what period. Values entered here are parsed and displayed as tags below the JSON field."
                style={{ fontSize: '13px', color: '#94a3b8', cursor: 'help', fontWeight: 400 }}
              >?</span>
            </span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS] ? 'is-open' : ''}`}>
            <div className="field">
              <label className="field-label">JSON</label>
              <textarea
                className={`field-textarea entitlements-json${jsonError ? ' json-invalid' : (f.default_entitlements && f.default_entitlements !== '{}' ? ' json-valid' : '')}`}
                value={typeof f.default_entitlements === 'string' ? f.default_entitlements : JSON.stringify(f.default_entitlements, null, 2)}
                onChange={(e) => validateJson(e.target.value)}
                placeholder='{"builds": 1000, "bandwidth_gb": 100}'
              />
              {jsonError && <div className="json-error">{jsonError}</div>}
            </div>

            {parsedEntitlements.length > 0 && (
              <div className="entitlement-pills">
                {parsedEntitlements.map(([key, val], i) => (
                  <span key={key} className={`entitlement-pill pill-${getPillColor(i)}`}>
                    <span className="pill-key">{key}:</span> {String(val)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.CONFIGURATION)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION]}
          >
            <span>Configuration</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.CONFIGURATION] ? 'is-open' : ''}`}>
            <div className="grid-2">
              <div className="checkbox-row">
                <input type="checkbox" checked={f.config.lock_quantity} onChange={(e) => sc('lock_quantity', e.target.checked)} id="lockQty" />
                <label htmlFor="lockQty" className="checkbox-label">Lock quantity</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" checked={f.config.lock_price} onChange={(e) => sc('lock_price', e.target.checked)} id="lockPrice" />
                <label htmlFor="lockPrice" className="checkbox-label">Lock price</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" checked={f.config.lock_discount} onChange={(e) => sc('lock_discount', e.target.checked)} id="lockDisc" />
                <label htmlFor="lockDisc" className="checkbox-label">Lock discount</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" checked={f.config.lock_term} onChange={(e) => sc('lock_term', e.target.checked)} id="lockTerm" />
                <label htmlFor="lockTerm" className="checkbox-label">Lock term</label>
              </div>
            </div>

            {!isPackage && (
              <div className="grid-3">
                <div className="field">
                  <label className="field-label">Default Qty</label>
                  <input
                    className={`field-input ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                    type={isCreditProduct ? 'text' : 'number'}
                    inputMode={isCreditProduct ? 'numeric' : undefined}
                    value={isCreditProduct
                      ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:default_quantity')
                        ? creditInputDrafts['config:default_quantity']
                        : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.default_quantity, 1, 1), 1))
                      : f.config.default_quantity}
                    onFocus={() => {
                      if (!isCreditProduct) return;
                      setCreditInputDrafts((prev) => ({
                        ...prev,
                        'config:default_quantity': formatIntegerForEdit(f.config.default_quantity, 1, 1),
                      }));
                    }}
                    onChange={(e) => {
                      if (!isCreditProduct) {
                        sc('default_quantity', e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      setCreditInputDrafts((prev) => ({ ...prev, 'config:default_quantity': raw }));
                      sc('default_quantity', parsePositiveIntegerInput(raw, 1, 1));
                    }}
                    onBlur={(e) => {
                      if (!isCreditProduct) return;
                      sc('default_quantity', parsePositiveIntegerInput(e.target.value, 1, 1));
                      setCreditInputDrafts((prev) => {
                        const clone = { ...prev };
                        delete clone['config:default_quantity'];
                        return clone;
                      });
                    }}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Min Qty</label>
                  <input
                    className={`field-input ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                    type={isCreditProduct ? 'text' : 'number'}
                    inputMode={isCreditProduct ? 'numeric' : undefined}
                    value={isCreditProduct
                      ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:min_quantity')
                        ? creditInputDrafts['config:min_quantity']
                        : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.min_quantity, 1, 1), 1))
                      : f.config.min_quantity}
                    onFocus={() => {
                      if (!isCreditProduct) return;
                      setCreditInputDrafts((prev) => ({
                        ...prev,
                        'config:min_quantity': formatIntegerForEdit(f.config.min_quantity, 1, 1),
                      }));
                    }}
                    onChange={(e) => {
                      if (!isCreditProduct) {
                        sc('min_quantity', e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      setCreditInputDrafts((prev) => ({ ...prev, 'config:min_quantity': raw }));
                      sc('min_quantity', parsePositiveIntegerInput(raw, 1, 1));
                    }}
                    onBlur={(e) => {
                      if (!isCreditProduct) return;
                      sc('min_quantity', parsePositiveIntegerInput(e.target.value, 1, 1));
                      setCreditInputDrafts((prev) => {
                        const clone = { ...prev };
                        delete clone['config:min_quantity'];
                        return clone;
                      });
                    }}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Max Qty</label>
                  <input
                    className={`field-input ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                    type={isCreditProduct ? 'text' : 'number'}
                    inputMode={isCreditProduct ? 'numeric' : undefined}
                    value={isCreditProduct
                      ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:max_quantity')
                        ? creditInputDrafts['config:max_quantity']
                        : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.max_quantity, 1, 1), 1))
                      : f.config.max_quantity}
                    onFocus={() => {
                      if (!isCreditProduct) return;
                      setCreditInputDrafts((prev) => ({
                        ...prev,
                        'config:max_quantity': formatIntegerForEdit(f.config.max_quantity, 1, 1),
                      }));
                    }}
                    onChange={(e) => {
                      if (!isCreditProduct) {
                        sc('max_quantity', e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      setCreditInputDrafts((prev) => ({ ...prev, 'config:max_quantity': raw }));
                      sc('max_quantity', parsePositiveIntegerInput(raw, 1, 1));
                    }}
                    onBlur={(e) => {
                      if (!isCreditProduct) return;
                      sc('max_quantity', parsePositiveIntegerInput(e.target.value, 1, 1));
                      setCreditInputDrafts((prev) => {
                        const clone = { ...prev };
                        delete clone['config:max_quantity'];
                        return clone;
                      });
                    }}
                  />
                </div>
              </div>
            )}

            <div className="checkbox-row">
              <input type="checkbox" checked={f.config.edit_name} onChange={(e) => sc('edit_name', e.target.checked)} id="editName" />
              <label htmlFor="editName" className="checkbox-label">Allow editing product name on quote</label>
            </div>

            <div className="field">
              <label className="field-label">Default Description</label>
              <textarea className="field-textarea" value={f.config.default_description} onChange={(e) => sc('default_description', e.target.value)} placeholder="Default line item description..." />
            </div>
          </div>
        </div>

        {/* ── Terms & Conditions ── */}
        <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.TERMS)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.TERMS]}
          >
            <span>Terms &amp; Conditions</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.TERMS] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.TERMS] ? 'is-open' : ''}`}>
            <div className="field">
              <label className="field-label">Product Terms</label>
              <textarea
                className="field-textarea"
                value={f.terms || ''}
                onChange={(e) => s('terms', e.target.value)}
                placeholder="Enter any product-specific terms and conditions that will appear on the quote PDF for this line item..."
                style={{ minHeight: 120 }}
              />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={!ok}>
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}
