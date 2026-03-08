import { getStore } from '@netlify/blobs';

const store = getStore('deal-studio');
const KEY = 'catalog';

function normalizeCatalog(payload) {
  if (Array.isArray(payload)) {
    return { products: payload, pricebooks: [] };
  }

  return {
    products: Array.isArray(payload?.products) ? payload.products : [],
    pricebooks: Array.isArray(payload?.pricebooks) ? payload.pricebooks : [],
  };
}

export default async (req) => {
  if (req.method === 'GET') {
    const catalog = await store.get(KEY, { type: 'json' });
    return Response.json(normalizeCatalog(catalog));
  }

  if (req.method === 'PUT') {
    let payload;

    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const catalog = normalizeCatalog(payload);

    if (!Array.isArray(catalog.products) || !Array.isArray(catalog.pricebooks)) {
      return Response.json({ error: 'Body must include products and pricebooks arrays' }, { status: 400 });
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
