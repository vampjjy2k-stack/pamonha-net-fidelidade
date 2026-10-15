// Geocodificação via LocationIQ.
// A chave fica exclusivamente nas variáveis de ambiente do servidor.

const LOCATIONIQ_BASE = 'https://us1.locationiq.com/v1';

function requireApiKey() {
  const key = String(process.env.LOCATIONIQ_API_KEY || '').trim();
  if (!key) throw new Error('LOCATIONIQ_API_KEY não configurada no servidor.');
  return key;
}

function shortLabel(address, displayName = '') {
  const a = address || {};
  const ponto = a.amenity || a.shop || a.leisure || a.tourism || null;
  const rua = a.road || a.pedestrian || a.footway || null;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || null;
  const cidade = a.city || a.town || a.village || a.municipality || null;
  const partes = [ponto, rua, bairro, cidade].filter(Boolean);
  return partes.filter((p, i) => partes.indexOf(p) === i).slice(0, 3).join(', ') || String(displayName).split(',')[0];
}

async function locationIqFetch(path, params, timeoutMs = 7000) {
  const key = requireApiKey();
  const query = new URLSearchParams({ ...params, key, format: 'json', 'accept-language': 'pt-BR' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${LOCATIONIQ_BASE}/${path}?${query}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PamonhaNetFidelidade/1.0 (cartao fidelidade; contato via site)' },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[LocationIQ]', response.status, body.slice(0, 300));
      throw new Error('Serviço de endereços indisponível. Tente novamente.');
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchLocationIq(query) {
  const data = await locationIqFetch('search', {
    q: String(query),
    countrycodes: 'br',
    addressdetails: '1',
    limit: '8',
  });
  return (Array.isArray(data) ? data : []).map((item) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const address = item.address || {};
    return {
      displayName: item.display_name,
      shortLabel: shortLabel(address, item.display_name),
      lat,
      lng,
      temCidade: !!(address.city || address.town || address.village || address.municipality),
      type: item.type || '',
      category: item.category || '',
    };
  }).filter(Boolean).sort((a, b) => (b.temCidade ? 1 : 0) - (a.temCidade ? 1 : 0));
}

async function reverseLocationIq(lat, lng) {
  const data = await locationIqFetch('reverse', {
    lat: String(lat),
    lon: String(lng),
    addressdetails: '1',
  });
  if (!data || !data.address) return null;
  return {
    displayName: data.display_name || '',
    shortLabel: shortLabel(data.address, data.display_name),
    lat: Number(lat),
    lng: Number(lng),
  };
}

module.exports = { searchLocationIq, reverseLocationIq };
