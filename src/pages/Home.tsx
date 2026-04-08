import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import RoutineEditorSheet from '../components/RoutineEditorSheet';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatOpponentLabel,
  formatOpponentSubject,
  formatSelfLabel,
  formatSelfSubject,
  normalizeDisplayName,
} from '../lib/nameDisplay';
import {
  FriendshipRow,
  ProfileRow,
  RoutineLogRow,
  RoutineRow,
  RoutineStatus,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  calculateRoutineStats,
  calculateStreak,
  ensureProfile,
  fetchFriendConnection,
  fetchRoutineLogsForUsers,
  filterSharedGoalsForPair,
  formatRoutineSchedule,
  getLastDateKeys,
  getTodayDayKey,
  getTodayKey,
  getWeekDateKeys,
  getWeekEndKey,
  isRoutineVisibleToday,
  normalizeRoutineStatus,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type PersonalGoalView = RoutineRow & {
  status: RoutineStatus;
  note: string;
  meta: string;
};

type ToastState = {
  id: number;
  message: string;
};

function getBattleHeadline({
  hasFriend,
  leader,
  myLeadName,
  opponentLeadName,
  difference,
  t,
}: {
  hasFriend: boolean;
  leader: 'me' | 'friend' | 'tied' | 'waiting';
  myLeadName: string;
  opponentLeadName: string;
  difference: number;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  if (!hasFriend || leader === 'waiting') {
    return '';
  }

  if (leader === 'tied') {
    return t('home.battleBarTiedTitle');
  }

  if (leader === 'me') {
    return t('home.battleBarLeadMe', {
      name: myLeadName,
      points: Math.abs(difference),
    });
  }

  return t('home.battleBarLeadFriend', {
    name: opponentLeadName,
    points: Math.abs(difference),
  });
}

export default function Home() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [battleMeta, setBattleMeta] = useState<FriendshipRow | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [friendRoutines, setFriendRoutines] = useState<RoutineRow[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineLogRow[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [routineSheetOpen, setRoutineSheetOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineRow | null>(null);
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  const todayKey = useMemo(() => getTodayKey(), []);
  const todayDayKey = useMemo(() => getTodayDayKey(), []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    let active = true;

    const loadHome = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate('/login');
        return;
      }

      setUserId(user.id);

      let currentProfile: ProfileRow | null = null;
      let currentFriend: ProfileRow | null = null;
      let loadNotice = '';

      try {
        const ensuredProfile = await ensureProfile(user);
        const connection = await fetchFriendConnection(ensuredProfile);

        currentProfile = connection.profile;
        currentFriend = connection.friendProfile;

        if (!active) {
          return;
        }

        setProfile(connection.profile);
        setFriendProfile(connection.friendProfile);
        setBattleMeta(connection.friendship);
      } catch (loadError) {
        console.warn('Home profile load failed:', loadError);
        loadNotice = t('home.loadProfileError');

        if (!active) {
          return;
        }

        setProfile({
          id: user.id,
          nickname: null,
          friend_code: null,
          friend_id: null,
        });
        setFriendProfile(null);
        setBattleMeta(null);
      }

      const relatedUserIds = currentFriend ? [user.id, currentFriend.id] : [user.id];

      try {
        const { data, error } = await supabase.from('routines').select('*').in('user_id', relatedUserIds);

        if (error) {
          throw error;
        }

        const loadedRoutines = ((data as RoutineRow[]) ?? []).filter((routine) => !routine.is_template);

        if (active) {
          setRoutines(loadedRoutines.filter((routine) => routine.user_id === user.id));
          setFriendRoutines(currentFriend ? loadedRoutines.filter((routine) => routine.user_id === currentFriend.id) : []);
        }
      } catch (loadError) {
        console.warn('Home routines load failed:', loadError);
        loadNotice = loadNotice || t('home.loadTasksError');

        if (active) {
          setRoutines([]);
          setFriendRoutines([]);
        }
      }

      try {
        const data = await fetchRoutineLogsForUsers(relatedUserIds);

        if (active) {
          setRoutineLogs(data);
        }
      } catch (loadError) {
        console.warn('Home routine logs load failed:', loadError);
        loadNotice = loadNotice || t('home.loadHistoryError');

        if (active) {
          setRoutineLogs([]);
        }
      }

      if (currentFriend) {
        try {
          const { data, error } = await supabase
            .from('shared_goals')
            .select('*')
            .or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`)
            .order('created_at', { ascending: false });

          if (error) {
            throw error;
          }

          const filteredGoals = filterSharedGoalsForPair((data as SharedGoalRow[]) ?? [], user.id, currentFriend.id);

          if (active) {
            setSharedGoals(filteredGoals);
          }

          if (filteredGoals.length > 0) {
            const goalIds = filteredGoals.map((goal) => goal.id);
            const { data: sharedCheckins, error: sharedCheckinsError } = await supabase
              .from('shared_goal_checkins')
              .select('goal_id, user_id, check_date')
              .in('goal_id', goalIds)
              .in('user_id', relatedUserIds);

            if (sharedCheckinsError) {
              throw sharedCheckinsError;
            }

            if (active) {
              setSharedGoalCheckins((sharedCheckins as SharedGoalCheckinRow[]) ?? []);
            }
          } else if (active) {
            setSharedGoalCheckins([]);
          }
        } catch (loadError) {
          console.warn('Home shared goals load failed:', loadError);
          loadNotice = loadNotice || t('home.loadBattleError');

          if (active) {
            setSharedGoals([]);
            setSharedGoalCheckins([]);
          }
        }
      } else if (active) {
        setSharedGoals([]);
        setSharedGoalCheckins([]);
      }

      if (!active) {
        return;
      }

      if (loadNotice) {
        setToast({ id: Date.now(), message: loadNotice });
      }

      setLoading(false);
    };

    loadHome();

    return () => {
      active = false;
    };
  }, [navigate, t]);

  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: t('common.me') });
  const friendLabel = formatOpponentLabel(friendProfile?.nickname, { locale });
  const profileSubject = formatSelfSubject(profile?.nickname, { locale });
  const friendSubject = formatOpponentSubject(friendProfile?.nickname, { locale });
  const profileInitial = normalizeDisplayName(profile?.nickname).slice(0, 1).toUpperCase() || 'MY';

  const todayRoutines = useMemo(
    () => routines.filter((routine) => isRoutineVisibleToday(routine, todayDayKey)),
    [routines, todayDayKey]
  );

  const myRoutineLogs = useMemo(
    () => routineLogs.filter((log) => log.user_id === userId),
    [routineLogs, userId]
  );

  const todayLogByRoutineId = useMemo(() => {
    return new Map(
      myRoutineLogs
        .filter((log) => log.log_date === todayKey)
        .map((log) => [String(log.routine_id), log])
    );
  }, [myRoutineLogs, todayKey]);

  const personalGoals = useMemo<PersonalGoalView[]>(() => {
    return todayRoutines.map((routine) => {
      const log = todayLogByRoutineId.get(String(routine.id));
      const scheduleText = formatRoutineSchedule(routine);
      const targetText = t('home.goalMeta', { count: routine.target_count ?? 1 });

      return {
        ...routine,
        status: log ? normalizeRoutineStatus(log.status) : 'pending',
        note: log?.note ?? '',
        meta: routine.description || `${scheduleText} · ${targetText}`,
      };
    });
  }, [t, todayLogByRoutineId, todayRoutines]);

  const battleSummary = useMemo(() => {
    return calculateBattleScores({
      currentUserId: userId,
      friendId: friendProfile?.id ?? null,
      checkins: routineLogs,
      sharedGoalCheckins,
      sharedGoals,
      routines: [...routines, ...friendRoutines],
    });
  }, [friendProfile?.id, friendRoutines, routineLogs, routines, sharedGoalCheckins, sharedGoals, userId]);

  const streak = useMemo(() => calculateStreak(myRoutineLogs), [myRoutineLogs]);
  const weekStats = useMemo(
    () => calculateRoutineStats(routines, routineLogs, userId, getWeekDateKeys()),
    [routineLogs, routines, userId]
  );
  const friendWeekStats = useMemo(
    () =>
      friendProfile
        ? calculateRoutineStats(friendRoutines, routineLogs, friendProfile.id, getWeekDateKeys())
        : null,
    [friendProfile, friendRoutines, routineLogs]
  );
  const recentSevenStats = useMemo(
    () => calculateRoutineStats(routines, routineLogs, userId, getLastDateKeys(7)),
    [routineLogs, routines, userId]
  );
  const todayStats = useMemo(
    () => calculateRoutineStats(routines, routineLogs, userId, [todayKey]),
    [routineLogs, routines, todayKey, userId]
  );
  const completedCount = personalGoals.filter((goal) => goal.status === 'done').length;
  const remainingCount = personalGoals.filter((goal) => goal.status === 'pending').length;
  const progress = todayStats.percent;
  const hasBattleStarted = Boolean(friendProfile && battleMeta?.battle_started_at);

  const battleHeadline = getBattleHeadline({
    hasFriend: Boolean(friendProfile),
    leader: battleSummary.leader,
    myLeadName: profileSubject,
    opponentLeadName: friendSubject,
    difference: battleSummary.difference,
    t,
  });

  const battleDifferenceText = !friendProfile
    ? t('home.battleWaiting')
    : battleSummary.leader === 'tied'
      ? t('home.battleTied')
      : t('home.battleDifference', { points: Math.abs(battleSummary.difference) });

  const battleScoreLine = friendProfile
    ? `${t('home.battleBarScoreLine', {
        me: profileLabel,
        myScore: battleSummary.myScore,
        friend: friendLabel,
        friendScore: battleSummary.friendScore,
      })} · ${profileLabel} ${battleSummary.myWeeklyPercent}% / ${friendLabel} ${battleSummary.friendWeeklyPercent}%`
    : '';

  const battleWagerText = battleMeta?.wager_text?.trim()
    ? t('home.battleBarWager', { text: battleMeta.wager_text.trim() })
    : t('home.battleBarNoWager');

  const battleSetupTitle = isKo ? '배틀 설정을 저장하면 이번 주 요약이 바로 보여요' : 'Save battle setup to unlock the weekly summary';
  const battleSetupBody = isKo
    ? `${friendLabel}와 연결되었어요. 친구 탭에서 배틀 이름과 내기를 정하면 홈 상단에 바로 반영돼요.`
    : `You are connected with ${friendLabel}. Add a battle name and wager in Friends to show the summary here.`;
  const battleSetupAction = isKo ? '배틀 설정하기' : 'Set up battle';
  const scoreSuffix = isKo ? '점' : 'pts';
  const weekEndDate = useMemo(() => new Date(`${getWeekEndKey()}T12:00:00`), []);
  const battleDaysLeft = Math.max(
    Math.ceil((weekEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
    0
  );
  const weekPercentLabel = isKo ? '이번 주 달성률' : 'Weekly achievement';
  const weekSummaryTitle = isKo ? `${weekStats.percent}% 달성 중` : `${weekStats.percent}% this week`;
  const todayHeroTitle = isKo
    ? `오늘 ${completedCount}/${personalGoals.length} 완료`
    : `Today ${completedCount}/${personalGoals.length} done`;
  const todayHeroCopy = !friendProfile
    ? isKo
      ? '친구를 연결하면 배틀 상태가 여기서 바로 보여요.'
      : 'Connect a friend to see battle status here.'
    : hasBattleStarted
      ? isKo
        ? `이번 주 배틀 종료까지 ${battleDaysLeft}일 남았어요.`
        : `${battleDaysLeft} days left in this week battle.`
      : isKo
        ? `${friendLabel}와 연결됨 · 배틀 설정 전`
        : `Connected with ${friendLabel} · setup needed`;
  const weekSummarySubtitle =
    personalGoals.length === 0
      ? t('home.summaryEmpty')
      : isKo
        ? `오늘 ${progress}% · 현재 ${streak}일 연속`
        : `Today ${progress}% · ${streak}-day streak`;
  const friendWeekLabel = friendWeekStats
    ? isKo
      ? `${friendLabel} ${friendWeekStats.percent}%`
      : `${friendLabel} ${friendWeekStats.percent}%`
    : t('home.battleWaiting');
  const statusLabels: Record<RoutineStatus, string> = {
    pending: isKo ? '대기' : 'Pending',
    done: isKo ? '완료' : 'Done',
    partial: isKo ? '조금 함' : 'Partial',
    rest: isKo ? '오늘 쉼' : 'Rest',
  };

  const showToast = (message: string) => {
    setToast({ id: Date.now(), message });
  };

  const openCreateSheet = () => {
    setEditingRoutine(null);
    setRoutineSheetOpen(true);
  };

  const openEditSheet = (routine: RoutineRow) => {
    setEditingRoutine(routine);
    setRoutineSheetOpen(true);
  };

  const handleRoutineSaved = (routine: RoutineRow) => {
    setRoutines((current) => {
      const exists = current.some((item) => item.id === routine.id);
      return exists ? current.map((item) => (item.id === routine.id ? routine : item)) : [routine, ...current];
    });
    showToast(isKo ? '루틴을 저장했어요.' : 'Routine saved.');
  };

  const handleCyclePriority = async (routine: RoutineRow) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const nextPriority =
      routine.important && routine.urgent
        ? { important: true, urgent: false }
        : routine.important
          ? { important: false, urgent: true }
          : routine.urgent
            ? { important: false, urgent: false }
            : { important: true, urgent: true };

    setPendingAction(`priority-${routine.id}`);

    const { data, error } = await supabase
      .from('routines')
      .update(nextPriority)
      .eq('id', routine.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      console.warn('Routine priority save failed:', error);
      showToast(isKo ? '우선순위를 저장하지 못했어요.' : 'Could not save priority.');
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.map((item) => (item.id === routine.id ? (data as RoutineRow) : item)));
    setPendingAction('');
  };

  const handleSetRoutineStatus = async (
    routineId: string,
    status: RoutineStatus,
    options: { toggleSame?: boolean } = {}
  ) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const routineKey = String(routineId);
    const actionKey = `routine-${routineId}`;
    const existingLog = todayLogByRoutineId.get(routineKey);
    const shouldToggleSame = options.toggleSame ?? true;
    const nextStatus =
      shouldToggleSame && existingLog && normalizeRoutineStatus(existingLog.status) === status ? 'pending' : status;
    const nextNote = (noteDrafts[routineKey] ?? existingLog?.note ?? '').trim();
    const optimisticLog: RoutineLogRow = {
      user_id: userId,
      routine_id: routineId,
      log_date: todayKey,
      status: nextStatus,
      note: nextNote || null,
    };
    const previousLogs = routineLogs;

    setPendingAction(actionKey);
    setRoutineLogs((current) => {
      const exists = current.some(
        (log) => log.user_id === userId && String(log.routine_id) === routineKey && log.log_date === todayKey
      );

      if (exists) {
        return current.map((log) =>
          log.user_id === userId && String(log.routine_id) === routineKey && log.log_date === todayKey
            ? { ...log, ...optimisticLog }
            : log
        );
      }

      return [...current, optimisticLog];
    });

    const { error: saveError } = await supabase.from('routine_logs').upsert(optimisticLog, {
      onConflict: 'user_id,routine_id,log_date',
      ignoreDuplicates: false,
    });

    if (saveError) {
      console.warn('Routine log save failed:', saveError);
      setRoutineLogs(previousLogs);
      showToast(
        saveError.code === '42P01' || saveError.code === '42703'
          ? isKo
            ? 'routine_logs SQL을 먼저 적용해 주세요.'
            : 'Apply the routine_logs SQL first.'
          : t('home.saveError')
      );
      setPendingAction('');
      return;
    }

    setPendingAction('');
  };

  const handleNoteBlur = async (goal: PersonalGoalView) => {
    const routineKey = String(goal.id);
    const nextNote = (noteDrafts[routineKey] ?? goal.note).trim();

    if (nextNote === goal.note.trim()) {
      return;
    }

    await handleSetRoutineStatus(goal.id, goal.status, { toggleSame: false });
  };

  const handleDeleteRoutine = async (routineId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const confirmed = window.confirm(t('home.deleteConfirm'));

    if (!confirmed) {
      return;
    }

    setPendingAction(`delete-${routineId}`);

    const { error: logDeleteError } = await supabase
      .from('routine_logs')
      .delete()
      .eq('user_id', userId)
      .eq('routine_id', routineId);

    if (logDeleteError && logDeleteError.code !== '42P01' && logDeleteError.code !== '42703') {
      console.warn('Routine logs delete failed:', logDeleteError);
    }

    const { error: routineDeleteError } = await supabase
      .from('routines')
      .delete()
      .eq('id', routineId)
      .eq('user_id', userId);

    if (routineDeleteError) {
      console.warn('Routine delete failed:', routineDeleteError);
      showToast(t('home.deleteError'));
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    setRoutineLogs((current) =>
      current.filter((log) => !(log.user_id === userId && String(log.routine_id) === String(routineId)))
    );
    showToast(t('home.deleteSuccess'));
    setPendingAction('');
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen home-screen">
          <div className="home-loading-shell">
            <div className="home-skeleton home-skeleton-hero" />
            <div className="home-skeleton home-skeleton-card" />
            <div className="home-skeleton home-skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen home-screen">
        <header className="home-top-card home-summary-card">
          <div className="hero-top-row">
            <div>
              <p className="section-eyebrow">{isKo ? '루틴 배틀' : 'Routine battle'}</p>
            </div>

            <Link className="home-bell-button home-profile-shortcut" to="/mypage" aria-label={t('home.myPageAria')}>
              {profileInitial}
            </Link>
          </div>

          <section className="today-hero-card">
            <div>
              <p className="section-eyebrow">{isKo ? 'Today' : 'Today'}</p>
              <h1>{todayHeroTitle}</h1>
              <p>{todayHeroCopy}</p>
            </div>
            <div className="today-hero-metrics">
              <article>
                <span>{isKo ? '해야 할 루틴' : 'Due'}</span>
                <strong>{personalGoals.length}</strong>
              </article>
              <article>
                <span>{isKo ? '완료' : 'Done'}</span>
                <strong>{completedCount}</strong>
              </article>
              <article>
                <span>{isKo ? '주간률' : 'Week'}</span>
                <strong>{weekStats.percent}%</strong>
              </article>
            </div>
          </section>

          <article
            className={
              hasBattleStarted
                ? battleSummary.leader === 'me'
                  ? 'battle-summary-bar battle-summary-bar-leading'
                  : battleSummary.leader === 'friend'
                    ? 'battle-summary-bar battle-summary-bar-trailing'
                    : 'battle-summary-bar battle-summary-bar-tied'
                : 'battle-summary-bar'
            }
          >
            {!friendProfile ? (
              <div className="battle-summary-bar-empty">
                <div>
                  <p className="section-eyebrow">{t('home.battleBarEyebrow')}</p>
                  <h3 className="battle-summary-bar-title">{t('home.battleBarNoFriendTitle')}</h3>
                  <p className="battle-summary-bar-copy">{t('home.battleBarNoFriendBody')}</p>
                </div>

                <Link className="inline-action-link inline-action-link-light" to="/friends">
                  {t('home.battleBarConnect')}
                </Link>
              </div>
            ) : !hasBattleStarted ? (
              <div className="battle-summary-bar-empty">
                <div>
                  <p className="section-eyebrow">{t('home.battleBarEyebrow')}</p>
                  <h3 className="battle-summary-bar-title">{battleSetupTitle}</h3>
                  <p className="battle-summary-bar-copy">{battleSetupBody}</p>
                </div>

                <Link className="inline-action-link inline-action-link-light" to="/friends">
                  {battleSetupAction}
                </Link>
              </div>
            ) : (
              <>
                <div className="battle-summary-bar-top">
                  <div>
                    <p className="section-eyebrow">{t('home.battleBarEyebrow')}</p>
                    <h3 className="battle-summary-bar-title">{battleHeadline}</h3>
                    <p className="battle-summary-bar-copy">{battleScoreLine}</p>
                  </div>

                  <Link className="inline-action-link inline-action-link-light" to="/battle">
                    {t('home.battleBarCta')}
                  </Link>
                </div>

                <div className="battle-summary-bar-score-grid">
                  <article className="battle-summary-score">
                    <span>{profileLabel}</span>
                    <strong>{`${battleSummary.myScore}${scoreSuffix}`}</strong>
                  </article>
                  <article className="battle-summary-score">
                    <span>{friendLabel}</span>
                    <strong>{`${battleSummary.friendScore}${scoreSuffix}`}</strong>
                  </article>
                </div>

                <div className="battle-summary-bar-meta">
                  <span className="battle-meta-pill">{battleDifferenceText}</span>
                  <span className="battle-meta-pill">{battleWagerText}</span>
                </div>
              </>
            )}
          </article>

          <div className="home-progress-section">
            <p className="section-eyebrow">{weekPercentLabel}</p>
            <h1 className="home-streak-title">{weekSummaryTitle}</h1>
            <p className="hero-subtitle">{weekSummarySubtitle}</p>
          </div>

          <div className="progress-card progress-card-soft">
            <div className="progress-card-header">
              <span>{weekPercentLabel}</span>
              <strong>{weekStats.percent}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${weekStats.percent}%` }} />
            </div>
            <div className="traffic-row" aria-label={isKo ? '최근 7일 상태' : 'Last 7 days'}>
              {recentSevenStats.daily.map((day) => (
                <span
                  key={day.dateKey}
                  className={`traffic-cell traffic-cell-${day.status}`}
                  title={`${day.dateKey} ${day.percent}%`}
                />
              ))}
            </div>
          </div>

          <div className="summary-chip-row">
            <article className="summary-chip">
              <span>{t('home.streakLabel')}</span>
              <strong>{t('home.streakValue', { count: streak })}</strong>
            </article>
            <article className="summary-chip">
              <span>{isKo ? '오늘 남은 할 일' : t('home.leftLabel')}</span>
              <strong>{t('home.leftValue', { count: remainingCount })}</strong>
            </article>
            <article className="summary-chip">
              <span>{isKo ? '친구 주간률' : 'Friend week'}</span>
              <strong>{friendWeekLabel}</strong>
            </article>
          </div>
        </header>

        <main className="home-content home-content-polished">
          <section className="home-section home-section-first">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('home.tasksTitle')}</h2>
                <p className="section-description">
                  {personalGoals.length === 0
                    ? t('home.tasksDescriptionEmpty')
                    : remainingCount === 0
                      ? t('home.tasksDescriptionDone')
                      : t('home.tasksDescriptionRemaining', { count: remainingCount })}
                </p>
              </div>
              <button className="text-button" type="button" onClick={openCreateSheet}>
                {t('home.add')}
              </button>
            </div>

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>{t('home.tasksEmptyTitle')}</h3>
                <p>{t('home.tasksEmptyBody')}</p>
                <button className="inline-action-link" type="button" onClick={openCreateSheet}>
                  {t('home.addRoutine')}
                </button>
              </article>
            ) : (
              <div className="today-task-list">
                {personalGoals.map((goal) => (
                  <article
                    key={goal.id}
                    className={
                      goal.status === 'done'
                        ? 'home-task-card home-task-card-completed'
                        : `home-task-card home-task-card-${goal.status}`
                    }
                  >
                    <div
                      className={
                        goal.status === 'done'
                          ? 'goal-check goal-check-completed'
                          : `goal-check goal-check-${goal.status}`
                      }
                    >
                      {goal.status === 'done' ? '✓' : statusLabels[goal.status].slice(0, 1)}
                    </div>

                    <div className="home-task-main">
                      <div className="home-task-top">
                        <div className="goal-copy">
                          <h3>{goal.title}</h3>
                          <p>{goal.meta}</p>
                        </div>

                        <details className="task-menu task-menu-floating">
                          <summary className="task-menu-trigger" aria-label={t('home.menuAria', { title: goal.title })}>
                            <span />
                            <span />
                            <span />
                          </summary>

                          <div className="task-menu-popover">
                            <button className="task-menu-item" type="button" onClick={() => openEditSheet(goal)}>
                              {t('home.edit')}
                            </button>
                            <button
                              className="task-menu-item"
                              type="button"
                              onClick={() => handleCyclePriority(goal)}
                              disabled={pendingAction === `priority-${goal.id}`}
                            >
                              {isKo ? '우선순위 변경' : 'Change priority'}
                            </button>
                            <button
                              className="task-menu-item task-menu-item-danger"
                              type="button"
                              onClick={() => handleDeleteRoutine(goal.id)}
                              disabled={pendingAction === `delete-${goal.id}`}
                            >
                              {pendingAction === `delete-${goal.id}` ? t('home.deleting') : t('home.delete')}
                            </button>
                          </div>
                        </details>
                      </div>

                      <div className="home-task-actions">
                        {(['done', 'partial', 'rest'] as RoutineStatus[]).map((status) => (
                          <button
                            key={status}
                            className={
                              goal.status === status
                                ? `routine-status-button routine-status-button-${status} routine-status-button-active`
                                : `routine-status-button routine-status-button-${status}`
                            }
                            type="button"
                            onClick={() => handleSetRoutineStatus(goal.id, status)}
                            disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                          >
                            {pendingAction === `routine-${goal.id}` ? t('home.saving') : statusLabels[status]}
                          </button>
                        ))}
                      </div>

                      <label className="routine-note-field" htmlFor={`routine-note-${goal.id}`}>
                        <span>{isKo ? '메모' : 'Note'}</span>
                        <input
                          id={`routine-note-${goal.id}`}
                          type="text"
                          placeholder={isKo ? '짧은 메모를 남겨요' : 'Add a short note'}
                          value={noteDrafts[goal.id] ?? goal.note}
                          onChange={(event) =>
                            setNoteDrafts((current) => ({
                              ...current,
                              [goal.id]: event.target.value,
                            }))
                          }
                          onBlur={() => handleNoteBlur(goal)}
                          disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                          maxLength={80}
                        />
                      </label>

                      <div className="routine-card-footer">
                        <span>{isKo ? `상태: ${statusLabels[goal.status]}` : `Status: ${statusLabels[goal.status]}`}</span>
                        <button
                          className="secondary-button home-task-button"
                          type="button"
                          onClick={() => handleSetRoutineStatus(goal.id, 'pending', { toggleSame: false })}
                          disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                        >
                          {pendingAction === `routine-${goal.id}` ? t('home.saving') : t('home.undo')}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <button className="fab-button fab-button-extended" type="button" onClick={openCreateSheet} aria-label={t('home.addRoutine')}>
          + {t('home.addRoutine')}
        </button>

        {toast && (
          <div className="home-toast" role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        {routineSheetOpen && (
          <RoutineEditorSheet
            initialRoutine={editingRoutine}
            onClose={() => setRoutineSheetOpen(false)}
            onSaved={handleRoutineSaved}
          />
        )}

        <BottomTabBar />
      </div>
    </div>
  );
}
