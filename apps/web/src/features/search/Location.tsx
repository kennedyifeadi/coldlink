import React, { lazy, Suspense, useState, type ReactNode } from 'react';
import { Check, Crosshair, MapPin, MapPinned, Search, type LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import Notice from '../../components/ui/Notice';
import PageHeader from '../../components/ui/PageHeader';
import StepProgress from '../../components/ui/StepProgress';
import { inputClasses } from '../../components/ui/inputStyles';
import { areas, type AreaId } from './areas';
import {
  SEARCH_STEPS,
  searchNoticeStateSchema,
  useSearchFlow,
  type SearchPlace,
} from './searchFlow';
import { useDeviceLocation, type DeviceLocationFailure } from './useDeviceLocation';

// Leaflet only loads for farmers who open the map, so it never slows the first screens.
const PinMap = lazy(() => import('./PinMap'));

type Mode = SearchPlace['kind'];

// About 100 m. Enough to rank cold rooms by distance, and the search log keeps no exact spot.
const coarse = (degrees: number) => Math.round(degrees * 1000) / 1000;

const failureKeys = {
  denied: 'search.location.deviceDenied',
  unavailable: 'search.location.deviceUnavailable',
  unsupported: 'search.location.deviceUnsupported',
} as const satisfies Record<DeviceLocationFailure, string>;

interface OptionButtonProps {
  icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
}

const OptionButton = ({ icon: Icon, selected, onClick, title, hint }: OptionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`flex items-center gap-4 w-full min-h-16 px-4 py-3 text-left transition-colors ${
      selected ? 'bg-primary-faint' : 'bg-surface hover:bg-surface-muted'
    }`}
  >
    <Icon
      size={22}
      className={`shrink-0 ${selected ? 'text-primary-strong' : 'text-copy-muted'}`}
      aria-hidden="true"
    />
    <span className="flex-grow">
      <span className="block font-semibold text-ink text-body">{title}</span>
      {hint && <span className="block text-copy-muted text-label">{hint}</span>}
    </span>
    {selected && <Check size={20} className="text-primary-strong shrink-0" aria-hidden="true" />}
  </button>
);

const Panel = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-3 px-4 pb-4 bg-primary-faint">{children}</div>
);

const Confirmed = ({ children }: { children: string }) => (
  <p className="flex items-center gap-2 text-primary-strong text-body font-semibold">
    <Check size={18} className="shrink-0" aria-hidden="true" />
    {children}
  </p>
);

const MapPlaceholder = () => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="h-64 rounded-xl bg-surface-muted flex items-center justify-center text-copy-subtle text-body"
    >
      {t('search.location.mapLoading')}
    </div>
  );
};

