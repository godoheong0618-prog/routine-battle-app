function BattleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon">
      <path d="m7 6 5 5" />
      <path d="m12 11 5-5" />
      <path d="m9.25 13.75-3 3" />
      <path d="m14.75 13.75 3 3" />
      <path d="m6.5 7.5 2-2" />
      <path d="m15.5 5.5 2 2" />
      <path d="m9.75 10.25-2.5 2.5" />
      <path d="m14.25 10.25 2.5 2.5" />
    </svg>
  );
}

type BattleHeaderProps = {
  title: string;
  subtitle: string;
  countdown: string;
};

export default function BattleHeader({ title, subtitle, countdown }: BattleHeaderProps) {
  return (
    <header className="battle-clone-header">
      <div className="battle-clone-header-copy">
        <div className="battle-clone-header-icon">
          <BattleGlyph />
        </div>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <span className="battle-clone-day-pill">{countdown}</span>
    </header>
  );
}
