import React from 'react';
import { ArrowLeft, Snowflake, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TopNavBarProps {
  title: string;
  showBack?: boolean;
  showProfile?: boolean;
}

const TopNavBar = ({ title, showBack = false, showProfile = false }: TopNavBarProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    void navigate(-1);
  };

  return (
    <div className="flex justify-between items-center px-4 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
      {/* Left side (Back Button or Logo + Title) */}
      <div className="flex items-center gap-2">
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-gray-700 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          >
            <ArrowLeft size={24} />
          </button>
        )}

        {/* Logo and Title Group */}
        <div className={`flex items-center gap-2 ${showBack ? 'ml-0' : ''}`}>
          {/* Small Logo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="bg-[#68a042] p-1 rounded text-white flex items-center justify-center">
              <Snowflake size={14} />
            </div>
            <div className="flex flex-col">
              <div className="flex font-extrabold text-sm tracking-tight leading-none">
                <span className="text-[#1a3622]">Cold</span>
                <span className="text-[#ff9800]">Link</span>
              </div>
              <span className="text-[#1a3622] text-[0.4rem] font-bold tracking-[0.2em] mt-0.5">
                STORAGE, NEARBY
              </span>
            </div>
          </div>

          {/* Separator / Title */}
          <span className="text-gray-300 mx-1 shrink-0">|</span>
          <span className="text-gray-900 font-medium text-lg truncate max-w-[120px]">{title}</span>
        </div>
      </div>

      {/* Right side (Profile Avatar) */}
      {showProfile && (
        <div className="w-8 h-8 shrink-0 rounded-full bg-[#82b467] flex items-center justify-center text-white">
          <User size={18} />
        </div>
      )}
    </div>
  );
};

export default TopNavBar;
