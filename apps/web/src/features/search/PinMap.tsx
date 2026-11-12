import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  circleMarker,
  map as createMap,
  tileLayer,
  type CircleMarker,
  type LatLngTuple,
  type Map as LeafletMap,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './PinMap.css';

// Central Ibadan, where most farmers and cold rooms are.
const START: LatLngTuple = [7.3964, 3.9167];
const START_ZOOM = 11;
const PIN_ZOOM = 14;

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// OpenStreetMap's tile policy requires this credit on the map.
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface PinMapProps {
  pin: { lat: number; lng: number } | undefined;
  onPick: (lat: number, lng: number) => void;
  /** What tapping the map does, for screen readers. */
  label: string;
}

const PinMap = ({ pin, onPick, label }: PinMapProps) => {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap>(undefined);
  const markerRef = useRef<CircleMarker>(undefined);
  const onPickRef = useRef(onPick);
  const initialPin = useRef(pin);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    if (!container.current) return;
    const start = initialPin.current;
    const leafletMap = createMap(container.current, {
      center: start ? [start.lat, start.lng] : START,
      zoom: start ? PIN_ZOOM : START_ZOOM,
    });
    tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(leafletMap);
    leafletMap.on('click', ({ latlng }) => onPickRef.current(latlng.lat, latlng.lng));
    mapRef.current = leafletMap;
    return () => {
      leafletMap.remove();
      mapRef.current = undefined;
      markerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const leafletMap = mapRef.current;
    if (!leafletMap || !pin) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    } else {
      markerRef.current = circleMarker([pin.lat, pin.lng], {
        radius: 10,
        className: 'pin-marker',
      }).addTo(leafletMap);
    }
  }, [pin]);

  const pinCentre = () => {
    const centre = mapRef.current?.getCenter();
    if (centre) onPick(centre.lat, centre.lng);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={container}
        aria-label={label}
        className="h-64 rounded-xl overflow-hidden border border-line-strong z-0"
      />
      <button
        type="button"
        onClick={pinCentre}
        className="self-start min-h-12 px-1 text-primary-strong font-medium text-body underline"
      >
        {t('search.location.pinCentre')}
      </button>
    </div>
  );
};

export default PinMap;
