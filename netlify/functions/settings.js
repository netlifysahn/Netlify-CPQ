import { getStore } from '@netlify/blobs';

const KEY = 'settings';
const FALLBACK_SETTINGS = {
  terms: {
    sections: [],
  },
};

function normalizeSection(section, index) {
  if (!section || typeof section !== 'object') {
    return {
      id: `term_${index + 1}`,
      title: '',
      body: '',
    };
  }

  return {
    ...section,
    id: String(section.id || `term_${index + 1}`),
    title: typeof section.title === 'string' ? section.title : '',
    body: typeof section.body === 'string' ? section.body : '',
  };
}

function normalizeSettings(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...FALLBACK_SETTINGS };
  }

  const sections = Array.isArray(payload?.terms?.sections)
    ? payload.terms.sections.map(normalizeSection)
    : FALLBACK_SETTINGS.terms.sections;

  return {
    ...payload,
    terms: {
      ...payload.terms,
      sections,
    },
  };
}

export default async (req) => {
  const store = getStore({ name: 'deal-studio', consistency: 'strong' });

  if (req.method === 'GET') {
    const settings = await store.get(KEY, { type: 'json' });
    return Response.json(normalizeSettings(settings), {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  if (req.method === 'PUT') {
    let payload;

    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const settings = normalizeSettings(payload);
    await store.setJSON(KEY, settings);
    return Response.json(settings, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(null, {
    status: 405,
    headers: {
      Allow: 'GET, PUT',
    },
  });
};
