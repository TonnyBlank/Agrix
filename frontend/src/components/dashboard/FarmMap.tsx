import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { cn } from "@/lib/utils";

delete (L.Icon.Default.prototype as typeof L.Icon.Default.prototype & { _getIconUrl?: unknown })._getIconUrl;
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
  coordinates?: { lat: number; lng: number } | null;
  editable?: boolean;
  onSelectCoordinates?: (coordinates: { lat: number; lng: number }) => void;
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

function MapClickCapture({
  enabled,
  onSelectCoordinates,
}: {
  enabled: boolean;
  onSelectCoordinates?: (coordinates: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(event) {
      if (!enabled || !onSelectCoordinates) return;
      onSelectCoordinates({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

export default function FarmMap({
  location,
  subCounty,
  heightClassName = "h-48",
  coordinates,
  editable = false,
  onSelectCoordinates,
}: FarmMapProps) {
  const [geo, setGeo] = useState<GeoResult | null>(null);
  const [loading, setLoading] = useState(false);

  const searchQuery = [subCounty, location].filter(Boolean).join(", ");
  const activeCoordinates = useMemo(() => {
    if (coordinates) {
      return {
        lat: coordinates.lat,
        lon: coordinates.lng,
        displayName: "Saved farm GPS point",
      };
    }

    return geo;
  }, [coordinates, geo]);

  useEffect(() => {
    if (coordinates) {
      setLoading(false);
      return;
    }

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
  }, [coordinates, searchQuery]);

  if (loading) {
    return (
      <div className={cn("relative z-0 flex items-center justify-center rounded-2xl border border-border bg-muted/50 text-sm text-muted-foreground animate-pulse", heightClassName)}>
        Locating {searchQuery}...
      </div>
    );
  }

  if (!activeCoordinates) {
    return (
      <div className={cn("relative z-0 flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-4 text-center text-xs text-muted-foreground", heightClassName)}>
        {editable ? "Capture your GPS or click the map to save the exact farm point" : "Set your county to see your farm location on the map"}
      </div>
    );
  }

  return (
    <div className={cn("relative z-0 overflow-hidden rounded-2xl border border-border shadow-sm", heightClassName)}>
      <MapContainer
        center={[activeCoordinates.lat, activeCoordinates.lon]}
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
        <MapRecenter lat={activeCoordinates.lat} lon={activeCoordinates.lon} />
        <MapClickCapture enabled={editable} onSelectCoordinates={onSelectCoordinates} />
        <Marker position={[activeCoordinates.lat, activeCoordinates.lon]}>
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{editable ? "Farm GPS Point" : "My Farm"}</p>
              <p>{activeCoordinates.displayName}</p>
              {editable ? <p className="mt-1">Click anywhere on the map to move this point.</p> : null}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
