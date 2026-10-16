import React, { useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import BottomNav from '../components/BottomNav';

const UserId = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Hardcoded for now since no DB is used, but we could generate it randomly
  const userId = 'CL-482731';

  const handleCopy = () => {
    void navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFindStorage = () => {
    void navigate('/location');
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-white relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title="User Id" showProfile={true} />

      <div className="flex flex-col px-6 pt-12 items-center text-center flex-grow">
        {/* Success Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 bg-[#82b467] rounded-full flex items-center justify-center text-white shadow-sm z-10 relative">
            <CheckCircle2 size={32} strokeWidth={2.5} />
          </div>
          {/* Orange Sparks */}
          <div className="absolute top-0 right-[-10px] w-4 h-0.5 bg-[#f59e0b] rotate-45 rounded-full"></div>
          <div className="absolute top-4 right-[-16px] w-4 h-0.5 bg-[#f59e0b] -rotate-[15deg] rounded-full"></div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-[#1a3622] mb-8">You're all set!</h1>

        {/* ID Card */}
        <div className="w-full bg-gradient-to-br from-[#e1f5d5] to-[#d4eed4] rounded-2xl p-6 mb-8 shadow-sm border border-[#d0eac5]">
          <p className="text-gray-700 text-xs font-medium tracking-widest uppercase mb-4">
            Your ColdLink ID
          </p>
          <div className="bg-[#c2e2af] text-[#1a3622] font-bold text-3xl tracking-widest py-3 px-6 rounded-lg mb-6 inline-block">
            {userId}
          </div>
          <div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 bg-[#f4dca8] hover:bg-[#ebd095] text-[#8c6b22] px-5 py-2 rounded-full font-medium text-sm transition-colors"
            >
              <Copy size={16} />
              {copied ? 'Copied!' : 'Copy ID'}
            </button>
          </div>
        </div>

        {/* Info Text */}
        <p className="text-gray-600 text-base leading-relaxed px-4">
          This ID works across ColdLink Web, WhatsApp and USSD.
        </p>
      </div>

      {/* Action Button */}
      <div className="px-6 mb-6">
        <button
          onClick={handleFindStorage}
          className="w-full bg-[#7ba962] hover:bg-[#689451] text-white py-4 rounded-lg font-medium text-lg transition-colors shadow-md"
        >
          Find storage
        </button>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="profile" />
    </div>
  );
};

export default UserId;
