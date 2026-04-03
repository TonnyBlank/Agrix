type GeoPoint = {
  lat: number;
  lon: number;
};

const coordinateCache = new Map<string, GeoPoint | null>();
const pendingLookups = new Map<string, Promise<GeoPoint | null>>();

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(origin: GeoPoint, destination: GeoPoint) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lon - origin.lon);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) * Math.cos(toRadians(destination.lat)) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeLocationName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function geocodeKenyanLocation(location: string): Promise<GeoPoint | null> {
  const normalizedLocation = normalizeLocationName(location);

  if (!normalizedLocation) {
    return null;
  }

  if (coordinateCache.has(normalizedLocation)) {
    return coordinateCache.get(normalizedLocation) ?? null;
  }

  const existingLookup = pendingLookups.get(normalizedLocation);
  if (existingLookup) {
    return existingLookup;
  }

  const lookup = fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${location}, Kenya`)}&format=json&limit=1`,
    { headers: { "Accept-Language": "en" } },
  )
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data || data.length === 0) {
        return null;
      }

      const lat = Number.parseFloat(data[0].lat);
      const lon = Number.parseFloat(data[0].lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return { lat, lon };
    })
    .catch(() => null)
    .then((result) => {
      coordinateCache.set(normalizedLocation, result);
      pendingLookups.delete(normalizedLocation);
      return result;
    });

  pendingLookups.set(normalizedLocation, lookup);
  return lookup;
}

export async function getApproxDistanceKm(originLocation: string | null | undefined, destinationLocation: string | null | undefined) {
  const normalizedOrigin = normalizeLocationName(originLocation);
  const normalizedDestination = normalizeLocationName(destinationLocation);

  if (!normalizedOrigin || !normalizedDestination) {
    return null;
  }

  if (normalizedOrigin === normalizedDestination) {
    return 0;
  }

  const [origin, destination] = await Promise.all([
    geocodeKenyanLocation(originLocation as string),
    geocodeKenyanLocation(destinationLocation as string),
  ]);

  if (!origin || !destination) {
    return null;
  }

  return haversineDistanceKm(origin, destination);
}

export function formatApproxDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return null;
  }

  if (distanceKm < 1) {
    return "Same county";
  }

  if (distanceKm < 10) {
    return `Approx. ${distanceKm.toFixed(1)} km away`;
  }

  return `Approx. ${Math.round(distanceKm)} km away`;
}
