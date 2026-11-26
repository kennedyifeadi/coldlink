import React from 'react';
import { CircleAlert } from 'lucide-react';

interface ErrorMessageProps {
  id?: string;
  children: string;
}

// An icon as well as the colour, so the error never relies on colour alone.
const ErrorMessage = ({ id, children }: ErrorMessageProps) => (
  <p
    id={id}
    role="alert"
    className="flex items-start gap-2 text-alert-strong text-label font-medium"
  >
    <CircleAlert size={18} aria-hidden="true" className="shrink-0 mt-px" />
    <span>{children}</span>
  </p>
);

export default ErrorMessage;
