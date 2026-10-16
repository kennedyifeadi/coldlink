import React, { useState, type FormEvent } from 'react';
import { ArrowRight, Snowflake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Onboarding = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const navigate = useNavigate();

  const handleContinue = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phoneNumber.length > 5) {
      void navigate('/userid');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-white p-6 relative">
      {/* Header / Logo Area */}
      <div className="flex items-center gap-2 mt-8 mb-16">
        <div className="bg-[#68a042] p-1.5 rounded-lg text-white">
          <Snowflake size={24} />
        </div>
        <div className="flex flex-col">
          <div className="flex font-extrabold text-2xl tracking-tight leading-none">
            <span className="text-[#1a3622]">Cold</span>
            <span className="text-[#ff9800]">Link</span>
          </div>
          <span className="text-[#1a3622] text-[0.6rem] font-bold tracking-[0.2em] mt-0.5">
            STORAGE, NEARBY
          </span>
        </div>
      </div>

      {/* Hero Text */}
      <div className="mb-auto">
        <h1 className="text-3xl font-bold text-[#1a3622] tracking-tight leading-tight mb-4">
          Find cold storage near you.
        </h1>
        <p className="text-gray-700 text-[1.05rem] leading-relaxed">
          Keep your harvest fresh by finding available cold storage nearby.
        </p>
      </div>

      {/* Form and Action Area */}
      <form onSubmit={handleContinue} className="w-full mt-12 pb-8">
        {/* Phone Number Input */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-800 mb-2">Phone number</label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:border-[#80b368] focus-within:ring-1 focus-within:ring-[#80b368] transition-all">
            {/* Country Code & Flag */}
            <div className="flex items-center gap-2 px-4 py-3.5 bg-gray-50 border-r border-gray-300 shrink-0">
              {/* CSS Nigerian Flag (No emojis!) */}
              <div className="flex w-5 h-3.5 rounded-sm overflow-hidden shrink-0 border border-gray-200 shadow-sm">
                <div className="w-1/3 h-full bg-[#008751]"></div>
                <div className="w-1/3 h-full bg-white"></div>
                <div className="w-1/3 h-full bg-[#008751]"></div>
              </div>
              <span className="text-gray-800 font-medium">+234</span>
            </div>

            {/* Input Field */}
            <input
              type="tel"
              placeholder="800 000 0000"
              className="w-full px-4 py-3.5 text-lg text-gray-800 bg-white placeholder-gray-400 focus:outline-none"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
        </div>

        {/* Continue Button */}
        <button
          type="submit"
          disabled={phoneNumber.length < 5}
          className={`group flex items-center justify-center w-full py-4 rounded-lg text-white font-medium text-lg transition-all
            ${phoneNumber.length < 5 ? 'bg-[#a3c993] cursor-not-allowed' : 'bg-[#7ba962] hover:bg-[#689451] shadow-md'}
          `}
        >
          <span>Continue</span>
          <ArrowRight
            size={20}
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
          />
        </button>

        {/* Footer Text */}
        <p className="text-center text-gray-600 text-sm mt-8 px-4 leading-relaxed">
          Your phone number creates your ColdLink User ID. No password required.
        </p>
      </form>
    </div>
  );
};

export default Onboarding;
