import type { TFunction } from 'i18next';
import type { SearchPlace } from './searchFlow';

export const placeLabel = (place: SearchPlace, t: TFunction) => {
  switch (place.kind) {
    case 'device':
      return t('search.place.device');
    case 'area':
      return t(`search.areas.${place.areaId}`);
    case 'pin':
      return t('search.place.pin');
  }
};
