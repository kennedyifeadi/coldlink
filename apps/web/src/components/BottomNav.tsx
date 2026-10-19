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
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-surface border-t border-line flex justify-between px-8 py-3 pb-safe z-20 shadow-bar">
      <button
        onClick={() => void navigate('/discovery')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'find' ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
      >
        <Snowflake size={24} />
        <span className="text-caption font-medium">Find Cold</span>
      </button>

      <button
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'bookings' ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
      >
        <ShoppingBag size={24} />
        <span className="text-caption font-medium">Bookings</span>
      </button>

      <button
        onClick={() => void navigate('/userid')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
      >
        <User size={24} />
        <span className="text-caption font-medium">Profile</span>
      </button>
    </div>
  );
};

export default BottomNav;
