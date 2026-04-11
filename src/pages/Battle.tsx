import { useState } from 'react';
import { AvatarConfig } from '../components/battle/AvatarBadge';
import BattleHeader from '../components/battle/BattleHeader';
import BattleScoreCard from '../components/battle/BattleScoreCard';
import BottomNav from '../components/battle/BottomNav';
import SharedRoutineList, { SharedRoutineItem } from '../components/battle/SharedRoutineList';
import TodayProgressCard from '../components/battle/TodayProgressCard';
import WeeklyChartCard, { WeeklyBarDatum } from '../components/battle/WeeklyChartCard';

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon battle-clone-inline-icon-small">
      <path d="M12 5.25a3.25 3.25 0 0 0-3.25 3.25v1.25c0 .94-.28 1.86-.8 2.64L6.5 14.5h11l-1.45-2.11a4.56 4.56 0 0 1-.8-2.64V8.5A3.25 3.25 0 0 0 12 5.25Z" />
      <path d="M10.25 17.5a1.9 1.9 0 0 0 3.5 0" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon">
      <path d="M8 5.5h8v2.25A4 4 0 0 1 12 11.75 4 4 0 0 1 8 7.75V5.5Z" />
      <path d="M9 18.5h6" />
      <path d="M10.5 15.25h3" />
      <path d="M12 11.75v3.5" />
      <path d="M8 6.75H5.75A1.75 1.75 0 0 0 4 8.5c0 1.8 1.45 3.25 3.25 3.25H8" />
      <path d="M16 6.75h2.25A1.75 1.75 0 0 1 20 8.5c0 1.8-1.45 3.25-3.25 3.25H16" />
    </svg>
  );
}

export default function Battle() {
  const [myAvatar] = useState<AvatarConfig>({
    avatarBgColor: '#ffd348',
    avatarEmoji: '\uD83D\uDE0A',
  });

  const [opponentAvatar] = useState<AvatarConfig>({
    avatarBgColor: '#111111',
    avatarEmoji: '\uD83E\uDD8A',
  });

  const sharedRoutines: SharedRoutineItem[] = [
    {
      id: 'routine-1',
      title: '\uC77C\uC8FC\uC77C \uC6B4\uB3D9 5\uD68C',
      subtitle: '\uC9C4\uC11C\uB0A8\uC774 \uC0AC\uC9C4 \uC4F0\uAE30',
      completed: false,
      badges: [
        { label: '\uB098', tone: 'light' },
        { checked: true, tone: 'dark' },
      ],
    },
    {
      id: 'routine-2',
      title: '\uD55C \uB2EC \uB3C5\uC11C 4\uAD8C',
      subtitle: '\uC9C4\uC11C\uB0A8\uC774 \uCE74\uD398 \uC4F0\uAE30',
      completed: true,
      badges: [
        { checked: true, tone: 'dark' },
        { label: '\uC11C', tone: 'light' },
      ],
    },
  ];

  const weeklyData: WeeklyBarDatum[] = [
    { day: '\uC6D4', me: 46, opponent: 38 },
    { day: '\uD654', me: 59, opponent: 49 },
    { day: '\uC218', me: 40, opponent: 58 },
    { day: '\uBAA9', me: 58, opponent: 39 },
    { day: '\uAE08', me: 45, opponent: 46 },
    { day: '\uD1A0', me: 46, opponent: 38 },
    { day: '\uC77C', me: 18, opponent: 37 },
  ];

  return (
    <div className="mobile-shell battle-clone-outer">
      <div className="app-screen battle-clone-shell">
        <main className="battle-clone-page">
          <BattleHeader
            title={'\uBC30\uD2C0 \uD604\uD669'}
            subtitle={'\uC11C\uC5F0\uB2D8\uACFC\uC758 4\uC8FC\uCC28 \uBC30\uD2C0'}
            countdown="D-3"
          />

          <BattleScoreCard
            me={{
              name: '\uB098',
              completed: 2,
              total: 6,
              points: 150,
              avatarBgColor: myAvatar.avatarBgColor,
              avatarEmoji: myAvatar.avatarEmoji,
            }}
            opponent={{
              name: '\uC11C\uC5F0',
              completed: 3,
              total: 5,
              points: 180,
              avatarBgColor: opponentAvatar.avatarBgColor,
              avatarEmoji: opponentAvatar.avatarEmoji,
              ring: true,
            }}
            statusText={'1\uAC1C \uCC28\uC774\uB85C \uB4A4\uC9C0\uACE0 \uC788\uC5B4\uC694.'}
            helperText={'\uB8E8\uD2F4 1\uAC1C \uB354 \uC644\uB8CC\uD558\uBA74 \uB3D9\uC810\uC774\uC5D0\uC694'}
          />

          <TodayProgressCard myCount={2} opponentCount={3} opponentName={'\uC11C\uC5F0'} />

          <button className="battle-clone-nudge-button" type="button">
            <BellIcon />
            <span>{'\uC11C\uC5F0\uB2D8 \uCF55 \uCC0C\uB974\uAE30'}</span>
          </button>

          <SharedRoutineList items={sharedRoutines} />

          <WeeklyChartCard data={weeklyData} opponentName={'\uC11C\uC5F0'} />

          <section className="battle-clone-summary-card">
            <div className="battle-clone-summary-copy">
              <div className="battle-clone-summary-icon">
                <TrophyIcon />
              </div>
              <div>
                <strong>{'\uC774\uBC88 \uC8FC \uB204\uC801'}</strong>
                <p>{'\uBD84\uBC1C\uD558\uC138\uC694!'}</p>
              </div>
            </div>

            <div className="battle-clone-summary-score">
              <strong>150</strong>
              <span>vs 180 pt</span>
            </div>
          </section>
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
