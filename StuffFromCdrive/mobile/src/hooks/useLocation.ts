import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

type LocationState = {
  speedMph:     number;
  fuzzyCity:    string | null;
  fuzzyDistrict: string | null;   // neighbourhood / district for dedup tier 2
  permitted:    boolean;
  latitude:     number | null;
  longitude:    number | null;
};

// Reverse geocode at most once per this many metres of movement.
// City/district changes slowly — no need to hammer the geocoder.
const GEOCODE_DISTANCE_THRESHOLD_M = 500;

export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>({
    speedMph:      0,
    fuzzyCity:     null,
    fuzzyDistrict: null,
    permitted:     false,
    latitude:      null,
    longitude:     null,
  });

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let lastGeocodedLat: number | null = null;
    let lastGeocodedLon: number | null = null;

    function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6_371_000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      setState(s => ({ ...s, permitted: true }));

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 10 },
        async loc => {
          const mps = loc.coords.speed ?? 0;
          const mph = Math.max(0, mps * 2.237);
          const lat  = loc.coords.latitude;
          const lon  = loc.coords.longitude;

          setState(s => ({ ...s, speedMph: mph, latitude: lat, longitude: lon }));

          // Throttle geocoding — only run when we've moved far enough
          const moved =
            lastGeocodedLat === null ||
            distanceM(lastGeocodedLat, lastGeocodedLon!, lat, lon) >= GEOCODE_DISTANCE_THRESHOLD_M;

          if (!moved) return;
          lastGeocodedLat = lat;
          lastGeocodedLon = lon;

          try {
            const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
            const city     = place?.city ?? place?.subregion ?? place?.region ?? null;
            // District: most specific sub-city division available
            const district = place?.district ?? place?.subregion ?? city;
            setState(s => ({ ...s, fuzzyCity: city, fuzzyDistrict: district }));
          } catch {
            // Geocode failed — existing values persist, non-fatal
          }
        },
      );
    })();

    return () => { sub?.remove(); };
  }, []);

  return state;
}
