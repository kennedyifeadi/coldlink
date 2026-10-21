import React, { useState } from 'react';
import { MapPin, Search, Crosshair, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../../components/TopNavBar';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';

type LocationOption = 'current' | 'manual';

const Location = () => {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<LocationOption | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmedLocation, setConfirmedLocation] = useState('');

  const handleSelectCurrent = () => {
    setSelectedOption('current');
    setConfirmedLocation('Bodija, Ibadan');
    setShowSuggestions(false);
    setManualSearch('');
  };

  const handleSelectManual = () => {
    setSelectedOption('manual');
    setConfirmedLocation('');
    setShowSuggestions(true);
  };

  const handlePickSuggestion = (address: string) => {
    setConfirmedLocation(address);
    setManualSearch(address);
    setShowSuggestions(false);
  };

  const handleContinue = () => {
    if (confirmedLocation) {
      void navigate('/produce');
    }
  };

  // Mock suggestions — only shown when manual is selected
  const suggestions = ['Bodija, Ibadan', 'Apata, Ibadan', 'Iwo Road, Ibadan'];

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      {/* Top App Bar */}
      <TopNavBar title="Location" showBack={true} />

      <div className="flex flex-col px-6 pt-10 pb-28 flex-grow overflow-y-auto">
        {/* Hero Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-surface-muted rounded-full flex items-center justify-center">
            <MapPin size={32} className="text-primary-strong" />
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center mb-10">
          <h1 className="font-heading text-headline font-bold text-ink mb-3">
            Where are you storing from?
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed max-w-sm mx-auto">
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
                ? 'bg-primary-faint border border-primary shadow-sm'
                : 'bg-surface-muted border border-transparent hover:bg-surface-sunken'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mr-4 ${
                selectedOption === 'current' ? 'bg-primary-soft' : 'bg-surface-sunken'
              }`}
            >
              <Crosshair size={20} className="text-primary-strong" />
            </div>
            <div className="flex-grow">
              <div className="font-semibold text-copy text-lead">Use my current location</div>
              <div className="text-copy-muted text-label mt-0.5">Recommended for accuracy</div>
            </div>
            {selectedOption === 'current' && (
              <CheckCircle2 size={20} className="text-primary-strong shrink-0 ml-2" />
            )}
          </button>

          {/* Show resolved address when current location is selected */}
          {selectedOption === 'current' && confirmedLocation && (
            <div className="flex items-center gap-2 bg-primary-faint border border-primary-muted rounded-xl px-4 py-3 -mt-2 ml-2">
              <MapPin size={16} className="text-primary-strong shrink-0" />
              <span className="text-ink text-body font-medium">{confirmedLocation}</span>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center justify-center gap-4">
            <div className="h-[1px] bg-line-strong flex-grow"></div>
            <span className="text-copy-subtle text-label font-medium">OR</span>
            <div className="h-[1px] bg-line-strong flex-grow"></div>
          </div>

          {/* Manual Location Option */}
          <button
            onClick={handleSelectManual}
            className={`flex items-center justify-center p-4 rounded-xl transition-all ${
              selectedOption === 'manual'
                ? 'bg-primary-faint border border-primary shadow-sm text-ink'
                : 'bg-surface-muted border border-line hover:bg-surface-sunken text-copy'
            }`}
          >
            <Search size={20} className="mr-3" />
            <span className="font-medium text-lead">Enter location manually</span>
          </button>

          {/* Manual search input + suggestions */}
          {selectedOption === 'manual' && (
            <div className="flex flex-col gap-3 -mt-2">
              {/* Search Input */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-copy-subtle">
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
                  className="w-full pl-12 pr-4 py-3.5 bg-surface border border-line-strong rounded-xl text-body placeholder-copy-subtle outline-none focus:border-primary-strong focus:ring-1 focus:ring-primary-strong transition-all"
                  autoFocus
                />
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && !confirmedLocation && (
                <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-sm">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handlePickSuggestion(suggestion)}
                      className="flex items-center gap-3 w-full text-left px-4 py-3.5 hover:bg-primary-faint transition-colors border-b border-line last:border-b-0"
                    >
                      <MapPin size={16} className="text-copy-subtle shrink-0" />
                      <span className="text-copy text-body">{suggestion}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Confirmed location badge */}
              {confirmedLocation && (
                <div className="flex items-center gap-2 bg-primary-faint border border-primary-muted rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} className="text-primary-strong shrink-0" />
                  <span className="text-ink text-body font-medium">{confirmedLocation}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={handleContinue} disabled={!confirmedLocation} withArrow>
          Continue
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Location;
