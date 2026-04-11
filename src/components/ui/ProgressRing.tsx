type ProgressRingProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
};

export default function ProgressRing({
  value,
  size = 88,
  strokeWidth = 8,
  className = '',
  label,
}: ProgressRingProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safeValue / 100) * circumference;
  const center = size / 2;

  return (
    <div className={`service-progress-ring ${className}`.trim()} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle
          className="service-progress-ring-track"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          className="service-progress-ring-value"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="service-progress-ring-label">{safeValue}%</span>
    </div>
  );
}
