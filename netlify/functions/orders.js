import { getStore } from '@netlify/blobs';

const KEY = 'orders';

export default async (req) => {
  const store = getStore('deal-studio');

  if (req.method === 'GET') {
    const orders = await store.get(KEY, { type: 'json' });
    return Response.json(Array.isArray(orders) ? orders : []);
  }

  if (req.method === 'PUT') {
    let orders;
    try {
      orders = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!Array.isArray(orders)) {
      return Response.json({ error: 'Body must be an array of orders' }, { status: 400 });
    }
    await store.setJSON(KEY, orders);
    return Response.json(orders);
  }

  return new Response(null, { status: 405, headers: { Allow: 'GET, PUT' } });
};
