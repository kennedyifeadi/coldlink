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
    <div className="flex flex-col h-full min-h-screen bg-background p-6 relative">
      {/* Header / Logo Area */}
      <div className="flex items-center gap-2 mt-8 mb-16">
        <div className="bg-primary p-1.5 rounded-lg text-ink">
          <Snowflake size={24} />
        </div>
        <div className="flex flex-col">
          <div className="flex font-heading font-extrabold text-headline tracking-tight leading-none">
            <span className="text-ink">Cold</span>
            <span className="text-accent">Link</span>
          </div>
          <span className="text-ink text-[0.6rem] font-bold tracking-[0.2em] mt-0.5">
            STORAGE, NEARBY
          </span>
        </div>
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
          <label className="block text-label font-medium text-copy mb-2">Phone number</label>
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
              type="tel"
              placeholder="800 000 0000"
              className="w-full px-4 py-3.5 text-subtitle text-copy bg-surface placeholder-copy-subtle focus:outline-none"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
        </div>

        {/* Continue Button */}
        <button
          type="submit"
          disabled={phoneNumber.length < 5}
          className={`group flex items-center justify-center w-full py-4 rounded-lg font-medium text-subtitle transition-all
            ${phoneNumber.length < 5 ? 'bg-primary-muted text-ink/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-ink shadow-md'}
          `}
        >
          <span>Continue</span>
          <ArrowRight
            size={20}
            className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
          />
        </button>

        {/* Footer Text */}
        <p className="text-center text-copy-muted text-body mt-8 px-4 leading-relaxed">
          Your phone number creates your ColdLink User ID. No password required.
        </p>
      </form>
    </div>
  );
};

export default Onboarding;
