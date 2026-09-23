// utils/geo.js
// Cálculo de distância entre dois pontos geográficos (fórmula de Haversine).
// Usado para casar o GPS de uma venda com o Local cadastrado mais próximo.

const EARTH_RADIUS_METERS = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Distância em metros entre dois pontos (lat/lng em graus decimais).
 */
function distanceInMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Dado um ponto (lat/lng) e uma lista de Locais (cada um com location.lat, location.lng, radiusMeters),
 * retorna o local mais próximo cujo raio cobre o ponto, ou null se nenhum cobrir.
 * Também retorna a lista de candidatos mais próximos (até 3), úteis quando nenhum bate,
 * para o admin escolher manualmente ou decidir cadastrar um novo local.
 */
function matchLocal(lat, lng, locais) {
  const withDistance = locais
    .map((local) => ({
      local,
      distance: distanceInMeters(lat, lng, local.lat, local.lng),
    }))
    .sort((a, b) => a.distance - b.distance);

  const match = withDistance.find((item) => item.distance <= item.local.radiusMeters);

  return {
    match: match ? match.local : null,
    matchDistance: match ? match.distance : null,
    nearest: withDistance.slice(0, 3).map((item) => ({
      local: item.local,
      distance: Math.round(item.distance),
    })),
  };
}

module.exports = { distanceInMeters, matchLocal };
