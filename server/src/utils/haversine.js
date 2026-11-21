/**
 * Haversine Distance Calculator (Pure JavaScript)
 * Calculates the great-circle distance between two points on the Earth's surface.
 * Earth radius = 6371.0088 km
 */

const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates straight-line distance in kilometers between two coordinates.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers rounded to 2 decimal places
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined || lon1 === undefined ||
    lat2 === undefined || lon2 === undefined ||
    isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)
  ) {
    return null;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = EARTH_RADIUS_KM * c;

  return Math.round(distanceKm * 100) / 100;
}

/**
 * Attaches distanceKm to an array of institutions and sorts them ascending by distance.
 * @param {number} originLat
 * @param {number} originLon
 * @param {Array} institutions
 * @returns {Array} Sorted institutions with distanceKm property
 */
export function sortByDistance(originLat, originLon, institutions = []) {
  if (isNaN(originLat) || isNaN(originLon)) {
    return institutions;
  }

  return institutions
    .map((inst) => {
      const distanceKm = calculateHaversineDistance(
        originLat,
        originLon,
        inst.latitude,
        inst.longitude
      );
      return {
        ...inst,
        distanceKm
      };
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

