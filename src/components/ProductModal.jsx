import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import CustomSelect from './CustomSelect';
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
import { isRichTextEmpty, toRichTextHtml } from '../utils/richText';
import { fmtCurrency } from '../data/quotes';

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
  PRICEBOOKS: 'pricebooks',
  PACKAGE_COMPONENTS: 'packageComponents',
  SERVICE: 'service',
  ENTITLEMENTS: 'entitlements',
  CONFIGURATION: 'configuration',
  TERMS: 'terms',
};

const getEntryListPriceOverride = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.list_price_override != null) return entry.list_price_override;
  if (entry.price_override != null) return entry.price_override;
  return null;
};

const buildInitialPricebookAssignments = (productId, pricebooks = []) =>
  (pricebooks || [])
    .map((pricebook) => {
      const entry = Array.isArray(pricebook?.entries)
        ? pricebook.entries.find((item) => item?.product_id === productId)
        : null;
      if (!entry) return null;
      return {
        pricebook_id: String(pricebook.id),
        is_active: entry?.is_active !== false,
        list_price_override: getEntryListPriceOverride(entry),
      };
    })
    .filter(Boolean);

export default function ProductModal({ product, products, pricebooks, onSave, onClose }) {
  const [f, setF] = useState(coerceProduct(product));
  const [jsonError, setJsonError] = useState('');
  const [creditInputDrafts, setCreditInputDrafts] = useState({});
  const [currencyInputDrafts, setCurrencyInputDrafts] = useState({});
  const [pricebookAssignments, setPricebookAssignments] = useState(() => buildInitialPricebookAssignments(coerceProduct(product).id, pricebooks));
  const [pendingPricebookIds, setPendingPricebookIds] = useState([]);
  const [pendingPlatformIds, setPendingPlatformIds] = useState([]);
  const [pendingEntitlementIds, setPendingEntitlementIds] = useState([]);
  const dirtyFieldsRef = useRef(new Set());
  const pricebookPickerRef = useRef(null);
  const platformPickerRef = useRef(null);
  const entitlementPickerRef = useRef(null);
  const categoryPickerRefs = useRef({});
  const [openSections, setOpenSections] = useState({
    [COLLAPSIBLE_SECTION_KEYS.BASIC_INFO]: true,
    [COLLAPSIBLE_SECTION_KEYS.PRICING]: true,
    [COLLAPSIBLE_SECTION_KEYS.PRICEBOOKS]: true,
    [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true,
    [COLLAPSIBLE_SECTION_KEYS.SERVICE]: true,
    [COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]: false,
    [COLLAPSIBLE_SECTION_KEYS.CONFIGURATION]: false,
    [COLLAPSIBLE_SECTION_KEYS.TERMS]: false,
  });

  const markDirty = (...paths) => {
    paths.forEach((path) => dirtyFieldsRef.current.add(path));
  };

  const s = (k, v) => {
    markDirty(k);
    setF((p) => ({ ...p, [k]: v }));
  };
  const sp = (k, v) => {
    markDirty(`default_price.${k}`);
    setF((p) => ({ ...p, default_price: { ...p.default_price, [k]: v } }));
  };
  const sc = (k, v) => {
    markDirty(`config.${k}`);
    setF((p) => ({ ...p, config: { ...p.config, [k]: v } }));
  };

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
  const shouldFormatConfigQtyWithCommas = isSeatProduct || isCreditProduct;
  const productMap = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);
  const COMPONENT_CARD_ORDER = ['platform', 'support', 'entitlement', 'addon'];
  const ALWAYS_VISIBLE_COMPONENT_CATEGORIES = new Set(['platform', 'support', 'entitlement']);
  const COMPONENT_CARD_LABELS = {
    platform: 'Platform',
    support: 'Support',
    entitlement: 'Entitlements',
    addon: 'Add-ons',
  };
  const COMPONENT_ADD_LABELS = {
    platform: 'Add Platform',
    support: 'Add Support',
    entitlement: 'Add Entitlement',
    addon: 'Add Add-on',
  };
  const COMPONENT_EMPTY_LABELS = {
    platform: 'No platform items yet',
    support: 'No support tier selected.',
    entitlement: 'No entitlement items yet',
    addon: 'No add-ons yet',
  };
  const availablePricebooks = Array.isArray(pricebooks) ? pricebooks : [];
  const assignedPricebookIds = useMemo(
    () => new Set(pricebookAssignments.map((assignment) => assignment.pricebook_id).filter(Boolean)),
    [pricebookAssignments],
  );
  const unassignedPricebooks = useMemo(
    () => availablePricebooks.filter((pricebook) => !assignedPricebookIds.has(pricebook.id)),
    [availablePricebooks, assignedPricebookIds],
  );
  const pendingPricebookIdSet = useMemo(
    () => new Set(pendingPricebookIds.map((id) => String(id))),
    [pendingPricebookIds],
  );
  const pendingPlatformIdSet = useMemo(
    () => new Set(pendingPlatformIds.map((id) => String(id))),
    [pendingPlatformIds],
  );
  const pendingEntitlementIdSet = useMemo(
    () => new Set(pendingEntitlementIds.map((id) => String(id))),
    [pendingEntitlementIds],
  );

  useEffect(() => {
    const validUnassignedIds = new Set(unassignedPricebooks.map((pricebook) => String(pricebook.id)));
    setPendingPricebookIds((prev) => prev.filter((id) => validUnassignedIds.has(String(id))));
  }, [unassignedPricebooks]);

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

  const displayCurrencyValue = (value) => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : parseNumber(value, 0);
    return fmtCurrency(n);
  };

  // Close multi-select picker dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pricebookPickerRef.current && pricebookPickerRef.current.open && !pricebookPickerRef.current.contains(e.target)) {
        pricebookPickerRef.current.open = false;
      }
      if (platformPickerRef.current && platformPickerRef.current.open && !platformPickerRef.current.contains(e.target)) {
        platformPickerRef.current.open = false;
      }
      if (entitlementPickerRef.current && entitlementPickerRef.current.open && !entitlementPickerRef.current.contains(e.target)) {
        entitlementPickerRef.current.open = false;
      }
      Object.values(categoryPickerRefs.current).forEach((el) => {
        if (el && el.open && !el.contains(e.target)) {
          el.open = false;
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const togglePendingPricebook = (pricebookId) => {
    const nextId = String(pricebookId);
    setPendingPricebookIds((prev) => (
      prev.some((id) => String(id) === nextId)
        ? prev.filter((id) => String(id) !== nextId)
        : [...prev, nextId]
    ));
  };

  const applyPendingPricebookAssignments = () => {
    if (pendingPricebookIds.length === 0) return;
    setPricebookAssignments((prev) => {
      const assignedIds = new Set(prev.map((assignment) => String(assignment.pricebook_id)));
      const nextAssignments = availablePricebooks
        .filter((pricebook) => pendingPricebookIdSet.has(String(pricebook.id)) && !assignedIds.has(String(pricebook.id)))
        .map((pricebook) => ({
          pricebook_id: pricebook.id,
          is_active: true,
          list_price_override: null,
        }));
      if (nextAssignments.length === 0) return prev;
      return [...prev, ...nextAssignments];
    });
    setPendingPricebookIds([]);
    if (pricebookPickerRef.current) {
      pricebookPickerRef.current.open = false;
    }
  };

  const togglePendingEntitlement = (productId) => {
    const nextId = String(productId);
    setPendingEntitlementIds((prev) => (
      prev.some((id) => String(id) === nextId)
        ? prev.filter((id) => String(id) !== nextId)
        : [...prev, nextId]
    ));
  };

  const togglePendingPlatform = (productId) => {
    const nextId = String(productId);
    setPendingPlatformIds((prev) => (
      prev.some((id) => String(id) === nextId)
        ? prev.filter((id) => String(id) !== nextId)
        : [...prev, nextId]
    ));
  };

  const updatePricebookAssignment = (index, updates) => {
    setPricebookAssignments((prev) => prev.map((assignment, rowIndex) => (
      rowIndex === index ? { ...assignment, ...updates } : assignment
    )));
  };

  const removePricebookAssignment = (index) => {
    setPricebookAssignments((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const productsByCategory = useMemo(() => {
    const grouped = { platform: [], support: [], entitlement: [], addon: [] };
    (products || []).forEach((p) => {
      if (p.id === f.id || isBundleProduct(p) || getProductCategory(p) === 'bundle') return;
      const cat = getProductCategory(p);
      if (cat === 'entitlements') {
        grouped.entitlement.push(p);
      } else if (cat === 'addon') {
        grouped.addon.push(p);
      } else if (grouped[cat]) {
        grouped[cat].push(p);
      }
    });
    Object.values(grouped).forEach((list) => list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    return grouped;
  }, [products, f.id]);

  const membersByCategory = useMemo(() => {
    const grouped = { platform: [], support: [], entitlement: [], addon: [] };
    (f.package_components || []).forEach((component, index) => {
      const section = component.section === 'support' || component.section === 'entitlement'
        ? component.section
        : 'platform';
      const referencedProduct = productMap.get(component.component_product_id);
      const referencedCategory = getProductCategory(referencedProduct);
      const renderCategory = section === 'platform' && referencedCategory === 'addon'
        ? 'addon'
        : section;
      grouped[renderCategory].push({ ...component, _index: index });
    });
    return grouped;
  }, [f.package_components, productMap]);
  const selectedEntitlementIds = useMemo(
    () => new Set((membersByCategory.entitlement || []).map((member) => String(member.component_product_id))),
    [membersByCategory],
  );
  const selectedPlatformIds = useMemo(
    () => new Set((membersByCategory.platform || []).map((member) => String(member.component_product_id))),
    [membersByCategory],
  );

  useEffect(() => {
    const validIds = new Set((productsByCategory.entitlement || []).map((item) => String(item.id)));
    setPendingEntitlementIds((prev) => (
      prev.filter((id) => validIds.has(String(id)) && !selectedEntitlementIds.has(String(id)))
    ));
  }, [productsByCategory, selectedEntitlementIds]);

  useEffect(() => {
    const validIds = new Set((productsByCategory.platform || []).map((item) => String(item.id)));
    setPendingPlatformIds((prev) => (
      prev.filter((id) => validIds.has(String(id)) && !selectedPlatformIds.has(String(id)))
    ));
  }, [productsByCategory, selectedPlatformIds]);

  const visibleComponentCategories = useMemo(
    () => COMPONENT_CARD_ORDER.filter((category) => (
      ALWAYS_VISIBLE_COMPONENT_CATEGORIES.has(category) || (membersByCategory[category] || []).length > 0
    )),
    [membersByCategory],
  );

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

  const swapMember = (index, newProductId) => {
    const newProd = productMap.get(newProductId);
    if (!newProd) return;
    markDirty('package_components', 'members', 'components');
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
    markDirty('package_components', 'members', 'components');
    const targetSection = category === 'addon' ? 'platform' : category;
    if (targetSection === 'support') {
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
    addMember(prod, targetSection);
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
    markDirty('package_components', 'members', 'components');
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
    markDirty('package_components', 'members', 'components');
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
    markDirty('package_components', 'members', 'components');
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
    markDirty('package_components', 'members', 'components');
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
    markDirty('category', 'type', 'configuration_method');
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
    const knownPricebookIds = new Set(availablePricebooks.map((pricebook) => String(pricebook.id)));
    const normalizedPricebookAssignments = [];
    const seenPricebookIds = new Set();
    pricebookAssignments.forEach((assignment) => {
      const pricebookId = String(assignment?.pricebook_id || '');
      if (!pricebookId || seenPricebookIds.has(pricebookId) || !knownPricebookIds.has(pricebookId)) return;
      seenPricebookIds.add(pricebookId);

      let listPriceOverride = null;
      if (assignment?.list_price_override !== '' && assignment?.list_price_override != null) {
        const parsed = parseFloat(assignment.list_price_override);
        if (Number.isFinite(parsed) && parsed >= 0) listPriceOverride = parsed;
      }

      normalizedPricebookAssignments.push({
        product_id: f.id,
        pricebook_id: pricebookId,
        is_active: assignment?.is_active !== false,
        list_price_override: listPriceOverride,
      });
    });

    onSave({
      product: {
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
        _dirty_fields: Array.from(dirtyFieldsRef.current),
        _is_edit_mode: Boolean(product),
      },
      pricebook_assignments: normalizedPricebookAssignments,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-theme-products product-modal ${isPackage ? 'product-modal-base-package' : ''} ${isBasePackage ? 'product-modal-base-package-category' : ''}`.trim()} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{product ? 'Edit Product' : 'New Product'}</div>

        <div className="product-modal-group product-modal-group-product">
          <div className="product-modal-group-label">PRODUCT</div>

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
                <input className="field-input input-mono" value={f.sku} onChange={(e) => s('sku', e.target.value.toUpperCase())} placeholder="NTL-XXX" />
              </div>
              <div className="field">
                <label className="field-label">Category</label>
                <CustomSelect
                  value={getProductCategory(f)}
                  options={categoryOptions.map((t) => ({
                    value: t,
                    label: TYPE_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1)),
                  }))}
                  onChange={(val) => {
                    s('category', val);
                    s('type', val);
                    // Auto-set configuration_method when switching to/from bundle
                    s('configuration_method', val === 'bundle' ? 'bundle' : 'none');
                    if (val === 'bundle') {
                      setOpenSections((prev) => ({ ...prev, [COLLAPSIBLE_SECTION_KEYS.PACKAGE_COMPONENTS]: true }));
                    }
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Description</label>
              <textarea className="field-textarea" value={f.description} onChange={(e) => s('description', e.target.value)} placeholder="Product description..." />
            </div>

            <div className="grid-2 basic-info-checks">
              <div className="checkbox-row">
                <input type="checkbox" checked={f.active} onChange={(e) => s('active', e.target.checked)} id="pActive" />
                <label htmlFor="pActive" className="checkbox-label">Active in catalog</label>
              </div>
              <div className="checkbox-row">
                <input className="checkbox-circle" type="checkbox" checked={f.hide} onChange={(e) => s('hide', e.target.checked)} id="pHide" />
                <label htmlFor="pHide" className="checkbox-label">Hide from quotes</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" checked={isPackage} onChange={(e) => toggleIsPackage(e.target.checked)} id="pPackage" />
                <label htmlFor="pPackage" className="checkbox-label">Is a package</label>
              </div>
            </div>
          </div>
        </div>

          <div className="modal-section modal-section-no-content-divider">
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
                <input
                  className="field-input field-input--label-typography field-input--currency"
                  type="text"
                  inputMode="decimal"
                  value={Object.prototype.hasOwnProperty.call(currencyInputDrafts, 'default_price.amount')
                    ? currencyInputDrafts['default_price.amount']
                    : displayCurrencyValue(parseNumber(f.default_price.amount, 0))}
                  onFocus={() => {
                    setCurrencyInputDrafts((prev) => ({
                      ...prev,
                      'default_price.amount': formatCurrencyForEdit(parseNumber(f.default_price.amount, 0)),
                    }));
                  }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCurrencyInputDrafts((prev) => ({ ...prev, 'default_price.amount': raw }));
                    sp('amount', parseCurrencyFromInput(raw));
                  }}
                  onBlur={(e) => {
                    sp('amount', parseCurrencyFromInput(e.target.value));
                    setCurrencyInputDrafts((prev) => {
                      const clone = { ...prev };
                      delete clone['default_price.amount'];
                      return clone;
                    });
                  }}
                  placeholder="$0.00"
                />
              </div>
              <div className="field">
                <label className="field-label">Unit</label>
                <CustomSelect
                  value={f.default_price.unit}
                  options={PRICE_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
                  onChange={(val) => sp('unit', val)}
                />
              </div>
              <div className="field">
                <label className="field-label">Method</label>
                <CustomSelect
                  value={f.default_price.pricing_method}
                  options={PRICING_METHODS.map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))}
                  onChange={(val) => sp('pricing_method', val)}
                />
              </div>
            </div>

          </div>
        </div>

          <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.PRICEBOOKS)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.PRICEBOOKS]}
          >
            <span>Pricebooks</span>
            <span>{openSections[COLLAPSIBLE_SECTION_KEYS.PRICEBOOKS] ? '▾' : '▸'}</span>
          </button>

          <div className={`modal-section-content ${openSections[COLLAPSIBLE_SECTION_KEYS.PRICEBOOKS] ? 'is-open' : ''}`}>
            {availablePricebooks.length === 0 ? (
              <div className="product-pricebook-empty">
                No price books are available yet.
              </div>
            ) : (
              <>
                <div className="pkg-pricebook-picker-wrap">
                  <span className="pkg-pricebook-picker-label">Add Price Books</span>
                  <details
                    ref={pricebookPickerRef}
                    className="pkg-pricebook-multi-picker"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <summary className="field-select pkg-category-picker pkg-pricebook-picker-summary">
                      <span>{unassignedPricebooks.length > 0 ? 'Select price books' : 'All price books assigned'}</span>
                      <span className="pkg-pricebook-picker-chevron" aria-hidden="true">▾</span>
                    </summary>
                    {unassignedPricebooks.length > 0 && (
                      <div className="pkg-pricebook-picker-menu">
                        <div className="pkg-pricebook-picker-options">
                          {unassignedPricebooks.map((pricebook) => (
                            <label
                              key={pricebook.id}
                              className="pkg-pricebook-picker-option"
                            >
                              <input
                                type="checkbox"
                                className="pkg-pricebook-picker-checkbox"
                                checked={pendingPricebookIdSet.has(String(pricebook.id))}
                                onChange={() => togglePendingPricebook(pricebook.id)}
                              />
                              <span>{pricebook.name}</span>
                            </label>
                          ))}
                        </div>
                        <div className="pkg-pricebook-picker-actions">
                          <button
                            type="button"
                            className="pkg-pricebook-apply-btn"
                            onClick={applyPendingPricebookAssignments}
                            disabled={pendingPricebookIds.length === 0}
                          >
                            Apply selections
                          </button>
                        </div>
                      </div>
                    )}
                  </details>
                </div>

                {pricebookAssignments.length > 0 && (
                  <div className="pkg-pricebook-assigned-list">
                    {pricebookAssignments.map((assignment, index) => {
                      const pricebook = availablePricebooks.find((pb) => String(pb.id) === String(assignment.pricebook_id));
                      return (
                        <div key={`${assignment.pricebook_id}_${index}`} className="pkg-pricebook-assigned-row">
                          <span className="pkg-pricebook-assigned-name">{pricebook?.name || assignment.pricebook_id}</span>
                          <div className="pkg-pricebook-assigned-override">
                            <input
                              className="field-input field-input--label-typography field-input--currency field-input--compact-currency pkg-pricebook-override-input"
                              type="text"
                              inputMode="decimal"
                              value={Object.prototype.hasOwnProperty.call(currencyInputDrafts, `pricebook:${index}`)
                                ? currencyInputDrafts[`pricebook:${index}`]
                                : (assignment.list_price_override == null
                                    ? ''
                                    : displayCurrencyValue(parseNumber(assignment.list_price_override, 0)))}
                              placeholder="Use product default"
                              onFocus={() => {
                                setCurrencyInputDrafts((prev) => ({
                                  ...prev,
                                  [`pricebook:${index}`]: assignment.list_price_override == null
                                    ? ''
                                    : formatCurrencyForEdit(parseNumber(assignment.list_price_override, 0)),
                                }));
                              }}
                              onChange={(event) => {
                                const raw = event.target.value;
                                setCurrencyInputDrafts((prev) => ({ ...prev, [`pricebook:${index}`]: raw }));
                                updatePricebookAssignment(index, { list_price_override: raw.trim() === '' ? null : parseCurrencyFromInput(raw) });
                              }}
                              onBlur={(event) => {
                                const raw = event.target.value;
                                updatePricebookAssignment(index, { list_price_override: raw.trim() === '' ? null : parseCurrencyFromInput(raw) });
                                setCurrencyInputDrafts((prev) => {
                                  const clone = { ...prev };
                                  delete clone[`pricebook:${index}`];
                                  return clone;
                                });
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            className="pkg-pricebook-remove-btn"
                            onClick={() => removePricebookAssignment(index)}
                            aria-label="Remove"
                          >
                            <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        </div>

        {isPackage && (
        <div className="product-modal-group product-modal-group-package">
          <div className="product-modal-group-label">PACKAGE</div>

            <div className="modal-section modal-section-no-content-divider">
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
                {visibleComponentCategories.map((category) => {
                  const membersForCategory = membersByCategory[category] || [];
                  const catMembers = category === 'support' ? membersForCategory.slice(0, 1) : membersForCategory;
                  const catLabel = COMPONENT_CARD_LABELS[category];
                  const catProducts = productsByCategory[category] || [];
                  const addLabel = COMPONENT_ADD_LABELS[category];
                  const emptyLabel = COMPONENT_EMPTY_LABELS[category];

                  const isEntitlementCategory = category === 'entitlement';
                  const isPlatformCategory = category === 'platform';
                  const applyPendingEntitlements = () => {
                    if (pendingEntitlementIds.length === 0) return;
                    pendingEntitlementIds.forEach((entitlementId) => {
                      const id = String(entitlementId);
                      if (selectedEntitlementIds.has(id)) return;
                      addMemberFromCategory(category, id);
                    });
                    setPendingEntitlementIds([]);
                    if (entitlementPickerRef.current) {
                      entitlementPickerRef.current.open = false;
                    }
                  };
                  const applyPendingPlatform = () => {
                    if (pendingPlatformIds.length === 0) return;
                    pendingPlatformIds.forEach((platformId) => {
                      const id = String(platformId);
                      if (selectedPlatformIds.has(id)) return;
                      addMemberFromCategory(category, id);
                    });
                    setPendingPlatformIds([]);
                    if (platformPickerRef.current) {
                      platformPickerRef.current.open = false;
                    }
                  };

                  return (
                    <div key={category} className={`pkg-category-card pkg-category-card-${category}`}>
                      <div className="pkg-category-card-header">
                        <span className="pkg-category-card-title">{catLabel}</span>
                        {isEntitlementCategory || isPlatformCategory ? (
                          (() => {
                            const selectedIds = isEntitlementCategory ? selectedEntitlementIds : selectedPlatformIds;
                            const pendingIdSet = isEntitlementCategory ? pendingEntitlementIdSet : pendingPlatformIdSet;
                            const pendingIds = isEntitlementCategory ? pendingEntitlementIds : pendingPlatformIds;
                            const togglePending = isEntitlementCategory ? togglePendingEntitlement : togglePendingPlatform;
                            const applyPending = isEntitlementCategory ? applyPendingEntitlements : applyPendingPlatform;
                            const pickerRef = isEntitlementCategory ? entitlementPickerRef : platformPickerRef;
                            const pickerProducts = catProducts.filter((p) => !selectedIds.has(String(p.id)));

                            return (
                              <details ref={pickerRef} className="pkg-entitlement-multi-picker" onClick={(e) => e.stopPropagation()}>
                                <summary className="field-select pkg-category-picker pkg-entitlement-picker-summary">
                                  <span>{pickerProducts.length > 0 ? addLabel : `All ${catLabel.toLowerCase()} added`}</span>
                                  <span className="pkg-entitlement-picker-chevron" aria-hidden="true">▾</span>
                                </summary>
                                {pickerProducts.length > 0 && (
                                  <div className="pkg-entitlement-picker-menu">
                                    <div className="pkg-entitlement-picker-options">
                                      {pickerProducts.map((p) => {
                                        const isPending = pendingIdSet.has(String(p.id));
                                        return (
                                          <label
                                            key={p.id}
                                            className="pkg-entitlement-picker-option"
                                          >
                                            <input
                                              type="checkbox"
                                              className="pkg-entitlement-picker-checkbox"
                                              checked={isPending}
                                              onChange={() => togglePending(p.id)}
                                            />
                                            <span>{p.name}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                    <div className="pkg-entitlement-picker-actions">
                                      <button
                                        type="button"
                                        className="pkg-entitlement-apply-btn"
                                        onClick={applyPending}
                                        disabled={pendingIds.length === 0}
                                      >
                                        Apply selections
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </details>
                            );
                          })()
                        ) : (() => {
                          const filteredProducts = catProducts
                            .filter((p) => category === 'support' || !catMembers.some((m) => m.component_product_id === p.id));
                          const currentSupportId = category === 'support' && catMembers.length > 0 ? catMembers[0].component_product_id : null;
                          return (
                            <details
                              ref={(el) => { categoryPickerRefs.current[category] = el; }}
                              className="pkg-category-single-picker"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <summary className="field-select pkg-category-picker pkg-category-single-picker-summary">
                                <span>{filteredProducts.length > 0 ? addLabel : `No ${catLabel.toLowerCase()} available`}</span>
                                <span className="pkg-category-single-picker-chevron" aria-hidden="true">▾</span>
                              </summary>
                              {filteredProducts.length > 0 && (
                                <div className="pkg-category-single-picker-menu">
                                  <div className="pkg-category-single-picker-options">
                                    {filteredProducts.map((p) => {
                                      const isCurrentSupport = currentSupportId === p.id;
                                      return (
                                        <button
                                          key={p.id}
                                          type="button"
                                          className={`pkg-category-single-picker-option${isCurrentSupport ? ' is-selected' : ''}`}
                                          onClick={() => {
                                            addMemberFromCategory(category, p.id);
                                            if (categoryPickerRefs.current[category]) {
                                              categoryPickerRefs.current[category].open = false;
                                            }
                                          }}
                                        >
                                          <span className="pkg-category-single-picker-check" aria-hidden="true">✓</span>
                                          <span>{p.name}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </details>
                          );
                        })()}
                      </div>
                      {isBasePackage && ['entitlement', 'platform', 'support', 'addon'].includes(category) ? (
                        <div className={`pkg-component-list pkg-${category}-list`}>
                          {catMembers.length > 0 ? catMembers.map((member) => {
                            const index = member._index;
                            const referencedProduct = productMap.get(member.component_product_id);
                            const isEntitlement = category === 'entitlement';

                            return (
                              <div key={`${member.component_product_id}_${index}`} className={`pkg-component-row pkg-component-row-${category}`}>
                                <div className="pkg-component-row-header">
                                  <div className="pkg-component-row-title">
                                    <div className="pkg-cell-handle">
                                      <span className="pkg-drag-handle" title="Reordering coming soon" aria-hidden="true">
                                        <i className="fa-solid fa-grip-vertical fa-fw" />
                                      </span>
                                    </div>
                                    <div className="pkg-product-cell-stack">
                                      <span className="pkg-member-name">{referencedProduct?.name || 'Unknown'}</span>
                                    </div>
                                  </div>
                                  <button type="button" className="pkg-remove-btn" onClick={() => removeMember(index)} title="Delete">
                                    <i className="fa-solid fa-trash fa-fw" aria-hidden="true" />
                                  </button>
                                </div>

                                <div className={`pkg-component-row-fields${isEntitlement ? ' pkg-component-row-fields-entitlement' : ' pkg-component-row-fields-grid2'}`}>
                                  {isEntitlement ? (
                                    <>
                                      <div className="pkg-entitlement-inline-row">
                                        <div className="pkg-component-field-row">
                                          <label className="pkg-component-field-label">Default Qty</label>
                                          <div className="pkg-component-field-control">
                                            <input className="field-input pkg-inline-number" type="number" min="1" value={member.default_qty ?? ''} onChange={(e) => updateEntitlementDefaultQty(index, e.target.value)} />
                                          </div>
                                        </div>
                                        <div className="pkg-component-field-row">
                                          <label className="pkg-component-field-label">Min Qty</label>
                                          <div className="pkg-component-field-control">
                                            <input className="field-input pkg-inline-number" type="number" min="1" value={member.min_qty ?? ''} onChange={(e) => updateMember(index, 'min_qty', e.target.value)} />
                                          </div>
                                        </div>
                                        <div className="pkg-component-field-row">
                                          <label className="pkg-component-field-label">Max Qty</label>
                                          <div className="pkg-component-field-control">
                                            <input className="field-input pkg-inline-number" type="number" min="1" value={member.max_qty ?? ''} onChange={(e) => updateMember(index, 'max_qty', e.target.value)} />
                                          </div>
                                        </div>
                                        <div className="pkg-component-field-row">
                                          <label className="pkg-component-field-label">Qty Behavior</label>
                                          <div className="pkg-component-field-control">
                                            <CustomSelect
                                              className="pkg-inline-select"
                                              value={member.qty_behavior || 'editable'}
                                              options={QTY_BEHAVIOR_OPTIONS}
                                              onChange={(val) => updateMember(index, 'qty_behavior', val)}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="pkg-entitlement-inline-row pkg-entitlement-inline-row--2col">
                                        <div className="pkg-component-field-row">
                                          <label className="pkg-component-field-label">Quote Editability</label>
                                          <div className="pkg-component-field-control">
                                            <CustomSelect
                                              className="pkg-inline-select"
                                              value={member.quote_edit_mode || 'editable_qty'}
                                              options={QUOTE_EDIT_OPTIONS}
                                              onChange={(val) => updateMember(index, 'quote_edit_mode', val)}
                                            />
                                          </div>
                                        </div>
                                        <div className="pkg-component-field-row">
                                          <label className="pkg-component-field-label">Pricing Display</label>
                                          <div className="pkg-component-field-control">
                                            <CustomSelect
                                              className="pkg-inline-select"
                                              value={member.pricing_display || 'package_only'}
                                              options={PRICING_DISPLAY_OPTIONS}
                                              onChange={(val) => updateMember(index, 'pricing_display', val)}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="pkg-component-field-row">
                                        <label className="pkg-component-field-label">Quote Editability</label>
                                        <div className="pkg-component-field-control">
                                          <CustomSelect
                                            className="pkg-inline-select"
                                            value={member.quote_edit_mode || 'read_only'}
                                            options={QUOTE_EDIT_OPTIONS}
                                            onChange={(val) => updateMember(index, 'quote_edit_mode', val)}
                                          />
                                        </div>
                                      </div>
                                      <div className="pkg-component-field-row">
                                        <label className="pkg-component-field-label">Pricing Display</label>
                                        <div className="pkg-component-field-control">
                                          <CustomSelect
                                            className="pkg-inline-select"
                                            value={member.pricing_display || 'package_only'}
                                            options={PRICING_DISPLAY_OPTIONS}
                                            onChange={(val) => updateMember(index, 'pricing_display', val)}
                                          />
                                        </div>
                                      </div>
                                    </>
                                  )}
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
                                        <CustomSelect
                                          className="pkg-inline-select"
                                          value={member.component_product_id}
                                          options={catProducts.map((p) => ({ value: p.id, label: p.name }))}
                                          onChange={(val) => {
                                            if (val) swapMember(index, val);
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <div className="pkg-product-cell-stack">
                                        <span className="pkg-member-name">{referencedProduct?.name || 'Unknown'}</span>
                                      </div>
                                    )}
                                  </td>
                                  {category === 'platform' && (
                                    <>
                                      <td>
                                        <CustomSelect
                                          className="pkg-inline-select"
                                          value={member.quote_edit_mode || 'read_only'}
                                          options={QUOTE_EDIT_OPTIONS}
                                          onChange={(val) => updateMember(index, 'quote_edit_mode', val)}
                                        />
                                      </td>
                                      <td>
                                        <CustomSelect
                                          className="pkg-inline-select"
                                          value={member.pricing_display || 'package_only'}
                                          options={PRICING_DISPLAY_OPTIONS}
                                          onChange={(val) => updateMember(index, 'pricing_display', val)}
                                        />
                                      </td>
                                    </>
                                  )}
                                  {category === 'support' && (
                                    <>
                                      <td>
                                        <CustomSelect
                                          className="pkg-inline-select"
                                          value={member.quote_edit_mode || 'read_only'}
                                          options={QUOTE_EDIT_OPTIONS}
                                          onChange={(val) => updateMember(index, 'quote_edit_mode', val)}
                                        />
                                      </td>
                                      <td>
                                        <CustomSelect
                                          className="pkg-inline-select"
                                          value={member.pricing_display || 'package_only'}
                                          options={PRICING_DISPLAY_OPTIONS}
                                          onChange={(val) => updateMember(index, 'pricing_display', val)}
                                        />
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

        </div>
        )}

        <div className="product-modal-group product-modal-group-quote-behavior">
          <div className="product-modal-group-label">QUOTE &amp; ORDER BEHAVIOR</div>

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
                <CustomSelect
                  value={f.term_behavior}
                  options={TERM_BEHAVIORS.map((b) => ({ value: b, label: b.charAt(0).toUpperCase() + b.slice(1) }))}
                  onChange={(val) => s('term_behavior', val)}
                />
              </div>
            </div>
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
                <input className="checkbox-circle" type="checkbox" checked={f.config.lock_quantity} onChange={(e) => sc('lock_quantity', e.target.checked)} id="lockQty" />
                <label htmlFor="lockQty" className="checkbox-label">Lock quantity</label>
              </div>
              <div className="checkbox-row">
                <input className="checkbox-circle" type="checkbox" checked={f.config.lock_price} onChange={(e) => sc('lock_price', e.target.checked)} id="lockPrice" />
                <label htmlFor="lockPrice" className="checkbox-label">Lock price</label>
              </div>
              <div className="checkbox-row">
                <input className="checkbox-circle" type="checkbox" checked={f.config.lock_discount} onChange={(e) => sc('lock_discount', e.target.checked)} id="lockDisc" />
                <label htmlFor="lockDisc" className="checkbox-label">Lock discount</label>
              </div>
              <div className="checkbox-row">
                <input className="checkbox-circle" type="checkbox" checked={f.config.lock_term} onChange={(e) => sc('lock_term', e.target.checked)} id="lockTerm" />
                <label htmlFor="lockTerm" className="checkbox-label">Lock term</label>
              </div>
            </div>

            {!isPackage && (
              <div className="grid-3">
                <div className="field">
                  <label className="field-label">Default Qty</label>
                  <input
                    className={`field-input field-input--label-typography ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                    type={shouldFormatConfigQtyWithCommas ? 'text' : 'number'}
                    inputMode={shouldFormatConfigQtyWithCommas ? 'numeric' : undefined}
                    value={shouldFormatConfigQtyWithCommas
                      ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:default_quantity')
                        ? creditInputDrafts['config:default_quantity']
                        : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.default_quantity, 1, 1), 1))
                      : f.config.default_quantity}
                    onFocus={() => {
                      if (!shouldFormatConfigQtyWithCommas) return;
                      setCreditInputDrafts((prev) => ({
                        ...prev,
                        'config:default_quantity': formatIntegerForEdit(f.config.default_quantity, 1, 1),
                      }));
                    }}
                    onChange={(e) => {
                      if (!shouldFormatConfigQtyWithCommas) {
                        sc('default_quantity', e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      setCreditInputDrafts((prev) => ({ ...prev, 'config:default_quantity': raw }));
                      sc('default_quantity', parsePositiveIntegerInput(raw, 1, 1));
                    }}
                    onBlur={(e) => {
                      if (!shouldFormatConfigQtyWithCommas) return;
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
                    className={`field-input field-input--label-typography ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                    type={shouldFormatConfigQtyWithCommas ? 'text' : 'number'}
                    inputMode={shouldFormatConfigQtyWithCommas ? 'numeric' : undefined}
                    value={shouldFormatConfigQtyWithCommas
                      ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:min_quantity')
                        ? creditInputDrafts['config:min_quantity']
                        : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.min_quantity, 1, 1), 1))
                      : f.config.min_quantity}
                    onFocus={() => {
                      if (!shouldFormatConfigQtyWithCommas) return;
                      setCreditInputDrafts((prev) => ({
                        ...prev,
                        'config:min_quantity': formatIntegerForEdit(f.config.min_quantity, 1, 1),
                      }));
                    }}
                    onChange={(e) => {
                      if (!shouldFormatConfigQtyWithCommas) {
                        sc('min_quantity', e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      setCreditInputDrafts((prev) => ({ ...prev, 'config:min_quantity': raw }));
                      sc('min_quantity', parsePositiveIntegerInput(raw, 1, 1));
                    }}
                    onBlur={(e) => {
                      if (!shouldFormatConfigQtyWithCommas) return;
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
                    className={`field-input field-input--label-typography ${isStepperProduct ? 'number-stepper-seat' : ''}`.trim()}
                    type={shouldFormatConfigQtyWithCommas ? 'text' : 'number'}
                    inputMode={shouldFormatConfigQtyWithCommas ? 'numeric' : undefined}
                    value={shouldFormatConfigQtyWithCommas
                      ? (Object.prototype.hasOwnProperty.call(creditInputDrafts, 'config:max_quantity')
                        ? creditInputDrafts['config:max_quantity']
                        : formatIntegerWithCommas(parsePositiveIntegerInput(f.config.max_quantity, 1, 1), 1))
                      : f.config.max_quantity}
                    onFocus={() => {
                      if (!shouldFormatConfigQtyWithCommas) return;
                      setCreditInputDrafts((prev) => ({
                        ...prev,
                        'config:max_quantity': formatIntegerForEdit(f.config.max_quantity, 1, 1),
                      }));
                    }}
                    onChange={(e) => {
                      if (!shouldFormatConfigQtyWithCommas) {
                        sc('max_quantity', e.target.value);
                        return;
                      }
                      const raw = e.target.value;
                      setCreditInputDrafts((prev) => ({ ...prev, 'config:max_quantity': raw }));
                      sc('max_quantity', parsePositiveIntegerInput(raw, 1, 1));
                    }}
                    onBlur={(e) => {
                      if (!shouldFormatConfigQtyWithCommas) return;
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
              <input className="checkbox-circle" type="checkbox" checked={f.config.edit_name} onChange={(e) => sc('edit_name', e.target.checked)} id="editName" />
              <label htmlFor="editName" className="checkbox-label">Allow editing product name on quote</label>
            </div>

            <div className="field">
              <label className="field-label">Default Description</label>
              <textarea className="field-textarea" value={f.config.default_description} onChange={(e) => sc('default_description', e.target.value)} placeholder="Default line item description..." />
            </div>
          </div>
        </div>

          <div className="modal-section">
          <button
            type="button"
            className="modal-section-label modal-section-toggle"
            onClick={() => toggleSection(COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS)}
            aria-expanded={openSections[COLLAPSIBLE_SECTION_KEYS.ENTITLEMENTS]}
          >
            <span className="modal-section-title-with-help">
              ADVANCED RULES (JSON)
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
              <ReactQuill
                className="product-terms-editor"
                value={toRichTextHtml(f.terms || '')}
                onChange={(value) => s('terms', isRichTextEmpty(value) ? '' : value)}
                placeholder="Enter any product-specific terms and conditions that will appear on the quote PDF for this line item..."
                modules={quillModules}
                formats={quillFormats}
              />
            </div>
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
