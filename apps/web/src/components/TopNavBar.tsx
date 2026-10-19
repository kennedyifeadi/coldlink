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
    <div className="flex justify-between items-center px-4 py-4 border-b border-line bg-surface sticky top-0 z-10">
      {/* Left side (Back Button or Logo + Title) */}
      <div className="flex items-center gap-2">
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-copy-muted hover:bg-surface-muted rounded-full transition-colors shrink-0"
          >
            <ArrowLeft size={24} />
          </button>
        )}

        {/* Logo and Title Group */}
        <div className={`flex items-center gap-2 ${showBack ? 'ml-0' : ''}`}>
          {/* Small Logo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="bg-primary p-1 rounded text-ink flex items-center justify-center">
              <Snowflake size={14} />
            </div>
            <div className="flex flex-col">
              <div className="flex font-heading font-extrabold text-label tracking-tight leading-none">
                <span className="text-ink">Cold</span>
                <span className="text-accent">Link</span>
              </div>
              <span className="text-ink text-[0.4rem] font-bold tracking-[0.2em] mt-0.5">
                STORAGE, NEARBY
              </span>
            </div>
          </div>

          {/* Separator / Title */}
          <span className="text-line-strong mx-1 shrink-0">|</span>
          <span className="text-copy font-medium text-subtitle truncate max-w-[120px]">
            {title}
          </span>
        </div>
      </div>

      {/* Right side (Profile Avatar) */}
      {showProfile && (
        <div className="w-8 h-8 shrink-0 rounded-full bg-primary flex items-center justify-center text-ink">
          <User size={18} />
        </div>
      )}
    </div>
  );
};

export default TopNavBar;
