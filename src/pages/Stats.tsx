import { useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import ProgressBar from '../components/ui/ProgressBar';
import { useLanguage } from '../i18n/LanguageContext';
import {
  RoutineLogRow,
  RoutineRow,
  calculateRoutineStats,
  calculateStreak,
  fetchRoutineLogsForUsers,
  getLastDateKeys,
  getWeekDateKeys,
  isPositiveRoutineStatus,
  isRoutineVisibleToday,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

function getBestStreak(logs: RoutineLogRow[]) {
  const uniqueDates = Array.from(new Set(logs.filter((log) => isPositiveRoutineStatus(log.status)).map((log) => log.log_date))).sort();
  if (uniqueDates.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T12:00:00`);
    const next = new Date(`${uniqueDates[index]}T12:00:00`);
    const difference = Math.round((next.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
    current = difference === 1 ? current + 1 : 1;
    best = Math.max(best, current);
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
        const { data, error: routinesError } = await supabase.from('routines').select('*').eq('user_id', user.id);
        if (routinesError) throw routinesError;
        const logs = await fetchRoutineLogsForUsers([user.id]);
        if (active) {
          setUserId(user.id);
          setRoutines(((data as RoutineRow[]) ?? []).filter((routine) => !routine.is_template));
          setRoutineLogs(logs.filter((log) => log.user_id === user.id));
        }
      } catch (loadError) {
        console.warn('Stats load failed:', loadError);
        if (active) setError(isKo ? '기록을 불러오지 못했어요.' : 'Could not load your records.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadStats();
    return () => {
      active = false;
    };
  }, [isKo]);

  const sevenDayKeys = useMemo(() => getLastDateKeys(7), []);
  const monthKeys = useMemo(() => getLastDateKeys(30), []);
  const weekKeys = useMemo(() => getWeekDateKeys(), []);
  const streak = useMemo(() => calculateStreak(routineLogs), [routineLogs]);
  const bestStreak = useMemo(() => getBestStreak(routineLogs), [routineLogs]);
  const monthStats = useMemo(() => calculateRoutineStats(routines, routineLogs, userId, monthKeys), [monthKeys, routineLogs, routines, userId]);
  const weekStats = useMemo(() => calculateRoutineStats(routines, routineLogs, userId, weekKeys), [routineLogs, routines, userId, weekKeys]);
  const previousMonthStats = useMemo(() => calculateRoutineStats(routines, routineLogs, userId, getLastDateKeys(30, getPreviousWindowEnd(30))), [routineLogs, routines, userId]);
  const totalCompletedCount = useMemo(() => routineLogs.filter((log) => isPositiveRoutineStatus(log.status)).length, [routineLogs]);
  const monthDelta = monthStats.percent - previousMonthStats.percent;

  const routineRecords = useMemo(() => routines.map((routine) => {
    const total = monthKeys.filter((dateKey) => {
      const day = new Date(`${dateKey}T12:00:00`).getDay();
      return isRoutineVisibleToday(routine, ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] as any);
    }).length;
    const completed = routineLogs.filter((log) => log.routine_id === routine.id && monthKeys.includes(log.log_date) && isPositiveRoutineStatus(log.status)).length;
    return { id: routine.id, title: routine.title, completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }).sort((first, second) => second.percent - first.percent || first.title.localeCompare(second.title)), [monthKeys, routineLogs, routines]);

  const recentDayCards = useMemo(() => sevenDayKeys.slice().reverse().map((dateKey) => {
    const completedIds = new Set(routineLogs.filter((log) => log.log_date === dateKey && isPositiveRoutineStatus(log.status)).map((log) => String(log.routine_id)));
    const labels = routines.filter((routine) => completedIds.has(String(routine.id))).map((routine) => routine.title).slice(0, 5);
    return {
      dateKey,
      labels,
      doneCount: completedIds.size,
      dateLabel: dateKey === sevenDayKeys[6] ? (isKo ? '오늘' : 'Today') : new Intl.RelativeTimeFormat(screenLocale, { numeric: 'auto' }).format(Math.round((new Date(`${dateKey}T12:00:00`).getTime() - new Date(`${sevenDayKeys[6]}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24)), 'day'),
    };
  }), [isKo, routineLogs, routines, screenLocale, sevenDayKeys]);

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen service-screen">
        <header className="service-simple-header service-record-header">
          <h1>{isKo ? '기록' : 'Records'}</h1>
          <p>{isKo ? '나의 루틴 달성 기록' : 'Your routine history'}</p>
        </header>

        <main className="service-page-content service-records-page">
          {error ? <p className="error home-error">{error}</p> : null}

          <section className="service-record-summary-grid">
            <article className="service-card service-record-summary-card"><strong>{streak}일</strong><span>{isKo ? '현재 연속' : 'Current streak'}</span></article>
            <article className="service-card service-record-summary-card"><strong>{bestStreak}일</strong><span>{isKo ? '최장 연속' : 'Best streak'}</span></article>
            <article className="service-card service-record-summary-card"><strong>{monthStats.percent}%</strong><span>{isKo ? '최근 30일' : 'Last 30 days'}</span></article>
            <article className="service-card service-record-summary-card"><strong>{totalCompletedCount}</strong><span>{isKo ? '총 완료' : 'Total completed'}</span></article>
          </section>

          <section className="service-card service-growth-card">
            <div className="service-growth-icon">↑</div>
            <div>
              <strong>{monthDelta >= 0 ? (isKo ? '좋아요! 꾸준히 성장 중이에요' : 'Nice work! You are growing steadily') : isKo ? '조금만 더 리듬을 찾아봐요' : 'You can find the rhythm again'}</strong>
              <p>{monthDelta >= 0 ? (isKo ? `지난 30일 대비 ${monthDelta}% 상승` : `Up ${monthDelta}% from the previous 30 days`) : (isKo ? `지난 30일 대비 ${Math.abs(monthDelta)}% 하락` : `Down ${Math.abs(monthDelta)}% from the previous 30 days`)}</p>
            </div>
          </section>

          <section className="service-section-block">
            <div className="service-section-header">
              <div className="service-section-copy">
                <h2>{isKo ? '이번 주' : 'This week'}</h2>
              </div>
            </div>
            <div className="service-card service-week-card">
              <div className="service-week-card-row">
                {weekStats.daily.map((day) => (
                  <article key={day.dateKey} className="service-week-card-day">
                    <span>{new Intl.DateTimeFormat(screenLocale, { weekday: 'short' }).format(new Date(`${day.dateKey}T12:00:00`))}</span>
                    <strong className={`service-week-day-count service-week-day-count-${day.status}`}>{day.status === 'done' ? '●' : day.status === 'partial' ? '◐' : day.status === 'rest' ? '−' : day.percent > 0 ? day.percent : '○'}</strong>
                    <small>/{Math.max(day.total, 1)}</small>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="service-section-block">
            <div className="service-section-header"><div className="service-section-copy"><h2>{isKo ? '루틴별 통계' : 'Routine stats'}</h2></div></div>
            <div className="service-record-list">
              {routineRecords.map((routine) => (
                <article key={routine.id} className="service-card service-routine-stat-card">
                  <div className="service-routine-stat-head">
                    <strong>{routine.title}</strong>
                    <span>{routine.percent}%</span>
                  </div>
                  <ProgressBar value={routine.percent} />
                  <p>{routine.completed}/{routine.total || 30}{isKo ? '일' : ' days'}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="service-section-block">
            <div className="service-section-header"><div className="service-section-copy"><h2>{isKo ? '최근 7일' : 'Last 7 days'}</h2></div></div>
            <div className="service-record-history-list">
              {recentDayCards.map((day) => (
                <article key={day.dateKey} className="service-card service-record-history-card">
                  <div className="service-record-history-head">
                    <strong>{day.dateLabel}</strong>
                    <span>{day.doneCount}{isKo ? '개 완료' : ' done'}</span>
                  </div>
                  <div className="service-chip-row">
                    {day.labels.length > 0 ? day.labels.map((label) => <span key={`${day.dateKey}-${label}`} className="service-history-chip">{label}</span>) : <span className="service-history-chip">{isKo ? '완료 없음' : 'No completions'}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
