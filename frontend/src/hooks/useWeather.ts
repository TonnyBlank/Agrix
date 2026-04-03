import { useState, useEffect } from "react";

interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  windspeed: number | null;
  weathercode: number | null;
  loading: boolean;
  error: string | null;
  locationName: string | null;
}

// Use Nominatim to geocode a location string to lat/lon
async function geocodeLocation(location: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const query = encodeURIComponent(`${location}, Kenya`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name.split(",").slice(0, 2).join(", "),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch real weather from Open-Meteo (free, no API key needed)
async function fetchWeather(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
  const current = data.current;
  return {
    temperature: typeof current?.temperature_2m === "number" ? current.temperature_2m : null,
    windspeed: typeof current?.wind_speed_10m === "number" ? current.wind_speed_10m : null,
    weathercode: typeof current?.weather_code === "number" ? current.weather_code : null,
    humidity: typeof current?.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
  };
}

export function useWeather(location: string | null | undefined): WeatherData {
  const [weather, setWeather] = useState<WeatherData>({
    temperature: null,
    humidity: null,
    windspeed: null,
    weathercode: null,
    loading: false,
    error: null,
    locationName: null,
  });

  useEffect(() => {
    if (!location) {
      setWeather({
        temperature: null,
        humidity: null,
        windspeed: null,
        weathercode: null,
        loading: false,
        error: null,
        locationName: null,
      });
      return;
    }

    let cancelled = false;
    setWeather((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      const geo = await geocodeLocation(location);
      if (cancelled) return;

      if (!geo) {
        setWeather({
          temperature: null,
          humidity: null,
          windspeed: null,
          weathercode: null,
          loading: false,
          error: "Could not find location",
          locationName: location,
        });
        return;
      }

      try {
        const w = await fetchWeather(geo.lat, geo.lon);
        if (!cancelled) {
          setWeather({
            ...w,
            loading: false,
            error: null,
            locationName: geo.displayName,
          });
        }
      } catch {
        if (!cancelled) {
          setWeather({
            temperature: null,
            humidity: null,
            windspeed: null,
            weathercode: null,
            loading: false,
            error: "Weather data unavailable",
            locationName: geo.displayName,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location]);

  return weather;
}
