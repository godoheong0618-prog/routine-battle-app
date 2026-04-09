import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BattleLeader } from '../lib/mvp';

type BattleScoreCardProps = {
  eyebrow: string;
  title: string;
  myLabel: string;
  friendLabel: string;
  myScore: number;
  friendScore: number;
  leader: BattleLeader;
  daysLeft: number | null;
  actionHint: string;
  hasFriend: boolean;
  hasBattleStarted: boolean;
  emptyTitle: string;
  emptyBody: string;
  setupHref?: string;
  setupLabel?: string;
  ctaHref?: string;
  ctaLabel?: string;
  className?: string;
};

function useCountUpValue(value: number) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const start = previousValue.current;

    if (start === value) {
      setDisplayValue(value);
      return;
    }

    const duration = 420;
    const startedAt = window.performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(start + (value - start) * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      previousValue.current = value;
      setDisplayValue(value);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [value]);

  return Math.round(displayValue);
}

function getInitial(label: string) {
  const normalized = label.trim();
  return normalized.slice(0, 1).toUpperCase() || '?';
}

export default function BattleScoreCard({
  eyebrow,
  title,
  myLabel,
  friendLabel,
  myScore,
  friendScore,
  leader,
  daysLeft,
  actionHint,
  hasFriend,
  hasBattleStarted,
  emptyTitle,
  emptyBody,
  setupHref,
  setupLabel,
  ctaHref,
  ctaLabel,
  className = '',
}: BattleScoreCardProps) {
  const myDisplayScore = useCountUpValue(myScore);
  const friendDisplayScore = useCountUpValue(friendScore);
  const [pulse, setPulse] = useState(false);
  const previousMyScore = useRef(myScore);
  const previousFriendScore = useRef(friendScore);
  const hasMounted = useRef(false);
  const ctaElement =
    ctaHref && ctaLabel ? (
      ctaHref.startsWith('#') ? (
        <a className="battle-score-cta" href={ctaHref}>
          {ctaLabel}
        </a>
      ) : (
        <Link className="battle-score-cta" to={ctaHref}>
          {ctaLabel}
        </Link>
      )
    ) : null;

  useEffect(() => {
    const scoreIncreased = myScore > previousMyScore.current || friendScore > previousFriendScore.current;

    if (hasMounted.current && scoreIncreased) {
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 520);
      previousMyScore.current = myScore;
      previousFriendScore.current = friendScore;
      return () => window.clearTimeout(timer);
    }

    hasMounted.current = true;
    previousMyScore.current = myScore;
    previousFriendScore.current = friendScore;
  }, [friendScore, myScore]);

  if (!hasFriend || !hasBattleStarted) {
    return (
      <section className={`battle-score-card battle-score-card-empty ${className}`}>
        <div className="battle-score-card-top">
          <div>
            <p className="section-eyebrow">{eyebrow}</p>
            <h2>{emptyTitle}</h2>
          </div>
        </div>

        <p className="battle-score-empty-copy">{emptyBody}</p>

        {setupHref && setupLabel && (
          <Link className="battle-score-cta battle-score-cta-secondary" to={setupHref}>
            {setupLabel}
          </Link>
        )}
      </section>
    );
  }

  return (
    <section
      className={`battle-score-card battle-score-card-${leader} ${pulse ? 'battle-score-card-pulse' : ''} ${className}`}
    >
      <div className="battle-score-card-top">
        <div>
          <p className="section-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {daysLeft !== null && <span className="battle-days-pill">D-{daysLeft}</span>}
      </div>

      <div className="battle-score-versus">
        <article className={leader === 'me' ? 'battle-score-player battle-score-player-leading' : 'battle-score-player'}>
          <div className="battle-score-avatar">{getInitial(myLabel)}</div>
          <span>{myLabel}</span>
          <strong>{myDisplayScore}</strong>
        </article>

        <div className="battle-score-vs">VS</div>

        <article
          className={leader === 'friend' ? 'battle-score-player battle-score-player-leading' : 'battle-score-player'}
        >
          <div className="battle-score-avatar">{getInitial(friendLabel)}</div>
          <span>{friendLabel}</span>
          <strong>{friendDisplayScore}</strong>
        </article>
      </div>

      <div className="battle-score-message">
        <p className="battle-score-hint">{actionHint}</p>
        {ctaElement}
      </div>
    </section>
  );
}
