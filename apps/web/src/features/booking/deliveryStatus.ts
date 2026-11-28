import { CircleSlash, Hourglass, PackageCheck, Truck, Wallet, type LucideIcon } from 'lucide-react';
import { isLiveDelivery, type BookingDelivery } from '@coldlink/shared';
import type { StatusTone } from './bookingStatus';

/** A delivery's status as the farmer reads it. */
export type DeliveryStatusLabel =
  'unpaid' | 'waiting' | 'onTheWay' | 'pickedUp' | 'delivered' | 'cancelled' | 'failed';

/** `assigned` is not the farmer's news yet: a driver has the job only once they accept it. */
export const deliveryStatusLabel = ({
  status,
  paid,
}: Pick<BookingDelivery, 'status' | 'paid'>): DeliveryStatusLabel => {
  switch (status) {
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    case 'requested':
      return paid ? 'waiting' : 'unpaid';
    case 'assigned':
      return 'waiting';
    case 'accepted':
      return 'onTheWay';
    case 'picked_up':
      return 'pickedUp';
    case 'delivered':
      return 'delivered';
  }
};

export const DELIVERY_STATUS_LOOKS: Record<
  DeliveryStatusLabel,
  { tone: StatusTone; icon: LucideIcon }
> = {
  unpaid: { tone: 'waiting', icon: Wallet },
  waiting: { tone: 'waiting', icon: Hourglass },
  onTheWay: { tone: 'active', icon: Truck },
  pickedUp: { tone: 'active', icon: Truck },
  delivered: { tone: 'done', icon: PackageCheck },
  cancelled: { tone: 'ended', icon: CircleSlash },
  failed: { tone: 'ended', icon: CircleSlash },
};

/**
 * The handover code is shown while the delivery is live and the load is still to be handed over
 * (decision 152); before payment it is no one's business, and after delivery it is spent.
 */
export const showsHandoverCode = (delivery: Pick<BookingDelivery, 'status' | 'paid'>) =>
  isLiveDelivery(delivery) && delivery.status !== 'delivered';
