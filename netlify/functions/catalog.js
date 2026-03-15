import { getStore } from '@netlify/blobs';

const KEY = 'catalog';
const BACKUP_KEY_PREFIX = 'catalog_backup_';

function toCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function getDestructiveReasons(current, incoming) {
  const currentProductCount = toCount(current?.products);
  const currentPricebookCount = toCount(current?.pricebooks);
  const incomingProductCount = toCount(incoming?.products);
  const incomingPricebookCount = toCount(incoming?.pricebooks);
  const isBootstrapCatalog = currentProductCount === 0 && currentPricebookCount === 0;

  if (isBootstrapCatalog) return [];

  const reasons = [];

  if (incomingProductCount === 0) reasons.push('products_empty');
  if (incomingPricebookCount === 0) reasons.push('pricebooks_empty');
  if (currentProductCount > 0 && incomingProductCount < currentProductCount * 0.5) {
    reasons.push('products_drop_over_50_percent');
  }

  return reasons;
}

function normalizeCatalog(payload) {
  if (Array.isArray(payload)) {
    return { products: payload, pricebooks: [], initialized: true };
  }

  return {
    products: Array.isArray(payload?.products) ? payload.products : [],
    pricebooks: Array.isArray(payload?.pricebooks) ? payload.pricebooks : [],
    initialized: true,
  };
}

export default async (req) => {
  const store = getStore('deal-studio');

  if (req.method === 'GET') {
    const catalog = await store.get(KEY, { type: 'json' });
    if (catalog == null) {
      return Response.json({ products: [], pricebooks: [], initialized: false });
    }
    return Response.json(normalizeCatalog(catalog));
  }

  if (req.method === 'PUT') {
    let payload;
    const requestUrl = new URL(req.url);

    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const catalog = normalizeCatalog(payload);

    if (!Array.isArray(catalog.products) || !Array.isArray(catalog.pricebooks)) {
      return Response.json({ error: 'Body must include products and pricebooks arrays' }, { status: 400 });
    }

    const existingCatalogRaw = await store.get(KEY, { type: 'json' });
    const existingCatalog = existingCatalogRaw == null
      ? { products: [], pricebooks: [], initialized: false }
      : normalizeCatalog(existingCatalogRaw);

    const destructiveReasons = getDestructiveReasons(existingCatalog, catalog);
    const hasConfirmationOverride = isTrue(payload?.confirm_destructive)
      || isTrue(requestUrl.searchParams.get('confirm_destructive'))
      || isTrue(req.headers.get('x-catalog-destructive-confirm'));

    if (destructiveReasons.length > 0 && !hasConfirmationOverride) {
      return Response.json(
        {
          error: 'Destructive catalog update requires explicit confirmation',
          requires_confirmation: true,
          warning: 'Warning: This operation will significantly reduce the catalog size.',
          reasons: destructiveReasons,
          current: {
            products: toCount(existingCatalog.products),
            pricebooks: toCount(existingCatalog.pricebooks),
          },
          incoming: {
            products: toCount(catalog.products),
            pricebooks: toCount(catalog.pricebooks),
          },
        },
        { status: 409 },
      );
    }

    if (existingCatalogRaw != null) {
      const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
      const backupKey = `${BACKUP_KEY_PREFIX}${timestamp}`;
      await store.setJSON(backupKey, normalizeCatalog(existingCatalogRaw));
    }

    await store.setJSON(KEY, catalog);
    return Response.json(catalog);
  }

  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'GET, PUT',
    },
  });
};
