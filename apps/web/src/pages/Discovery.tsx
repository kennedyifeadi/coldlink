import React from 'react';
import { MapPin, SlidersHorizontal, Star, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { coldRooms, type ColdRoom } from '../data/mockData';
import TopNavBar from '../components/TopNavBar';
import BottomNav from '../components/BottomNav';

const Discovery = () => {
  const navigate = useNavigate();

  const renderAvailabilityBar = (room: ColdRoom) => {
    const percentage = (room.availableCapacity / room.totalCapacity) * 100;
    const isLow = percentage <= 10;

    return (
      <div className="w-full h-1.5 bg-[#d8eed3] rounded-full mt-2 overflow-hidden flex">
        <div
          className={`h-full rounded-full transition-all ${isLow ? 'bg-[#c9302c]' : 'bg-[#7ba962]'}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-[#fafafa] relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title="Cold Rooms" showProfile={true} />

      <div className="flex flex-col px-4 pt-6 flex-grow overflow-y-auto">
        {/* Page Title */}
        <h1 className="text-[1.65rem] font-bold text-[#1a3622] mb-4 tracking-tight">
          Cold storage near you
        </h1>

        {/* Filter Pills */}
        <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          <button className="flex items-center gap-1.5 bg-[#d8eed3] text-[#1a3622] px-3.5 py-1.5 rounded-full font-medium text-sm whitespace-nowrap shrink-0">
            <Leaf size={14} /> Tomatoes
          </button>
          <button className="flex items-center gap-1.5 bg-[#d8eed3] text-[#1a3622] px-3.5 py-1.5 rounded-full font-medium text-sm whitespace-nowrap shrink-0">
            <MapPin size={14} /> Ibadan
          </button>
          <button className="flex items-center gap-1.5 bg-[#d8eed3] text-[#1a3622] px-3.5 py-1.5 rounded-full font-medium text-sm whitespace-nowrap shrink-0">
            <SlidersHorizontal size={14} /> Filters
          </button>
        </div>

        {/* Cold Rooms List */}
        <div className="flex flex-col gap-6">
          {coldRooms.map((room) => {
            const isLow = room.availableCapacity / room.totalCapacity <= 0.1;

            return (
              <div
                key={room.id}
                className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                {/* Image */}
                <div className="w-full h-36 bg-gray-200 overflow-hidden relative">
                  <img src={room.image} alt={room.name} className="w-full h-full object-cover" />
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-xl font-bold text-[#1a3622] leading-tight">{room.name}</h2>
                    <div className="flex items-center gap-1 bg-[#d8eed3] text-[#1a3622] px-2 py-0.5 rounded text-sm font-medium shrink-0">
                      <Star size={12} className="fill-current" /> {room.rating}
                    </div>
                  </div>

                  <div className="flex justify-between items-end mb-4">
                    <div className="flex items-center text-gray-600 text-[0.95rem]">
                      <MapPin size={14} className="mr-1 opacity-70" /> {room.distance} km away
                    </div>
                    <div className="text-gray-800">
                      <span className="font-bold text-lg">
                        ₦{room.pricePerDay.toLocaleString()}
                      </span>{' '}
                      <span className="text-gray-500 text-sm">/ day</span>
                    </div>
                  </div>

                  {/* Availability */}
                  <div className="mb-6">
                    <div className="flex justify-between items-end text-sm mb-1">
                      <span className="text-gray-600">Availability</span>
                      <span
                        className={`font-medium ${isLow ? 'text-[#c9302c]' : 'text-[#1a3622]'}`}
                      >
                        {isLow
                          ? `Only ${room.availableCapacity} spaces left`
                          : `${room.availableCapacity} of ${room.totalCapacity} spaces`}
                      </span>
                    </div>
                    {renderAvailabilityBar(room)}
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => void navigate('/details')}
                    className="w-full bg-[#82b467] hover:bg-[#7ba962] text-white font-medium py-3.5 rounded-lg transition-colors"
                  >
                    View storage
                  </button>
                </div>
              </div>
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
