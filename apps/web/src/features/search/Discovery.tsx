import React from 'react';
import { MapPin, SlidersHorizontal, Star, Leaf, Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { coldRooms, type ColdRoom } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatNaira, formatNumber } from '../../i18n/format';

const Discovery = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const renderAvailabilityBar = (room: ColdRoom) => {
    const percentage = (room.availableCapacity / room.totalCapacity) * 100;
    const isLow = percentage <= 10;

    return (
      <div className="w-full h-1.5 bg-primary-soft rounded-full mt-2 overflow-hidden flex">
        <div
          className={`h-full rounded-full transition-all ${isLow ? 'bg-alert' : 'bg-primary'}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title={t('search.discovery.navTitle')} showProfile={true} />

      <div className="flex flex-col px-4 pt-6 flex-grow overflow-y-auto">
        {/* Page Title */}
        <h1 className="font-heading text-headline-lg font-bold text-ink mb-4 tracking-tight">
          {t('search.discovery.title')}
        </h1>

        {/* Filter Pills */}
        <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          <button className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 py-1.5 rounded-full font-medium text-label whitespace-nowrap shrink-0">
            <Leaf size={14} /> {t('mock.produce.tomato')}
          </button>
          <button className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 py-1.5 rounded-full font-medium text-label whitespace-nowrap shrink-0">
            <MapPin size={14} /> {t('mock.places.ibadan')}
          </button>
          <button className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 py-1.5 rounded-full font-medium text-label whitespace-nowrap shrink-0">
            <SlidersHorizontal size={14} /> {t('search.discovery.filters')}
          </button>
        </div>

        {/* Cold Rooms List */}
        <div className="flex flex-col gap-6">
          {coldRooms.map((room) => {
            const isLow = room.availableCapacity / room.totalCapacity <= 0.1;

            return (
              <Card key={room.id} className="overflow-hidden">
                <div className="w-full h-36 bg-primary-soft flex items-center justify-center text-primary-strong">
                  <Warehouse size={40} strokeWidth={1.75} />
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="font-heading text-title font-bold text-ink leading-tight">
                      {t(`mock.coldRooms.${room.id}.name`)}
                    </h2>
                    <div className="flex items-center gap-1 bg-primary-soft text-ink px-2 py-0.5 rounded text-label font-medium shrink-0">
                      <Star size={12} className="fill-current" /> {formatNumber(room.rating)}
                    </div>
                  </div>

                  <div className="flex justify-between items-end mb-4">
                    <div className="flex items-center text-copy-muted text-body">
                      <MapPin size={14} className="mr-1 opacity-70" />{' '}
                      {t('search.discovery.distance', { distance: formatNumber(room.distance) })}
                    </div>
                    <div className="text-copy">
                      <span className="font-bold text-subtitle">
                        {formatNaira(room.pricePerDay)}
                      </span>{' '}
                      <span className="text-copy-subtle text-label">
                        {t('search.discovery.perDay')}
                      </span>
                    </div>
                  </div>

                  {/* Availability */}
                  <div className="mb-6">
                    <div className="flex justify-between items-end text-label mb-1">
                      <span className="text-copy-muted">{t('search.discovery.availability')}</span>
                      <span className={`font-medium ${isLow ? 'text-alert-strong' : 'text-ink'}`}>
                        {isLow
                          ? t('search.discovery.spacesLeft', { count: room.availableCapacity })
                          : t('search.discovery.spacesOfTotal', {
                              available: room.availableCapacity,
                              count: room.totalCapacity,
                            })}
                      </span>
                    </div>
                    {renderAvailabilityBar(room)}
                  </div>

                  {/* Action */}
                  <PrimaryButton onClick={() => void navigate('/details')} compact>
                    {t('search.discovery.viewStorage')}
                  </PrimaryButton>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="find" />
    </div>
  );
};

export default Discovery;
