import React, { useState } from 'react';
import { MapPin, Search, Crosshair, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';

const Location = () => {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState(null); // 'current' or 'manual'
  const [manualSearch, setManualSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmedLocation, setConfirmedLocation] = useState('');

  const handleSelectCurrent = () => {
    setSelectedOption('current');
    setConfirmedLocation('Supreme School, Magodo, Lagos');
    setShowSuggestions(false);
    setManualSearch('');
  };

  const handleSelectManual = () => {
    setSelectedOption('manual');
    setConfirmedLocation('');
    setShowSuggestions(true);
  };

  const handlePickSuggestion = (address) => {
    setConfirmedLocation(address);
    setManualSearch(address);
    setShowSuggestions(false);
  };

  const handleContinue = () => {
    if (confirmedLocation) {
      navigate('/produce');
    }
  };

  // Mock suggestions — only shown when manual is selected
  const suggestions = [
    'Supreme School, Magodo, Lagos',
    'Magodo Phase 2, Lagos',
    'Magodo Brooks Estate, Lagos',
  ];

  return (
    <div className="flex flex-col h-full min-h-screen bg-white relative">
      
      {/* Top App Bar */}
      <TopNavBar title="Location" showBack={true} />

      <div className="flex flex-col px-6 pt-10 pb-24 flex-grow overflow-y-auto">
        
        {/* Hero Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
            <MapPin size={32} className="text-[#68a042]" />
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-[#1a3622] mb-3">
            Where are you storing from?
          </h1>
          <p className="text-gray-600 text-[1.05rem] leading-relaxed max-w-sm mx-auto">
            We'll use your location to find the closest available cold rooms and calculate delivery.
          </p>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-6">
          
          {/* Current Location Option */}
          <button 
            onClick={handleSelectCurrent}
            className={`flex items-center p-4 rounded-xl transition-all text-left ${
              selectedOption === 'current' 
                ? 'bg-[#f4f9f1] border border-[#80b368] shadow-sm' 
                : 'bg-gray-100 border border-transparent hover:bg-gray-200'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mr-4 ${
              selectedOption === 'current' ? 'bg-[#e5f0df]' : 'bg-[#e9eee7]'
            }`}>
              <Crosshair size={20} className="text-[#68a042]" />
            </div>
            <div className="flex-grow">
              <div className="font-semibold text-gray-900 text-[1.05rem]">Use my current location</div>
              <div className="text-gray-600 text-sm mt-0.5">Recommended for accuracy</div>
            </div>
            {selectedOption === 'current' && (
              <CheckCircle2 size={20} className="text-[#68a042] shrink-0 ml-2" />
            )}
          </button>

          {/* Show resolved address when current location is selected */}
          {selectedOption === 'current' && confirmedLocation && (
            <div className="flex items-center gap-2 bg-[#f4f9f1] border border-[#d0eac5] rounded-xl px-4 py-3 -mt-2 ml-2">
              <MapPin size={16} className="text-[#68a042] shrink-0" />
              <span className="text-[#1a3622] text-sm font-medium">{confirmedLocation}</span>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center justify-center gap-4">
            <div className="h-[1px] bg-gray-200 flex-grow"></div>
            <span className="text-gray-500 text-sm font-medium">OR</span>
            <div className="h-[1px] bg-gray-200 flex-grow"></div>
          </div>

          {/* Manual Location Option */}
          <button 
            onClick={handleSelectManual}
            className={`flex items-center justify-center p-4 rounded-xl transition-all ${
              selectedOption === 'manual' 
                ? 'bg-[#f4f9f1] border border-[#80b368] shadow-sm text-[#1a3622]' 
                : 'bg-[#fafafa] border border-gray-100 hover:bg-gray-100 text-gray-800'
            }`}
          >
            <Search size={20} className="mr-3" />
            <span className="font-medium text-[1.05rem]">Enter location manually</span>
          </button>

          {/* Manual search input + suggestions */}
          {selectedOption === 'manual' && (
            <div className="flex flex-col gap-3 -mt-2">
              {/* Search Input */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search size={18} />
                </div>
                <input 
                  type="text"
                  placeholder="Search for a location..."
                  value={manualSearch}
                  onChange={(e) => {
                    setManualSearch(e.target.value);
                    setShowSuggestions(true);
                    setConfirmedLocation('');
                  }}
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[0.95rem] outline-none focus:border-[#82b467] focus:ring-1 focus:ring-[#82b467] transition-all"
                  autoFocus
                />
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && !confirmedLocation && (
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handlePickSuggestion(suggestion)}
                      className="flex items-center gap-3 w-full text-left px-4 py-3.5 hover:bg-[#f4f9f1] transition-colors border-b border-gray-50 last:border-b-0"
                    >
                      <MapPin size={16} className="text-gray-400 shrink-0" />
                      <span className="text-gray-800 text-sm">{suggestion}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Confirmed location badge */}
              {confirmedLocation && (
                <div className="flex items-center gap-2 bg-[#f4f9f1] border border-[#d0eac5] rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} className="text-[#68a042] shrink-0" />
                  <span className="text-[#1a3622] text-sm font-medium">{confirmedLocation}</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Bottom Action Area (Sticky) */}
      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-white via-white to-transparent">
        <button
          onClick={handleContinue}
          disabled={!confirmedLocation}
          className={`group flex items-center justify-center w-full py-4 rounded-lg text-white font-medium text-lg transition-all
            ${!confirmedLocation ? 'bg-[#a3c993] cursor-not-allowed opacity-80' : 'bg-[#7ba962] hover:bg-[#689451] shadow-md'}
          `}
        >
          <span>Continue</span>
          <ArrowRight 
            size={20} 
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5" 
          />
        </button>
      </div>

    </div>
  );
};

export default Location;
