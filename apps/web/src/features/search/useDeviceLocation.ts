import { useCallback, useState } from 'react';

export type DeviceLocationFailure = 'denied' | 'unavailable' | 'unsupported';

export type DeviceLocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'located'; lat: number; lng: number }
  | { status: 'failed'; reason: DeviceLocationFailure };

// A rough fix is enough to rank cold rooms, and it comes faster and drains less battery.
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 5 * 60_000,
};

/** `known` is a location found earlier, so coming back to the screen does not ask again. */
export const useDeviceLocation = (known?: { lat: number; lng: number }) => {
  const [state, setState] = useState<DeviceLocationState>(
    known ? { status: 'located', ...known } : { status: 'idle' },
  );

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'failed', reason: 'unsupported' });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setState({ status: 'located', lat: coords.latitude, lng: coords.longitude }),
      (error) =>
        setState({
          status: 'failed',
          reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        }),
      POSITION_OPTIONS,
    );
  }, []);

  return { state, locate };
};
