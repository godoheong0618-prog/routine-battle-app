function LightningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon">
      <path d="M13.5 3 7.5 12h4l-1 9 6-9h-4L13.5 3Z" />
    </svg>
  );
}

type TodayProgressCardProps = {
  myCount: number;
  opponentCount: number;
  opponentName: string;
};

export default function TodayProgressCard({ myCount, opponentCount, opponentName }: TodayProgressCardProps) {
  return (
    <section className="battle-clone-section">
      <h2 className="battle-clone-section-title">{'\uC624\uB298\uC758 \uC9C4\uD589 \uC0C1\uD669'}</h2>

      <div className="battle-clone-progress-card">
        <div className="battle-clone-progress-copy">
          <div className="battle-clone-progress-icon">
            <LightningIcon />
          </div>
          <div>
            <strong>{'\uC624\uB298 \uC644\uB8CC\uD55C \uB8E8\uD2F4'}</strong>
            <p>{'\uC870\uAE08 \uB354 \uBD84\uBC1C\uD574\uC694!'}</p>
          </div>
        </div>

        <div className="battle-clone-progress-stats">
          <div className="battle-clone-progress-stat">
            <span>{'\uB098'}</span>
            <strong>{myCount}</strong>
          </div>
          <div className="battle-clone-progress-stat">
            <span>{opponentName}</span>
            <strong>{opponentCount}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