const Location = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { draft, update } = useSearchFlow();
  const notice = searchNoticeStateSchema.safeParse(useLocation().state).data?.notice;
  const initial = draft.place;

  const [mode, setMode] = useState<Mode | undefined>(initial?.kind);
  const device = useDeviceLocation(initial?.kind === 'device' ? initial : undefined);
  const [areaId, setAreaId] = useState<AreaId | undefined>(
    initial?.kind === 'area' ? initial.areaId : undefined,
  );
  const [areaQuery, setAreaQuery] = useState(
    initial?.kind === 'area' ? t(`search.areas.${initial.areaId}`) : '',
  );
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(
    initial?.kind === 'pin' ? initial : undefined,
  );

  const chosen = ((): SearchPlace | undefined => {
    if (mode === 'device' && device.state.status === 'located') {
      return { kind: 'device', lat: coarse(device.state.lat), lng: coarse(device.state.lng) };
    }
    if (mode === 'area' && areaId) {
      const area = areas.find(({ id }) => id === areaId)!;
      return { kind: 'area', areaId, lat: area.lat, lng: area.lng };
    }
    if (mode === 'pin' && pin) return { kind: 'pin', lat: coarse(pin.lat), lng: coarse(pin.lng) };
    return undefined;
  })();

  const handleUseDevice = () => {
    setMode('device');
    if (device.state.status !== 'located' && device.state.status !== 'locating') device.locate();
  };

  const handleContinue = () => {
    if (!chosen) return;
    update({ place: chosen });
    void navigate(SEARCH_STEPS.crop);
  };

  const query = areaQuery.trim().toLowerCase();
  const matchingAreas = areas.filter(({ id }) =>
    t(`search.areas.${id}`).toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('search.location.navTitle')} showBack={true} />
      <StepProgress step={1} count={3} label={t('search.step', { step: 1, count: 3 })} />
      <PageHeader title={t('search.location.title')} intro={t('search.location.intro')} />

      <div className="flex flex-col gap-5 px-5 pt-5 pb-32">
        {notice && <Notice tone="waiting">{t(`search.location.${notice}`)}</Notice>}

        <div className="border border-line rounded-xl overflow-hidden divide-y divide-line">
          <OptionButton
            icon={Crosshair}
            selected={mode === 'device'}
            onClick={handleUseDevice}
            title={t('search.location.useCurrent')}
            hint={t('search.location.useCurrentHint')}
          />
          {mode === 'device' && (
            <Panel>
              {device.state.status === 'locating' && (
                <p role="status" className="text-copy-muted text-body">
                  {t('search.location.locating')}
                </p>
              )}
              {device.state.status === 'located' && (
                <Confirmed>{t('search.place.device')}</Confirmed>
              )}
              {device.state.status === 'failed' && (
                <ErrorMessage>{t(failureKeys[device.state.reason])}</ErrorMessage>
              )}
            </Panel>
          )}

          <OptionButton
            icon={Search}
            selected={mode === 'area'}
            onClick={() => setMode('area')}
            title={t('search.location.pickArea')}
          />
          {mode === 'area' && (
            <Panel>
              <div className="relative">
                <label htmlFor="area-search" className="sr-only">
                  {t('search.location.searchLabel')}
                </label>
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-copy-subtle"
                  aria-hidden="true"
                />
                <input
                  id="area-search"
                  type="text"
                  autoComplete="off"
                  placeholder={t('search.location.searchPlaceholder')}
                  value={areaQuery}
                  onChange={(e) => {
                    setAreaQuery(e.target.value);
                    setAreaId(undefined);
                  }}
                  className={`${inputClasses()} pl-11`}
                />
              </div>

              {areaId ? (
                <Confirmed>{t(`search.areas.${areaId}`)}</Confirmed>
              ) : matchingAreas.length > 0 ? (
                <ul className="bg-surface border border-line rounded-xl overflow-hidden divide-y divide-line max-h-72 overflow-y-auto">
                  {matchingAreas.map(({ id }) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          setAreaId(id);
                          setAreaQuery(t(`search.areas.${id}`));
                        }}
                        className="flex items-center gap-3 w-full min-h-12 text-left px-4 py-3 hover:bg-primary-faint transition-colors"
                      >
                        <MapPin
                          size={16}
                          className="text-copy-subtle shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-ink text-body">{t(`search.areas.${id}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-copy-muted text-body">
                  {t('search.location.noAreaMatch', { query: areaQuery.trim() })}
                </p>
              )}
            </Panel>
          )}

          <OptionButton
            icon={MapPinned}
            selected={mode === 'pin'}
            onClick={() => setMode('pin')}
            title={t('search.location.dropPin')}
            hint={t('search.location.dropPinHint')}
          />
          {mode === 'pin' && (
            <Panel>
              <Suspense fallback={<MapPlaceholder />}>
                <PinMap
                  pin={pin}
                  onPick={(lat, lng) => setPin({ lat, lng })}
                  label={t('search.location.mapLabel')}
                />
              </Suspense>
              {pin && <Confirmed>{t('search.location.pinDropped')}</Confirmed>}
            </Panel>
          )}
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={handleContinue} disabled={!chosen}>
          {t('common.continue')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Location;
