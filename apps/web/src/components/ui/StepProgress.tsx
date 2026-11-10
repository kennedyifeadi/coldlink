import React from 'react';

interface StepProgressProps {
  step: number;
  count: number;
  label: string;
}

const StepProgress = ({ step, count, label }: StepProgressProps) => (
  <div className="px-6 pt-4">
    <p className="text-copy-muted text-label font-medium mb-2">{label}</p>
    <div aria-hidden="true" className="flex gap-1.5">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`h-1.5 flex-1 rounded-full ${index < step ? 'bg-primary' : 'bg-line-strong'}`}
        />
      ))}
    </div>
  </div>
);

export default StepProgress;
