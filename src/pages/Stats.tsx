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
  isPositiveRoutineStatus,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

function getBestStreak(logs: RoutineLogRow[]) {
  const uniqueDates = Array.from(
    new Set(
      logs
        .filter((log) => isPositiveRoutineStatus(log.status))
        .map((log) => log.log_date)
        .filter(Boolean)
    )
  ).sort();

  if (uniqueDates.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T12:00:00`);
    const next = new Date(`${uniqueDates[index]}T12:00:00`);
    const difference = Math.round((next.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

    if (difference === 1) {
      current += 1;
      best = Math.max(best, current);
      continue;
    }

    current = 1;
  }

  return best;
}

function getPreviousWindowEnd(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

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
  const screenLocale = isKo ? 'ko-KR' : 'en-US';

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

        const { data, error: routinesError } = await supabase.from('routines').select('*').in('user_id', relatedUserIds);

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
  const monthStats = useMemo(
    () => calculateRoutineStats(myRoutines, routineLogs, userId, getLastDateKeys(30)),
    [myRoutines, routineLogs, userId]
  );
  const previousMonthStats = useMemo(
    () => calculateRoutineStats(myRoutines, routineLogs, userId, getLastDateKeys(30, getPreviousWindowEnd(30))),
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
  const bestStreak = useMemo(() => getBestStreak(myLogs), [myLogs]);
  const monthDelta = monthStats.percent - previousMonthStats.percent;
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
        <header className="subpage-header stats-page-header">
          <p className="section-eyebrow">{isKo ? '기록 및 통계' : 'Records & stats'}</p>
          <h1>{isKo ? '기록 및 통계' : 'Records & stats'}</h1>
          <p>{isKo ? '꾸준히 쌓아가고 있는 나의 성장 기록' : 'A calm snapshot of the consistency you are building.'}</p>
        </header>

        <main className="subpage-content stats-content polished-stats-content">
          {error && <p className="error home-error">{error}</p>}

          <section className="stats-kpi-grid">
            <article className="stats-kpi-card">
              <span>{isKo ? '현재 연속' : 'Current streak'}</span>
              <strong>
                {streak}
                <em>{isKo ? '일' : 'd'}</em>
              </strong>
            </article>

            <article className="stats-kpi-card">
              <span>{isKo ? '최고 기록' : 'Best record'}</span>
              <strong>
                {bestStreak}
                <em>{isKo ? '일' : 'd'}</em>
              </strong>
            </article>
          </section>

          <section className="stats-feature-card">
            <div className="stats-feature-top">
              <div>
                <span>{isKo ? '평균 완료율' : 'Average completion'}</span>
                <strong>
                  {monthStats.percent}
                  <em>%</em>
                </strong>
              </div>
              <span className="page-chip">{isKo ? '최근 30일' : 'Last 30 days'}</span>
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${monthStats.percent}%` }} />
            </div>

            <p className="stats-feature-note">
              {monthDelta >= 0
                ? isKo
                  ? `지난 기간보다 ${monthDelta}% 올랐어요.`
                  : `Up ${monthDelta}% from the previous window.`
                : isKo
                  ? `지난 기간보다 ${Math.abs(monthDelta)}% 낮아요.`
                  : `${Math.abs(monthDelta)}% lower than the previous window.`}
            </p>
          </section>

          <section className="stats-week-card">
            <div className="section-header section-header-stack">
              <div>
                <h2>{isKo ? '최근 7일 완료 내역' : 'Last 7 days'}</h2>
                <p className="section-description">
                  {isKo ? '한눈에 흐름을 보도록 요일별로 정리했어요.' : 'A simple weekday flow of your recent rhythm.'}
                </p>
              </div>
            </div>

            <div className="stats-week-row">
              {sevenDayStats.daily.map((day) => (
                <div key={day.dateKey} className="stats-week-day">
                  <span>{new Intl.DateTimeFormat(screenLocale, { weekday: 'short' }).format(new Date(`${day.dateKey}T12:00:00`))}</span>
                  <strong className={`stats-week-dot stats-week-dot-${day.status}`}>{day.status === 'done' ? '✓' : ''}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="stats-compare-card stats-compare-bars">
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
                <span>{friendProfile ? friendLabel : isKo ? '친구 없음' : 'No friend'}</span>
                <strong>{friendWeekStats ? `${friendPercent}%` : '-'}</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill progress-fill-muted" style={{ width: `${friendPercent}%` }} />
              </div>
            </article>
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
