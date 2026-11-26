import React, { type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Clock, Info, type LucideIcon } from 'lucide-react';

export type NoticeTone = 'info' | 'waiting' | 'error' | 'done';

interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  role?: 'status' | 'alert';
}

const tones: Record<NoticeTone, { icon: LucideIcon; classes: string }> = {
  info: { icon: Info, classes: 'bg-surface-muted text-copy' },
  waiting: { icon: Clock, classes: 'bg-accent-faint text-accent-ink' },
  error: { icon: CircleAlert, classes: 'bg-alert-faint text-alert-strong' },
  done: { icon: CircleCheck, classes: 'bg-primary-faint text-primary-strong' },
};

// A tone always comes with its icon, so the message never relies on colour alone.
const Notice = ({ tone = 'info', title, children, role = 'status' }: NoticeProps) => {
  const { icon: Icon, classes } = tones[tone];

  return (
    <div role={role} className={`flex gap-3 rounded-xl px-4 py-3.5 ${classes}`}>
      <Icon size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex flex-col gap-1 text-body">
        {title && <h2 className="font-semibold">{title}</h2>}
        {children && <div className={title ? 'text-copy' : ''}>{children}</div>}
      </div>
    </div>
  );
};

export default Notice;
