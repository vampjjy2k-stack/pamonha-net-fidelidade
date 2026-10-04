
// carro-core.js — regras do "Carro da Pamonha", sem depender de Express nem Mongoose.
// A lógica pura fica aqui; routes/carro.js só liga isso ao Express/Mongo.

const EARTH_M = 6371000;
const SINAL_FRACO_MS = 90 * 1000;          // 90s sem posição nova = "sinal fraco"
const SEM_SINAL_PARAR_MS = 10 * 60 * 1000; // 10min sem posição = encerra sozinho
const GEOCODE_MIN_MOVE_M = 120;            // só consulta endereço de novo se andou 120m+
const GEOCODE_MAX_AGE_MS = 5 * 60 * 1000;  //  ...ou se passaram 5min
const GEOCODE_MIN_GAP_MS = 2000;           // limite educado do Nominatim

function haversineM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

class CarroError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function parseCoords(body) {
  const lat = Number(body && body.lat);
  const lng = Number(body && body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new CarroError('Localização inválida. Ative o GPS do celular e tente de novo.');
  }
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const accuracy = num(body.accuracy);
  return {
    lat, lng,
    accuracy: accuracy !== null && accuracy >= 0 ? Math.round(accuracy) : null,
    speed: num(body.speed) !== null && num(body.speed) >= 0 ? Number(num(body.speed).toFixed(1)) : null,
    heading: num(body.heading) !== null ? Math.round(num(body.heading)) % 360 : null,
  };
}

function cleanText(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseDate(v, nome) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new CarroError(`Data inválida em "${nome}".`);
  return d;
}

function avisoStatus(aviso, now) {
  if (!aviso || !aviso.message) return null;
  const t = now.getTime();
  if (aviso.hideAt && t >= new Date(aviso.hideAt).getTime()) return 'encerrado';
  if (aviso.showAt && t < new Date(aviso.showAt).getTime()) return 'agendado';
  return 'ativo';
}

function publicView(doc, now = new Date()) {
  const live = !!(doc && doc.live);
  const pos = live && doc.position && doc.position.at ? doc.position : null;
  const status = doc ? avisoStatus(doc.aviso, now) : null;
  return {
    live,
    position: pos ? {
      lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy ?? null,
      speed: pos.speed ?? null, heading: pos.heading ?? null, at: new Date(pos.at).toISOString(),
    } : null,
    place: live && doc.placeName ? { name: doc.placeName, source: doc.placeSource || null, localId: doc.localId || null } : null,
    signal: pos ? (now.getTime() - new Date(pos.at).getTime() > SINAL_FRACO_MS ? 'fraco' : 'ok') : null,
    startedAt: live && doc.startedAt ? new Date(doc.startedAt).toISOString() : null,
    aviso: status && status !== 'encerrado' ? {
      message: doc.aviso.message,
      place: doc.aviso.place || '',
      showAt: doc.aviso.showAt ? new Date(doc.aviso.showAt).toISOString() : null,
      hideAt: doc.aviso.hideAt ? new Date(doc.aviso.hideAt).toISOString() : null,
      status,
    } : null,
    serverTime: now.toISOString(),
  };
}

function adminView(doc, now = new Date()) {
  const base = publicView(doc, now);
  const status = doc ? avisoStatus(doc.aviso, now) : null;
  base.avisoAdmin = status ? {
    message: doc.aviso.message, place: doc.aviso.place || '',
    showAt: doc.aviso.showAt ? new Date(doc.aviso.showAt).toISOString() : null,
    hideAt: doc.aviso.hideAt ? new Date(doc.aviso.hideAt).toISOString() : null,
    status,
  } : null;
  return base;
}

