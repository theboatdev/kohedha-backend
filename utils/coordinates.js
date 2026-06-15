/**
 * Validates a latitude/longitude coordinate pair.
 *
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {{ valid: boolean; message?: string }}
 */
export function validateCoordinates(lat, lng) {
  if (lat == null || lng == null) {
    return { valid: false, message: "Both latitude and longitude are required." };
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!isFinite(latNum) || !isFinite(lngNum)) {
    return { valid: false, message: "Latitude and longitude must be valid numbers." };
  }

  if (latNum < -90 || latNum > 90) {
    return { valid: false, message: "Latitude must be between -90 and 90." };
  }

  if (lngNum < -180 || lngNum > 180) {
    return { valid: false, message: "Longitude must be between -180 and 180." };
  }

  return { valid: true };
}
