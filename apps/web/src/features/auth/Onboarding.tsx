import React, { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import logoMain from '../../assets/logo_main.webp';
import PrimaryButton from '../../components/ui/PrimaryButton';

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
    <div className="flex flex-col h-full min-h-screen bg-background p-6 relative">
      {/* Header / Logo Area */}
      <div className="flex items-center mt-8 mb-16">
        <img src={logoMain} alt="ColdLink, storage nearby" width={190} height={44} />
      </div>

      {/* Hero Text */}
      <div className="mb-auto">
        <h1 className="font-heading text-display font-bold text-ink tracking-tight leading-tight mb-4">
          Find cold storage near you.
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed">
          Keep your harvest fresh by finding available cold storage nearby.
        </p>
      </div>

      {/* Form and Action Area */}
      <form onSubmit={handleContinue} className="w-full mt-12 pb-8">
        {/* Phone Number Input */}
        <div className="mb-8">
          <label htmlFor="phone-number" className="block text-label font-medium text-copy mb-2">
            Phone number
          </label>
          <div className="flex items-center border border-line-strong rounded-lg overflow-hidden focus-within:border-primary-strong focus-within:ring-1 focus-within:ring-primary-strong transition-all">
            {/* Country Code & Flag */}
            <div className="flex items-center gap-2 px-4 py-3.5 bg-surface-muted border-r border-line-strong shrink-0">
              {/* CSS Nigerian Flag (No emojis!) */}
              <div className="flex w-5 h-3.5 rounded-sm overflow-hidden shrink-0 border border-line-strong shadow-sm">
                <div className="w-1/3 h-full bg-flag-green"></div>
                <div className="w-1/3 h-full bg-white"></div>
                <div className="w-1/3 h-full bg-flag-green"></div>
              </div>
              <span className="text-copy font-medium">+234</span>
            </div>

            {/* Input Field */}
            <input
              id="phone-number"
              type="tel"
              placeholder="800 000 0000"
              className="w-full px-4 py-3.5 text-subtitle text-copy bg-surface placeholder-copy-subtle focus:outline-none"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
        </div>

        {/* Continue Button */}
        <PrimaryButton type="submit" disabled={phoneNumber.length < 5} withArrow>
          Continue
        </PrimaryButton>

        {/* Footer Text */}
        <p className="text-center text-copy-muted text-body mt-8 px-4 leading-relaxed">
          Your phone number creates your ColdLink User ID. No password required.
        </p>
      </form>
    </div>
  );
};

export default Onboarding;
