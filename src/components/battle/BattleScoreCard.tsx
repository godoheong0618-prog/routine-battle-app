import AvatarBadge, { AvatarConfig } from './AvatarBadge';

type Competitor = AvatarConfig & {
  name: string;
  completed: number;
  total: number;
  points: number;
  ring?: boolean;
};

type BattleScoreCardProps = {
  me: Competitor;
  opponent: Competitor;
  statusText: string;
  helperText: string;
};

export default function BattleScoreCard({ me, opponent, statusText, helperText }: BattleScoreCardProps) {
  return (
    <section className="battle-clone-score-card">
      <div className="battle-clone-score-grid">
        <article className="battle-clone-competitor">
          <AvatarBadge
            avatarBgColor={me.avatarBgColor}
            avatarEmoji={me.avatarEmoji}
            label={me.name}
          />
          <span className="battle-clone-competitor-name">{me.name}</span>
          <div className="battle-clone-score-line">
            <strong>{me.completed}</strong>
            <span>/{me.total}</span>
          </div>
          <p>{me.points} pt</p>
        </article>

        <div className="battle-clone-vs-pill">vs</div>

        <article className="battle-clone-competitor">
          <AvatarBadge
            avatarBgColor={opponent.avatarBgColor}
            avatarEmoji={opponent.avatarEmoji}
            ring={opponent.ring}
            label={opponent.name}
          />
          <span className="battle-clone-competitor-name">{opponent.name}</span>
          <div className="battle-clone-score-line">
            <strong>{opponent.completed}</strong>
            <span>/{opponent.total}</span>
          </div>
          <p>{opponent.points} pt</p>
        </article>
      </div>

      <p className="battle-clone-score-status">{statusText}</p>

      <div className="battle-clone-score-helper">
        <span className="battle-clone-helper-dot" aria-hidden="true" />
        <span>{helperText}</span>
      </div>
    </section>
  );
}
