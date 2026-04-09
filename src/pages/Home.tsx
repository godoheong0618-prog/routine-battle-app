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

function formatScreenDate(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

function formatRoutineTime(reminderTime: string | null, locale: string) {
  if (!reminderTime) {
    return '';
  }

  const [hourText = '0', minuteText = '0'] = reminderTime.split(':');
  const date = new Date();
  date.setHours(Number(hourText), Number(minuteText), 0, 0);

  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
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
  const screenLocale = isKo ? 'ko-KR' : 'en-US';

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

      let currentFriend: ProfileRow | null = null;
      let loadNotice = '';

      try {
        const ensuredProfile = await ensureProfile(user);
        const connection = await fetchFriendConnection(ensuredProfile);

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
          setFriendRoutines(
            currentFriend ? loadedRoutines.filter((routine) => routine.user_id === currentFriend.id) : []
          );
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

  const streak = useMemo(() => calculateStreak(myRoutineLogs), [myRoutineLogs]);
  const todayLabel = useMemo(() => formatScreenDate(screenLocale), [screenLocale]);

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

      return {
        ...routine,
        status: log ? normalizeRoutineStatus(log.status) : 'pending',
        note: log?.note ?? '',
      };
    });
  }, [todayLogByRoutineId, todayRoutines]);

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
    ? isKo
      ? '친구 연결 전'
      : 'Connect friend first'
    : battleSummary.leader === 'tied'
      ? isKo
        ? '지금은 동점이에요'
        : 'You are tied right now'
      : isKo
        ? `${Math.abs(battleSummary.difference)}점 차이`
        : `${Math.abs(battleSummary.difference)} pts apart`;

  const battleTeaserHref = !friendProfile || !hasBattleStarted ? '/friends' : '/battle';
  const battleTeaserTitle = !friendProfile
    ? isKo
      ? '친구를 연결하면 배틀이 열려요'
      : 'Connect a friend to open the battle'
    : !hasBattleStarted
      ? isKo
        ? '배틀 정보를 먼저 정리해 주세요'
        : 'Add battle details first'
      : battleHeadline || battleDifferenceText;
  const battleTeaserBody = !friendProfile
    ? isKo
      ? '배틀 탭에서 서로의 진행률과 최근 활동을 비교할 수 있어요.'
      : 'Compare progress and recent activity once a friend is connected.'
    : !hasBattleStarted
      ? isKo
        ? `${friendLabel}님과 연결됨`
        : `Connected with ${friendLabel}`
      : `${profileLabel} ${battleSummary.myScore} : ${battleSummary.friendScore} ${friendLabel}`;

  const statusLabels: Record<RoutineStatus, string> = {
    pending: isKo ? '대기' : 'Pending',
    done: isKo ? '완료' : 'Done',
    partial: isKo ? '부분 완료' : 'Partial',
    rest: isKo ? '쉼' : 'Rest',
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

    const confirmed = window.confirm(isKo ? '이 루틴을 삭제할까요?' : 'Delete this routine?');

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
      showToast(isKo ? '루틴을 삭제하지 못했어요.' : 'Could not delete the routine.');
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    setRoutineLogs((current) =>
      current.filter((log) => !(log.user_id === userId && String(log.routine_id) === String(routineId)))
    );
    showToast(isKo ? '루틴을 삭제했어요.' : 'Routine deleted.');
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
        <header className="home-top-card home-polished-header">
          <div className="home-header-row">
            <div>
              <p className="home-date-label">{todayLabel}</p>
              <h1 className="home-polished-title">{isKo ? '오늘의 루틴' : 'Today routines'}</h1>
            </div>

            <Link className="home-bell-button home-profile-shortcut" to="/mypage" aria-label={t('home.myPageAria')}>
              {profileInitial}
            </Link>
          </div>

          <div className="home-overview-row">
            <span className="home-streak-pill">
              {streak > 0 ? (isKo ? `${streak}일째` : `${streak}-day streak`) : isKo ? '오늘부터 시작' : 'Start today'}
            </span>
            <strong className="home-overview-count">
              {completedCount}
              <span> / {personalGoals.length}</span>
            </strong>
          </div>

          <Link className="home-battle-teaser" to={battleTeaserHref}>
            <span>{isKo ? '이번 주 배틀' : 'This week battle'}</span>
            <strong>{battleTeaserTitle}</strong>
            <small>{battleTeaserBody}</small>
          </Link>
        </header>

        <main className="home-content home-content-polished">
          <section className="home-section home-section-first">
            <div className="section-header section-header-stack">
              <div>
                <h2>{isKo ? '오늘의 할 일' : 'Today tasks'}</h2>
                <p className="section-description">
                  {personalGoals.length === 0
                    ? isKo
                      ? '루틴을 추가하면 이 화면에서 바로 체크할 수 있어요.'
                      : 'Add a routine to start from this screen right away.'
                    : remainingCount === 0
                      ? isKo
                        ? '오늘 계획한 루틴을 모두 끝냈어요.'
                        : 'You finished everything for today.'
                      : isKo
                        ? `${remainingCount}개의 루틴이 남아 있어요.`
                        : `${remainingCount} routines are still left.`}
                </p>
              </div>
              <button className="text-button" type="button" onClick={openCreateSheet}>
                {isKo ? '추가' : 'Add'}
              </button>
            </div>

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>{isKo ? '오늘 표시할 루틴이 없어요' : 'Nothing to show today'}</h3>
                <p>
                  {isKo
                    ? '반복 요일이나 시간을 정한 루틴을 추가하면 여기에 카드로 정리돼요.'
                    : 'Add a routine with repeat days or a reminder and it will appear here.'}
                </p>
                <button className="inline-action-link" type="button" onClick={openCreateSheet}>
                  {isKo ? '루틴 추가하기' : 'Add routine'}
                </button>
              </article>
            ) : (
              <div className="today-task-list">
                {personalGoals.map((goal) => {
                  const formattedTime = formatRoutineTime(goal.reminder_time, screenLocale);
                  const scheduleLabel = formatRoutineSchedule(goal);
                  const noteButtonLabel = expandedNotes[goal.id]
                    ? isKo
                      ? '메모 닫기'
                      : 'Hide note'
                    : goal.note
                      ? isKo
                        ? '메모 보기'
                        : 'View note'
                      : isKo
                        ? '메모 추가'
                        : 'Add note';

                  return (
                    <article key={goal.id} className={getRoutineCardClassName(goal)}>
                      {routineFeedback[goal.id] && (
                        <span
                          key={routineFeedback[goal.id].id}
                          className={`routine-feedback-burst routine-feedback-burst-${routineFeedback[goal.id].status}`}
                        >
                          {getRoutineFeedbackLabel(routineFeedback[goal.id].status)}
                        </span>
                      )}

                      <div className="home-task-row">
                        <button
                          className={goal.status === 'done' ? 'home-task-check home-task-check-done' : 'home-task-check'}
                          type="button"
                          onClick={() =>
                            handleSetRoutineStatus(goal.id, goal.status === 'done' ? 'pending' : 'done', {
                              toggleSame: false,
                            })
                          }
                          disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                          aria-label={goal.status === 'done' ? `${goal.title} undo` : `${goal.title} done`}
                        >
                          <span>{goal.status === 'done' ? '✓' : ''}</span>
                        </button>

                        <div className="home-task-main">
                          <div className="home-task-top">
                            <div className="home-task-copy">
                              <h3>{goal.title}</h3>
                              <p className="home-task-time">{formattedTime || scheduleLabel}</p>
                            </div>

                            <details className="task-menu task-menu-floating">
                              <summary className="task-menu-trigger" aria-label={t('home.menuAria', { title: goal.title })}>
                                <span />
                                <span />
                                <span />
                              </summary>

                              <div className="task-menu-popover">
                                <button className="task-menu-item" type="button" onClick={() => openEditSheet(goal)}>
                                  {isKo ? '수정' : 'Edit'}
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
                                  {pendingAction === `delete-${goal.id}`
                                    ? isKo
                                      ? '삭제 중...'
                                      : 'Deleting...'
                                    : isKo
                                      ? '삭제'
                                      : 'Delete'}
                                </button>
                              </div>
                            </details>
                          </div>

                          <div className="home-task-meta-row">
                            <span className={`home-task-status home-task-status-${goal.status}`}>
                              {statusLabels[goal.status]}
                            </span>

                            <div className="routine-chip-row">
                              {goal.reminder_time && <span>{scheduleLabel}</span>}
                              <span>{goal.category === 'battle' ? (isKo ? '배틀' : 'Battle') : isKo ? '개인' : 'Personal'}</span>
                            </div>
                          </div>

                          <div className="home-task-actions home-task-actions-compact">
                            {(['partial', 'rest'] as const).map((status) => (
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
                                {pendingAction === `routine-${goal.id}` ? (isKo ? '저장 중...' : 'Saving...') : statusLabels[status]}
                              </button>
                            ))}

                            <button
                              className={
                                expandedNotes[goal.id]
                                  ? 'routine-note-toggle routine-note-toggle-chip routine-note-toggle-active'
                                  : 'routine-note-toggle routine-note-toggle-chip'
                              }
                              type="button"
                              onClick={() => toggleNote(goal.id)}
                            >
                              {noteButtonLabel}
                            </button>
                          </div>

                          {expandedNotes[goal.id] && (
                            <label className="routine-note-field" htmlFor={`routine-note-${goal.id}`}>
                              <input
                                id={`routine-note-${goal.id}`}
                                type="text"
                                placeholder={isKo ? '짧은 메모를 남겨 보세요' : 'Add a short note'}
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
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="home-week-mini-card">
            <div className="home-card-heading">
              <div>
                <span>{isKo ? '이번 주 기록' : 'This week'}</span>
                <strong>{weekStats.percent}%</strong>
              </div>
              <Link to="/stats">{isKo ? '자세히' : 'Details'}</Link>
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
          </section>
        </main>

        <button
          className="fab-button fab-button-extended"
          type="button"
          onClick={openCreateSheet}
          aria-label={isKo ? '루틴 추가하기' : 'Add routine'}
        >
          + {isKo ? '루틴 추가' : 'Add routine'}
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
