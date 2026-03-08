import { getStore } from '@netlify/blobs';

const KEY = 'quotes';

export default async (req) => {
  const store = getStore('deal-studio');

  if (req.method === 'GET') {
    const quotes = await store.get(KEY, { type: 'json' });
    return Response.json(Array.isArray(quotes) ? quotes : []);
  }

  if (req.method === 'PUT') {
    let quotes;

    try {
      quotes = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Array.isArray(quotes)) {
      return Response.json({ error: 'Body must be an array of quotes' }, { status: 400 });
    }

    await store.setJSON(KEY, quotes);
    return Response.json(quotes);
  }

  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'GET, PUT',
    },
  });
};
