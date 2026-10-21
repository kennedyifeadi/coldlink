import React, { useState } from 'react';
import { MapPin, Star, Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { sampleColdRoom as room } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import QuantityStepper from '../../components/ui/QuantityStepper';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formatNaira, formatNumber } from '../../i18n/format';

const Details = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [units, setUnits] = useState(2);
  const maxUnits = 10;
  const pricePerUnit = 1500;
  const availablePercentage = (room.availableCapacity / room.totalCapacity) * 100;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title={t('booking.details.navTitle')} showBack={true} />

      <div className="flex flex-col px-4 pt-4 flex-grow overflow-y-auto">
        {/* Hero Card */}
        <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-6 shadow-sm bg-primary-soft">
          <div className="absolute inset-0 flex items-center justify-center pb-16 text-primary-strong">
            <Warehouse size={56} strokeWidth={1.5} />
          </div>

          {/* Hero Content */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <div>
              <h1 className="font-heading text-headline font-bold mb-1 leading-tight text-ink">
                {t(`mock.coldRooms.${room.id}.name`)}
              </h1>
              <div className="flex items-center text-copy-muted text-label">
                <MapPin size={14} className="mr-1" /> {t(`mock.coldRooms.${room.id}.location`)}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface text-ink px-2.5 py-1 rounded-md text-label font-bold shadow-md shrink-0">
              <Star size={14} className="fill-accent text-accent" /> {formatNumber(room.rating)}
            </div>
          </div>
        </div>

        <Card className="p-5 mb-8">
          <CardTitle
            aside={t('booking.details.unitsAvailable', {
              available: room.availableCapacity,
              count: room.totalCapacity,
            })}
          >
            {t('booking.details.capacityTitle')}
          </CardTitle>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-line-strong rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${availablePercentage}%` }}
            ></div>
          </div>
        </Card>

        {/* How much storage Section */}
        <div className="mb-6">
          <h2 className="font-heading text-title font-bold text-ink mb-1">
            {t('booking.details.quantityTitle')}
          </h2>
          <div className="flex justify-between items-center mb-4">
            <span className="text-copy-muted text-lead">
              {t('booking.details.pricePerUnit', { price: formatNaira(pricePerUnit) })}
            </span>
            <span className="text-copy text-label font-medium">
              {t('booking.details.maxUnits', { count: maxUnits })}
            </span>
          </div>
          <QuantityStepper
            value={units}
            onChange={setUnits}
            max={maxUnits}
            label={t('booking.details.unitsLabel')}
            decreaseLabel={t('booking.details.removeUnit')}
            increaseLabel={t('booking.details.addUnit')}
          />
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={() => void navigate('/duration')} withArrow>
          {t('common.continue')}
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Details;
