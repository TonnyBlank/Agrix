import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { cn } from "@/lib/utils";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
}

interface FarmMapProps {
  location: string;
  subCounty?: string;
  heightClassName?: string;
}

async function geocodeLocation(location: string): Promise<GeoResult | null> {
  try {
    const query = encodeURIComponent(`${location}, Kenya`);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name.split(",").slice(0, 3).join(", "),
    };
  } catch {
    return null;
  }
}

function MapRecenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lon], 13, { animate: true });
  }, [lat, lon, map]);

  return null;
}

export default function FarmMap({ location, subCounty, heightClassName = "h-48" }: FarmMapProps) {
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [loading, setLoading] = useState(false);

  const searchQuery = [subCounty, location].filter(Boolean).join(", ");

  useEffect(() => {
    if (!searchQuery.trim()) {
      setGeo(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    geocodeLocation(searchQuery).then((result) => {
      if (!cancelled) {
        setGeo(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  if (loading) {
    return (
      <div className={cn("relative z-0 flex items-center justify-center rounded-2xl border border-border bg-muted/50 text-sm text-muted-foreground animate-pulse", heightClassName)}>
        Locating {searchQuery}...
      </div>
    );
  }

  if (!geo) {
    return (
      <div className={cn("relative z-0 flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-4 text-center text-xs text-muted-foreground", heightClassName)}>
        Set your county to see your farm location on the map
      </div>
    );
  }

  return (
    <div className={cn("relative z-0 overflow-hidden rounded-2xl border border-border shadow-sm", heightClassName)}>
      <MapContainer
        center={[geo.lat, geo.lon]}
        zoom={13}
        className="z-0"
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <MapRecenter lat={geo.lat} lon={geo.lon} />
        <Marker position={[geo.lat, geo.lon]}>
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">My Farm</p>
              <p>{geo.displayName}</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
