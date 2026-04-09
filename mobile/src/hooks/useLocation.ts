import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

type LocationState = {
  speedMph: number;
  fuzzyCity: string | null;
  permitted: boolean;
};

export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>({ speedMph: 0, fuzzyCity: null, permitted: false });

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      setState(s => ({ ...s, permitted: true }));

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
        loc => {
          const mps = loc.coords.speed ?? 0;
          const mph = mps * 2.237;
          setState(s => ({ ...s, speedMph: Math.max(0, mph) }));
        }
      );
    })();

    return () => { sub?.remove(); };
  }, []);

  return state;
}
