import React from 'react';
import { Snowflake, User, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type BottomNavTab = 'find' | 'bookings' | 'profile';

interface BottomNavProps {
  activeTab?: BottomNavTab;
}

const BottomNav = ({ activeTab = 'find' }: BottomNavProps) => {
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 flex justify-between px-8 py-3 pb-safe z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      <button
        onClick={() => void navigate('/discovery')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'find' ? 'text-[#68a042]' : 'text-gray-500 hover:text-gray-800'}`}
      >
        <Snowflake size={24} />
        <span className="text-[11px] font-medium">Find Cold</span>
      </button>

      <button
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'bookings' ? 'text-[#68a042]' : 'text-gray-500 hover:text-gray-800'}`}
      >
        <ShoppingBag size={24} />
        <span className="text-[11px] font-medium">Bookings</span>
      </button>

      <button
        onClick={() => void navigate('/userid')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-[#68a042]' : 'text-gray-500 hover:text-gray-800'}`}
      >
        <User size={24} />
        <span className="text-[11px] font-medium">Profile</span>
      </button>
    </div>
  );
};

export default BottomNav;
