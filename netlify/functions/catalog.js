import { getStore } from '@netlify/blobs';

const store = getStore('deal-studio');
const KEY = 'catalog';

export default async (req) => {
  if (req.method === 'GET') {
    const products = await store.get(KEY, { type: 'json' });
    return Response.json(Array.isArray(products) ? products : []);
  }

  if (req.method === 'PUT') {
    let products;

    try {
      products = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Array.isArray(products)) {
      return Response.json({ error: 'Body must be an array of products' }, { status: 400 });
    }

    await store.setJSON(KEY, products);
    return Response.json(products);
  }

  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'GET, PUT',
    },
  });
};
