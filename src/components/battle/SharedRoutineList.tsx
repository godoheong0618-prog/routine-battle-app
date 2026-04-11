type RoutineBadge = {
  label?: string;
  checked?: boolean;
  tone: 'light' | 'dark';
};

export type SharedRoutineItem = {
  id: string;
  title: string;
  subtitle: string;
  completed: boolean;
  badges: RoutineBadge[];
};

type SharedRoutineListProps = {
  items: SharedRoutineItem[];
};

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon battle-clone-inline-icon-small">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon battle-clone-inline-icon-small">
      <path d="m6.75 12.25 3.1 3.1 7-7" />
    </svg>
  );
}

export default function SharedRoutineList({ items }: SharedRoutineListProps) {
  return (
    <section className="battle-clone-section">
      <div className="battle-clone-section-row">
        <h2 className="battle-clone-section-title">{'\uACF5\uB3D9 \uACBD\uC7C1 \uB8E8\uD2F4'}</h2>
        <button className="battle-clone-link-button" type="button">
          {'\uBAA8\uB450 \uBCF4\uAE30'}
          <ChevronRightIcon />
        </button>
      </div>

      <div className="battle-clone-routine-list">
        {items.map((item) => (
          <article key={item.id} className="battle-clone-routine-card">
            <div className={item.completed ? 'battle-clone-routine-check battle-clone-routine-check-active' : 'battle-clone-routine-check'}>
              {item.completed ? <CheckIcon /> : null}
            </div>

            <div className="battle-clone-routine-copy">
              <strong>{item.title}</strong>
              <p>{item.subtitle}</p>
            </div>

            <div className="battle-clone-routine-badges">
              {item.badges.map((badge, index) => (
                <span
                  key={`${item.id}-badge-${index}`}
                  className={badge.tone === 'dark' ? 'battle-clone-mini-badge battle-clone-mini-badge-dark' : 'battle-clone-mini-badge'}
                >
                  {badge.checked ? <CheckIcon /> : badge.label}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
