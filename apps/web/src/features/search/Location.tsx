import React, { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Crosshair,
  Info,
  MapPin,
  MapPinned,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import StepProgress from '../../components/ui/StepProgress';
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
  children: ReactNode;
}

const OptionButton = ({ icon: Icon, selected, onClick, children }: OptionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`flex items-center w-full min-h-14 p-4 rounded-xl transition-all text-left ${
      selected
        ? 'bg-primary-faint border border-primary shadow-sm'
        : 'bg-surface-muted border border-transparent hover:bg-surface-sunken'
    }`}
  >
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mr-4 ${
        selected ? 'bg-primary-soft' : 'bg-surface-sunken'
      }`}
    >
      <Icon size={20} className="text-primary-strong" />
    </div>
    <div className="flex-grow">{children}</div>
    {selected && <CheckCircle2 size={20} className="text-primary-strong shrink-0 ml-2" />}
  </button>
);

const Confirmed = ({ children }: { children: string }) => (
  <div className="flex items-center gap-2 bg-primary-faint border border-primary-muted rounded-xl px-4 py-3">
    <CheckCircle2 size={16} className="text-primary-strong shrink-0" />
    <span className="text-ink text-body font-medium">{children}</span>
  </div>
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
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      <TopNavBar title={t('search.location.navTitle')} showBack={true} />
      <StepProgress step={1} count={3} label={t('search.step', { step: 1, count: 3 })} />

      <div className="flex flex-col px-6 pt-8 pb-28 flex-grow overflow-y-auto">
        {notice && (
          <div
            role="status"
            className="flex gap-3 bg-accent-faint text-accent-ink rounded-xl p-4 mb-6"
          >
            <Info size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-body leading-relaxed">{t(`search.location.${notice}`)}</p>
          </div>
        )}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-surface-muted rounded-full flex items-center justify-center">
            <MapPin size={32} className="text-primary-strong" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="font-heading text-headline font-bold text-ink mb-3">
            {t('search.location.title')}
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed max-w-sm mx-auto">
            {t('search.location.intro')}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <OptionButton icon={Crosshair} selected={mode === 'device'} onClick={handleUseDevice}>
            <div className="font-semibold text-copy text-lead">
              {t('search.location.useCurrent')}
            </div>
            <div className="text-copy-muted text-label mt-0.5">
              {t('search.location.useCurrentHint')}
            </div>
          </OptionButton>

          {mode === 'device' && device.state.status === 'locating' && (
            <p role="status" className="text-copy-muted text-body px-1">
              {t('search.location.locating')}
            </p>
          )}
          {mode === 'device' && device.state.status === 'located' && (
            <Confirmed>{t('search.place.device')}</Confirmed>
          )}
          {mode === 'device' && device.state.status === 'failed' && (
            <ErrorMessage>{t(failureKeys[device.state.reason])}</ErrorMessage>
          )}

          <div className="flex items-center justify-center gap-4 my-2">
            <div className="h-[1px] bg-line-strong flex-grow"></div>
            <span className="text-copy-subtle text-label font-medium">
              {t('search.location.or')}
            </span>
            <div className="h-[1px] bg-line-strong flex-grow"></div>
          </div>

          <OptionButton icon={Search} selected={mode === 'area'} onClick={() => setMode('area')}>
            <div className="font-semibold text-copy text-lead">{t('search.location.pickArea')}</div>
          </OptionButton>

          {mode === 'area' && (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <label htmlFor="area-search" className="sr-only">
                  {t('search.location.searchLabel')}
                </label>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-copy-subtle">
                  <Search size={18} />
                </div>
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
                  className="w-full pl-12 pr-4 py-3.5 bg-surface border border-line-strong rounded-xl text-body placeholder-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all"
                />
              </div>

              {areaId ? (
                <Confirmed>{t(`search.areas.${areaId}`)}</Confirmed>
              ) : matchingAreas.length > 0 ? (
                <ul className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
                  {matchingAreas.map(({ id }) => (
                    <li key={id} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAreaId(id);
                          setAreaQuery(t(`search.areas.${id}`));
                        }}
                        className="flex items-center gap-3 w-full text-left px-4 py-3.5 hover:bg-primary-faint transition-colors"
                      >
                        <MapPin size={16} className="text-copy-subtle shrink-0" />
                        <span className="text-copy text-body">{t(`search.areas.${id}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-copy-muted text-body px-1">
                  {t('search.location.noAreaMatch', { query: areaQuery.trim() })}
                </p>
              )}
            </div>
          )}

          <OptionButton icon={MapPinned} selected={mode === 'pin'} onClick={() => setMode('pin')}>
            <div className="font-semibold text-copy text-lead">{t('search.location.dropPin')}</div>
            <div className="text-copy-muted text-label mt-0.5">
              {t('search.location.dropPinHint')}
            </div>
          </OptionButton>

          {mode === 'pin' && (
            <div className="flex flex-col gap-3">
              <Suspense fallback={<MapPlaceholder />}>
                <PinMap
                  pin={pin}
                  onPick={(lat, lng) => setPin({ lat, lng })}
                  label={t('search.location.mapLabel')}
                />
              </Suspense>
              {pin && <Confirmed>{t('search.location.pinDropped')}</Confirmed>}
            </div>
          )}
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={handleContinue} disabled={!chosen} withArrow>
          {t('common.continue')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Location;
