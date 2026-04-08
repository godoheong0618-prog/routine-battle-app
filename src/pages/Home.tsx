import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BattleScoreCard from '../components/BattleScoreCard';
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
  ensureProfile,
  fetchFriendConnection,
  fetchRoutineLogsForUsers,
  filterSharedGoalsForPair,
  formatRoutineSchedule,
  getBattleActionHint,
  getDaysUntilWeekEnd,
  getFullWeekDateKeys,
  getTodayDayKey,
  getTodayKey,
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

type RoutineFeedbackState = Record<string, { id: number; status: Exclude<RoutineStatus, 'pending'> }>;

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
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [routineFeedback, setRoutineFeedback] = useState<RoutineFeedbackState>({});
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

  const weekStats = useMemo(
    () => calculateRoutineStats(routines, routineLogs, userId, getFullWeekDateKeys()),
    [routineLogs, routines, userId]
  );
  const completedCount = personalGoals.filter((goal) => goal.status === 'done').length;
  const remainingCount = personalGoals.filter((goal) => goal.status === 'pending').length;
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
  const battleStateLabel = !friendProfile
    ? isKo
      ? '친구 없음'
      : 'No friend'
    : battleSummary.weeklyPercentLeader === 'me'
      ? isKo
        ? '앞서는 중'
        : 'Leading'
      : battleSummary.weeklyPercentLeader === 'friend'
        ? isKo
          ? '뒤지는 중'
          : 'Behind'
        : isKo
          ? '동점'
          : 'Tied';
  const battleDaysLeft = getDaysUntilWeekEnd();
  const battleScoreTitle =
    !friendProfile || !hasBattleStarted
      ? isKo
        ? '배틀 준비가 필요해요'
        : 'Battle setup needed'
      : battleSummary.leader === 'me'
        ? isKo
          ? `${profileLabel} 리드`
          : `${profileLabel} leads`
        : battleSummary.leader === 'friend'
          ? isKo
            ? `${friendLabel} 리드`
            : `${friendLabel} leads`
          : isKo
            ? '동점 상황'
            : 'Tied battle';
  const battleActionHint = getBattleActionHint({
    difference: battleSummary.difference,
    hasFriend: Boolean(friendProfile),
    locale,
  });
  const todayHeroTitle = isKo
    ? `오늘 ${completedCount}/${personalGoals.length} 완료`
    : `Today ${completedCount}/${personalGoals.length} done`;
  const todayHeroCopy = !friendProfile
    ? isKo
      ? '친구를 연결하면 배틀 상태가 여기서 바로 보여요.'
      : 'Connect a friend to see battle status here.'
    : hasBattleStarted
      ? isKo
        ? `${profileLabel} ${battleSummary.myWeeklyPercent}% · ${friendLabel} ${battleSummary.friendWeeklyPercent}%`
        : `${profileLabel} ${battleSummary.myWeeklyPercent}% · ${friendLabel} ${battleSummary.friendWeeklyPercent}%`
      : isKo
        ? `${friendLabel}와 연결됨 · 배틀 설정 전`
        : `Connected with ${friendLabel} · setup needed`;
  const statusLabels: Record<RoutineStatus, string> = {
    pending: isKo ? '대기' : 'Pending',
    done: isKo ? '완료' : 'Done',
    partial: isKo ? '부분 완료' : 'Partial',
    rest: isKo ? '쉬는 날' : 'Rest',
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

  const triggerRoutineFeedback = (routineId: string, status: Exclude<RoutineStatus, 'pending'>) => {
    const feedbackId = Date.now();

    setRoutineFeedback((current) => ({
      ...current,
      [routineId]: { id: feedbackId, status },
    }));

    window.setTimeout(() => {
      setRoutineFeedback((current) => {
        if (current[routineId]?.id !== feedbackId) {
          return current;
        }

        const next = { ...current };
        delete next[routineId];
        return next;
      });
    }, status === 'done' ? 720 : 460);
  };

  const getRoutineFeedbackLabel = (status: Exclude<RoutineStatus, 'pending'>) => {
    if (status === 'done') {
      return '+2';
    }

    if (status === 'partial') {
      return '+1';
    }

    return isKo ? '쉼' : 'Rest';
  };

  const getRoutineCardClassName = (goal: PersonalGoalView) => {
    const baseClass =
      goal.status === 'done'
        ? 'home-task-card home-task-card-compact home-task-card-completed'
        : `home-task-card home-task-card-compact home-task-card-${goal.status}`;
    const feedback = routineFeedback[goal.id];

    return feedback ? `${baseClass} routine-feedback routine-feedback-${feedback.status}` : baseClass;
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
    options: { toggleSame?: boolean; silentFeedback?: boolean } = {}
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

    if (nextStatus !== 'pending' && !options.silentFeedback) {
      triggerRoutineFeedback(routineKey, nextStatus);
    }

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

    await handleSetRoutineStatus(goal.id, goal.status, { toggleSame: false, silentFeedback: true });
  };

  const toggleNote = (routineId: string) => {
    setExpandedNotes((current) => ({
      ...current,
      [routineId]: !current[routineId],
    }));
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

          <BattleScoreCard
            className="home-battle-score-card"
            eyebrow={isKo ? '이번 주 배틀' : 'This week battle'}
            title={battleScoreTitle}
            myLabel={profileLabel}
            friendLabel={friendLabel}
            myScore={battleSummary.myScore}
            friendScore={battleSummary.friendScore}
            leader={battleSummary.leader}
            daysLeft={hasBattleStarted ? battleDaysLeft : null}
            actionHint={battleActionHint}
            hasFriend={Boolean(friendProfile)}
            hasBattleStarted={hasBattleStarted}
            emptyTitle={!friendProfile ? (isKo ? '친구를 연결하면 배틀이 시작돼요' : 'Connect a friend to start') : battleSetupTitle}
            emptyBody={
              !friendProfile
                ? isKo
                  ? '앱을 열자마자 점수와 리드를 볼 수 있어요.'
                  : 'You will see scores and the current lead here.'
                : battleSetupBody
            }
            setupHref="/friends"
            setupLabel={!friendProfile ? (isKo ? '친구 연결하기' : 'Connect friend') : battleSetupAction}
            ctaHref="/battle"
            ctaLabel={isKo ? '배틀 보기' : 'View battle'}
          />
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
                    className={getRoutineCardClassName(goal)}
                  >
                    {routineFeedback[goal.id] && (
                      <span
                        key={routineFeedback[goal.id].id}
                        className={`routine-feedback-burst routine-feedback-burst-${routineFeedback[goal.id].status}`}
                      >
                        {getRoutineFeedbackLabel(routineFeedback[goal.id].status)}
                      </span>
                    )}
                    <div className="home-task-main">
                      <div className="home-task-top">
                        <div className="goal-copy">
                          <h3>{goal.title}</h3>
                          <div className="routine-chip-row">
                            <span>{formatRoutineSchedule(goal)}</span>
                            {goal.reminder_time && <span>{goal.reminder_time.slice(0, 5)}</span>}
                            <span>{goal.category === 'battle' ? (isKo ? '배틀' : 'Battle') : (isKo ? '개인' : 'Personal')}</span>
                          </div>
                          <p>{isKo ? `현재 상태: ${statusLabels[goal.status]}` : `Status: ${statusLabels[goal.status]}`}</p>
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
                              className="task-menu-item"
                              type="button"
                              onClick={() => handleSetRoutineStatus(goal.id, 'pending', { toggleSame: false })}
                              disabled={pendingAction === `routine-${goal.id}`}
                            >
                              {isKo ? '상태 초기화' : 'Reset status'}
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

                      <div className="routine-note-toggle-row">
                        <button
                          className="routine-note-toggle"
                          type="button"
                          onClick={() => toggleNote(goal.id)}
                        >
                          {expandedNotes[goal.id]
                            ? isKo
                              ? '메모 접기'
                              : 'Hide note'
                            : goal.note
                              ? isKo
                                ? '메모 보기'
                                : 'View note'
                              : isKo
                                ? '메모 추가'
                                : 'Add note'}
                        </button>
                      </div>

                      {expandedNotes[goal.id] && (
                        <label className="routine-note-field" htmlFor={`routine-note-${goal.id}`}>
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
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="home-week-mini-card">
            <div>
              <span>{isKo ? '이번 주' : 'This week'}</span>
              <strong>{weekStats.percent}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${weekStats.percent}%` }} />
            </div>
            <div className="traffic-row" aria-label={isKo ? '이번 주 상태' : 'This week status'}>
              {weekStats.daily.map((day) => (
                <span
                  key={day.dateKey}
                  className={`traffic-cell traffic-cell-${day.status}`}
                  title={`${day.dateKey} ${day.percent}%`}
                />
              ))}
            </div>
            <Link to="/stats">{isKo ? '자세히' : 'Details'}</Link>
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
