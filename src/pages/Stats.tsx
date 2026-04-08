import { useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import { formatOpponentLabel, formatSelfLabel } from '../lib/nameDisplay';
import {
  ProfileRow,
  RoutineLogRow,
  RoutineRow,
  calculateRoutineStats,
  calculateStreak,
  ensureProfile,
  fetchFriendConnection,
  fetchRoutineLogsForUsers,
  getFullWeekDateKeys,
  getLastDateKeys,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

export default function Stats() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const ensuredProfile = await ensureProfile(user);
        const connection = await fetchFriendConnection(ensuredProfile);
        const relatedUserIds = connection.friendProfile ? [user.id, connection.friendProfile.id] : [user.id];

        const { data, error: routinesError } = await supabase
          .from('routines')
          .select('*')
          .in('user_id', relatedUserIds);

        if (routinesError) {
          throw routinesError;
        }

        const logs = await fetchRoutineLogsForUsers(relatedUserIds);

        if (active) {
          setUserId(user.id);
          setProfile(connection.profile);
          setFriendProfile(connection.friendProfile);
          setRoutines(((data as RoutineRow[]) ?? []).filter((routine) => !routine.is_template));
          setRoutineLogs(logs);
        }
      } catch (loadError) {
        console.warn('Stats load failed:', loadError);
        if (active) {
          setError(isKo ? '통계를 불러오지 못했어요.' : 'Could not load stats.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      active = false;
    };
  }, [isKo]);

  const myRoutines = useMemo(() => routines.filter((routine) => routine.user_id === userId), [routines, userId]);
  const friendRoutines = useMemo(
    () => routines.filter((routine) => routine.user_id === friendProfile?.id),
    [friendProfile?.id, routines]
  );
  const myLogs = useMemo(() => routineLogs.filter((log) => log.user_id === userId), [routineLogs, userId]);
  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: t('common.me') });
  const friendLabel = formatOpponentLabel(friendProfile?.nickname, { locale });

  const weekStats = useMemo(
    () => calculateRoutineStats(myRoutines, routineLogs, userId, getFullWeekDateKeys()),
    [myRoutines, routineLogs, userId]
  );
  const sevenDayStats = useMemo(
    () => calculateRoutineStats(myRoutines, routineLogs, userId, getLastDateKeys(7)),
    [myRoutines, routineLogs, userId]
  );
  const friendWeekStats = useMemo(
    () =>
      friendProfile
        ? calculateRoutineStats(friendRoutines, routineLogs, friendProfile.id, getFullWeekDateKeys())
        : null,
    [friendProfile, friendRoutines, routineLogs]
  );
  const streak = useMemo(() => calculateStreak(myLogs), [myLogs]);
  const friendPercent = friendWeekStats?.percent ?? 0;

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen subpage-screen stats-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">{isKo ? '기록' : 'Stats'}</p>
          <h1>{isKo ? '이번 주 기록' : 'This week stats'}</h1>
          <p>{isKo ? '필요한 숫자만 간단히 확인해요.' : 'A compact view of the numbers that matter.'}</p>
        </header>

        <main className="subpage-content stats-content">
          {error && <p className="error home-error">{error}</p>}

          <section className="stats-hero-card">
            <span>{isKo ? '주간 달성률' : 'Weekly achievement'}</span>
            <strong>{weekStats.percent}%</strong>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${weekStats.percent}%` }} />
            </div>
          </section>

          <section className="stats-card-grid">
            <article className="stat-card">
              <span>{isKo ? '현재 streak' : 'Current streak'}</span>
              <strong>{isKo ? `${streak}일` : `${streak} days`}</strong>
            </article>
            <article className="stat-card">
              <span>{isKo ? '완료' : 'Done'}</span>
              <strong>{weekStats.doneCount}</strong>
            </article>
            <article className="stat-card">
              <span>{isKo ? '조금 함' : 'Partial'}</span>
              <strong>{weekStats.partialCount}</strong>
            </article>
            <article className="stat-card">
              <span>{isKo ? '쉼' : 'Rest'}</span>
              <strong>{weekStats.restCount}</strong>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{isKo ? '최근 7일' : 'Last 7 days'}</h2>
                <p className="section-description">{isKo ? '초록/노랑/회색/빨강으로 상태를 구분해요.' : 'Green, yellow, gray, and red show the flow.'}</p>
              </div>
            </div>
            <div className="stats-seven-card">
              {sevenDayStats.daily.map((day) => (
                <div key={day.dateKey} className="stats-day-cell">
                  <span className={`traffic-cell traffic-cell-${day.status}`} />
                  <strong>{day.dateKey.slice(5)}</strong>
                  <small>{day.percent}%</small>
                </div>
              ))}
            </div>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{isKo ? '친구와 비교' : 'Friend comparison'}</h2>
                <p className="section-description">{friendProfile ? `${profileLabel} vs ${friendLabel}` : t('home.battleWaiting')}</p>
              </div>
            </div>

            <div className="stats-compare-card stats-compare-bars">
              <article>
                <div className="stats-compare-row">
                  <span>{profileLabel}</span>
                  <strong>{weekStats.percent}%</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${weekStats.percent}%` }} />
                </div>
              </article>
              <article>
                <div className="stats-compare-row">
                  <span>{friendLabel}</span>
                  <strong>{friendWeekStats ? `${friendPercent}%` : '-'}</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill progress-fill-muted" style={{ width: `${friendPercent}%` }} />
                </div>
              </article>
            </div>
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
