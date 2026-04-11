import { useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import {
  RoutineLogRow,
  RoutineRow,
  calculateRoutineStats,
  calculateStreak,
  fetchRoutineLogsForUsers,
  getLastDateKeys,
  isPositiveRoutineStatus,
  isRoutineVisibleToday,
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

function getDateLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00`));
}

function getDayStatusText(status: string, isKo: boolean) {
  if (status === 'done') {
    return isKo ? '완료' : 'Done';
  }

  if (status === 'partial') {
    return isKo ? '부분 완료' : 'Partial';
  }

  if (status === 'rest') {
    return isKo ? '휴식' : 'Rest';
  }

  if (status === 'off') {
    return isKo ? '예정 없음' : 'Off';
  }

  return isKo ? '놓침' : 'Missed';
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

        if (routinesError) {
          throw routinesError;
        }

        const logs = await fetchRoutineLogsForUsers([user.id]);

        if (active) {
          setUserId(user.id);
          setRoutines(((data as RoutineRow[]) ?? []).filter((routine) => !routine.is_template));
          setRoutineLogs(logs.filter((log) => log.user_id === user.id));
        }
      } catch (loadError) {
        console.warn('Stats load failed:', loadError);
        if (active) {
          setError(isKo ? '기록을 불러오지 못했어요.' : 'Could not load your records.');
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

  const sevenDayKeys = useMemo(() => getLastDateKeys(7), []);
  const monthKeys = useMemo(() => getLastDateKeys(30), []);
  const streak = useMemo(() => calculateStreak(routineLogs), [routineLogs]);
  const bestStreak = useMemo(() => getBestStreak(routineLogs), [routineLogs]);
  const sevenDayStats = useMemo(() => calculateRoutineStats(routines, routineLogs, userId, sevenDayKeys), [routines, routineLogs, sevenDayKeys, userId]);
  const monthStats = useMemo(() => calculateRoutineStats(routines, routineLogs, userId, monthKeys), [routines, routineLogs, monthKeys, userId]);
  const previousMonthStats = useMemo(() => calculateRoutineStats(routines, routineLogs, userId, getLastDateKeys(30, getPreviousWindowEnd(30))), [routines, routineLogs, userId]);
  const monthDelta = monthStats.percent - previousMonthStats.percent;
  const totalCompletedCount = useMemo(() => routineLogs.filter((log) => isPositiveRoutineStatus(log.status)).length, [routineLogs]);

  const routineRecords = useMemo(() => {
    return routines
      .map((routine) => {
        const scheduledKeys = monthKeys.filter((dateKey) => isRoutineVisibleToday(routine, (() => {
          const day = new Date(`${dateKey}T12:00:00`).getDay();
          return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] as any;
        })()));
        const completed = routineLogs.filter(
          (log) =>
            log.routine_id === routine.id &&
            monthKeys.includes(log.log_date) &&
            isPositiveRoutineStatus(log.status)
        ).length;
        const total = scheduledKeys.length;

        return {
          id: routine.id,
          title: routine.title,
          completed,
          total,
          percent: total === 0 ? 0 : Math.round((completed / total) * 100),
        };
      })
      .sort((first, second) => second.percent - first.percent || second.completed - first.completed || first.title.localeCompare(second.title));
  }, [monthKeys, routineLogs, routines]);

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
        <header className="subpage-header stats-page-header record-header-card">
          <p className="section-eyebrow">{isKo ? '기록' : 'Records'}</p>
          <h1>{isKo ? '기록 및 통계' : 'Records & stats'}</h1>
          <p>{isKo ? '숫자와 날짜 중심으로 지난 흐름을 정리했어요.' : 'A clean view of your consistency, dates, and routine totals.'}</p>
        </header>

        <main className="subpage-content record-page-content">
          {error && <p className="error home-error">{error}</p>}

          <section className="record-summary-grid">
            <article className="record-summary-card">
              <span>{isKo ? '현재 연속 달성' : 'Current streak'}</span>
              <strong>{streak}<em>{isKo ? '일' : 'd'}</em></strong>
            </article>
            <article className="record-summary-card">
              <span>{isKo ? '최고 연속 달성' : 'Best streak'}</span>
              <strong>{bestStreak}<em>{isKo ? '일' : 'd'}</em></strong>
            </article>
            <article className="record-summary-card record-summary-card-dark">
              <span>{isKo ? '최근 30일 완료율' : '30-day completion rate'}</span>
              <strong>{monthStats.percent}<em>%</em></strong>
            </article>
            <article className="record-summary-card">
              <span>{isKo ? '총 완료 수' : 'Total completed'}</span>
              <strong>{totalCompletedCount}<em>{isKo ? '회' : ''}</em></strong>
            </article>
          </section>

          <section className="record-overview-card">
            <div>
              <p className="record-overview-label">{isKo ? '성장 메모' : 'Growth note'}</p>
              <h2>{isKo ? '최근 30일 흐름' : 'Last 30 days'}</h2>
            </div>
            <p className="record-overview-copy">
              {monthDelta >= 0
                ? isKo
                  ? `이전 30일보다 ${monthDelta}% 좋아졌어요.`
                  : `Up ${monthDelta}% compared with the previous 30 days.`
                : isKo
                  ? `이전 30일보다 ${Math.abs(monthDelta)}% 낮아요.`
                  : `${Math.abs(monthDelta)}% lower than the previous 30 days.`}
            </p>
            <div className="record-overview-stats">
              <span>{isKo ? `완료 ${monthStats.doneCount}회` : `${monthStats.doneCount} done`}</span>
              <span>{isKo ? `부분 완료 ${monthStats.partialCount}회` : `${monthStats.partialCount} partial`}</span>
              <span>{isKo ? `놓친 루틴 ${monthStats.missedCount}회` : `${monthStats.missedCount} missed`}</span>
            </div>
          </section>

          <section className="record-panel">
            <div className="record-panel-header">
              <div>
                <p className="record-panel-kicker">{isKo ? '최근 7일' : 'Last 7 days'}</p>
                <h2>{isKo ? '날짜별 달성 상태' : 'Daily status'}</h2>
              </div>
            </div>

            <div className="record-seven-grid">
              {sevenDayStats.daily.map((day) => (
                <article key={day.dateKey} className="record-seven-cell">
                  <span>{new Intl.DateTimeFormat(screenLocale, { weekday: 'short' }).format(new Date(`${day.dateKey}T12:00:00`))}</span>
                  <strong className={`record-seven-mark record-seven-mark-${day.status}`}>{day.status === 'done' ? '✓' : day.status === 'partial' ? '◐' : day.status === 'rest' ? '−' : ''}</strong>
                  <small>{new Intl.DateTimeFormat(screenLocale, { day: 'numeric' }).format(new Date(`${day.dateKey}T12:00:00`))}</small>
                </article>
              ))}
            </div>

            <div className="record-day-list">
              {sevenDayStats.daily.map((day) => (
                <article key={day.dateKey} className="record-day-row">
                  <div>
                    <strong>{getDateLabel(day.dateKey, screenLocale)}</strong>
                    <p>{getDayStatusText(day.status, isKo)}</p>
                  </div>
                  <div className="record-day-metrics">
                    <span>{day.percent}%</span>
                    <small>{isKo ? `${day.total}개 예정` : `${day.total} scheduled`}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="record-panel">
            <div className="record-panel-header">
              <div>
                <p className="record-panel-kicker">{isKo ? '루틴별 기록' : 'By routine'}</p>
                <h2>{isKo ? '최근 30일 누적 기록' : '30-day totals by routine'}</h2>
              </div>
            </div>

            {routineRecords.length === 0 ? (
              <article className="empty-state-card">
                <h3>{isKo ? '아직 기록할 루틴이 없어요.' : 'No routine records yet.'}</h3>
                <p>{isKo ? '홈에서 루틴을 만들고 체크하면 이곳에 누적 기록이 쌓여요.' : 'Create and check routines from Home to build up your records here.'}</p>
              </article>
            ) : (
              <div className="record-routine-list">
                {routineRecords.map((routine) => (
                  <article key={routine.id} className="record-routine-row">
                    <div className="record-routine-head">
                      <strong>{routine.title}</strong>
                      <span>{routine.completed}/{routine.total}</span>
                    </div>
                    <div className="record-routine-track">
                      <div className="record-routine-fill" style={{ width: `${routine.percent}%` }} />
                    </div>
                    <p>{isKo ? `${routine.percent}% 달성` : `${routine.percent}% completed`}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
