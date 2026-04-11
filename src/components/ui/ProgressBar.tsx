type ProgressBarProps = {
  value: number;
  tone?: 'dark' | 'muted';
  className?: string;
};

export default function ProgressBar({ value, tone = 'dark', className = '' }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const toneClass = tone === 'dark' ? 'service-progress-fill-dark' : 'service-progress-fill-muted';

  return (
    <div className={`service-progress-track ${className}`.trim()} aria-hidden="true">
      <span className={`service-progress-fill ${toneClass}`} style={{ width: `${safeValue}%` }} />
    </div>
  );
}