function createCarroService(deps) {
  const now = deps.now || (() => new Date());
  let lastGeocode = { at: 0, lat: null, lng: null, name: null };

  async function getDoc() {
    return (await deps.store.load()) || { live: false };
  }
  async function persist(doc) {
    doc.updatedAt = now();
    await deps.store.save(doc);
    return doc;
  }
  function emit(doc) {
    try { deps.broadcast('carro', publicView(doc, now())); } catch (_) { /* SSE nunca derruba a API */ }
  }

  async function resolvePlace(coords, manualName) {
    if (manualName) return { name: manualName, source: 'manual', localId: null };
    let locais = [];
    try { locais = (await deps.listLocais()) || []; } catch (_) { locais = []; }
    let best = null;
    for (const l of locais) {
      const d = haversineM(coords, { lat: l.lat, lng: l.lng });
      const raio = Number(l.radiusMeters) || 150;
      if (d <= raio && (!best || d < best.d)) best = { l, d };
    }
    if (best) return { name: best.l.name, source: 'local', localId: String(best.l._id) };

    const t = now().getTime();
    const moved = lastGeocode.lat === null ? Infinity : haversineM(coords, lastGeocode);
    const fresh = lastGeocode.name && moved < GEOCODE_MIN_MOVE_M && t - lastGeocode.at < GEOCODE_MAX_AGE_MS;
    if (fresh) return { name: lastGeocode.name, source: 'osm', localId: null };
    if (t - lastGeocode.at < GEOCODE_MIN_GAP_MS && lastGeocode.name) {
      return { name: lastGeocode.name, source: 'osm', localId: null };
    }
    lastGeocode.at = t;
    let name = null;
    try { name = await deps.geocode(coords.lat, coords.lng); } catch (_) { name = null; }
    if (name) lastGeocode = { at: t, lat: coords.lat, lng: coords.lng, name };
    return { name: name || null, source: name ? 'osm' : null, localId: null };
  }

  return {
    async getPublic() { return publicView(await getDoc(), now()); },
    async getAdmin() { return adminView(await getDoc(), now()); },

    async iniciar(body, adminId) {
      const c = parseCoords(body);
      const manual = cleanText(body.placeName, 80);
      const doc = await getDoc();
      const place = await resolvePlace(c, manual);
      doc.live = true;
      doc.startedAt = now();
      doc.startedBy = adminId || null;
      doc.manualPlaceName = manual || null;
      doc.position = { ...c, at: now() };
      doc.placeName = place.name;
      doc.placeSource = place.source;
      doc.localId = place.localId;
      await persist(doc);
      emit(doc);
      return adminView(doc, now());
    },

    async posicao(body) {
      const doc = await getDoc();
      if (!doc.live) throw new CarroError('O Carro da Pamonha não está ativo. Toque em "Entrar no carro" primeiro.', 409);
      const c = parseCoords(body);
      doc.position = { ...c, at: now() };
      const place = await resolvePlace(c, doc.manualPlaceName);
      if (place.name || place.source === 'local') {
        doc.placeName = place.name; doc.placeSource = place.source; doc.localId = place.localId;
      }
      await persist(doc);
      emit(doc);
      return adminView(doc, now());
    },

    async setLugarManual(body) {
      const doc = await getDoc();
      if (!doc.live) throw new CarroError('O Carro da Pamonha não está ativo.', 409);
      const name = cleanText(body && body.placeName, 80);
      doc.manualPlaceName = name || null;
      if (name) { doc.placeName = name; doc.placeSource = 'manual'; doc.localId = null; }
      else if (doc.position) {
        const place = await resolvePlace(doc.position, null);
        doc.placeName = place.name; doc.placeSource = place.source; doc.localId = place.localId;
      }
      await persist(doc);
      emit(doc);
      return adminView(doc, now());
    },

    async parar() {
      const doc = await getDoc();
      doc.live = false;
      doc.position = null;
      doc.placeName = null; doc.placeSource = null; doc.localId = null;
      doc.startedAt = null; doc.manualPlaceName = null;
      await persist(doc);
      emit(doc);
      return adminView(doc, now());
    },

    async setAviso(body) {
      const message = cleanText(body && body.message, 200);
      if (!message) throw new CarroError('Escreva o aviso que os clientes vão ver.');
      const showAt = parseDate(body.showAt, 'início');
      const hideAt = parseDate(body.hideAt, 'término');
      if (hideAt && hideAt.getTime() <= now().getTime()) throw new CarroError('O horário de término já passou. Escolha um horário futuro.');
      if (showAt && hideAt && hideAt.getTime() <= showAt.getTime()) throw new CarroError('O término precisa ser depois do início.');
      const doc = await getDoc();
      doc.aviso = { message, place: cleanText(body.place, 80), showAt, hideAt };
      await persist(doc);
      emit(doc);
      return adminView(doc, now());
    },

    async clearAviso() {
      const doc = await getDoc();
      doc.aviso = null;
      await persist(doc);
      emit(doc);
      return adminView(doc, now());
    },

    async sweep() {
      const doc = await deps.store.load();
      if (!doc || !doc.live) return false;
      const t = now().getTime();
      const passouHorario = doc.aviso && doc.aviso.hideAt && t >= new Date(doc.aviso.hideAt).getTime();
      const semSinal = !doc.position || t - new Date(doc.position.at).getTime() > SEM_SINAL_PARAR_MS;
      if (!passouHorario && !semSinal) return false;
      await this.parar();
      return passouHorario ? 'horario' : 'sem-sinal';
    },
  };
}

// Converte a resposta do Nominatim num nome curto: "Rua X · Bairro Y · Cidade".
function nomeDoEndereco(json) {
  if (!json || !json.address) return null;
  const a = json.address;
  const ponto = a.marketplace || a.amenity || a.shop || a.leisure || a.tourism || null;
  const rua = a.road || a.pedestrian || a.footway || null;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || null;
  const cidade = a.city || a.town || a.village || a.municipality || null;
  const partes = [ponto, rua, bairro, cidade].filter(Boolean);
  const unicas = partes.filter((p, i) => partes.indexOf(p) === i);
  return unicas.length ? unicas.slice(0, 3).join(' · ') : (json.display_name ? String(json.display_name).split(',').slice(0, 3).join(' ·').trim() : null);
}

module.exports = {
  createCarroService, publicView, adminView, avisoStatus, haversineM, parseCoords,
  nomeDoEndereco, CarroError, SINAL_FRACO_MS, SEM_SINAL_PARAR_MS,
};
