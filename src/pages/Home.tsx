import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import RoutineEditorSheet from '../components/RoutineEditorSheet';
import { useLanguage } from '../i18n/LanguageContext';
import { formatOpponentLabel, formatSelfLabel, normalizeDisplayName } from '../lib/nameDisplay';
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
  isPositiveRoutineStatus,
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
type RoutinePeriodKey = 'morning' | 'afternoon' | 'evening' | 'flexible';
type SharedGoalPreview = SharedGoalRow & {
  myDoneToday: boolean;
  friendDoneToday: boolean;
  bothDoneToday: boolean;
};

const ROUTINE_PERIOD_ORDER: RoutinePeriodKey[] = ['morning', 'afternoon', 'evening', 'flexible'];

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRoutinePeriod(reminderTime: string | null): RoutinePeriodKey {
  if (!reminderTime) {
    return 'flexible';
  }

  const [hourText = '0'] = reminderTime.split(':');
  const hour = Number(hourText);

  if (hour < 12) {
    return 'morning';
  }

  if (hour < 18) {
    return 'afternoon';
  }

  return 'evening';
}

function compareRoutineTimes(first: PersonalGoalView, second: PersonalGoalView) {
  if (first.reminder_time && second.reminder_time) {
    return first.reminder_time.localeCompare(second.reminder_time);
  }

  if (first.reminder_time) {
    return -1;
  }

  if (second.reminder_time) {
    return 1;
  }

  return first.title.localeCompare(second.title);
}

function buildRoutineStreakMap(logs: RoutineLogRow[]) {
  const positiveLogs = logs.filter((log) => isPositiveRoutineStatus(log.status));
  const dateMap = new Map<string, Set<string>>();

  positiveLogs.forEach((log) => {
    const dates = dateMap.get(String(log.routine_id)) ?? new Set<string>();
    dates.add(log.log_date);
    dateMap.set(String(log.routine_id), dates);
  });

  const streakMap: Record<string, number> = {};

  dateMap.forEach((dates, routineId) => {
    const cursor = new Date();
    let streak = 0;

    while (dates.has(getDateKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    streakMap[routineId] = streak;
  });

  return streakMap;
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

function getWeekdayLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${dateKey}T12:00:00`));
}

function getDateNumberLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`));
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
        loadNotice = isKo ? '프로필을 불러오지 못했어요.' : 'Could not load your profile.';

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
        loadNotice = loadNotice || (isKo ? '루틴 목록을 불러오지 못했어요.' : 'Could not load routines.');

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
        loadNotice = loadNotice || (isKo ? '기록을 불러오지 못했어요.' : 'Could not load routine history.');

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
          loadNotice = loadNotice || (isKo ? '공동 목표를 불러오지 못했어요.' : 'Could not load shared goals.');

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
  }, [isKo, navigate]);

  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: isKo ? '나' : 'Me' });
  const friendLabel = formatOpponentLabel(friendProfile?.nickname, { locale });
  const profileInitial = normalizeDisplayName(profile?.nickname).slice(0, 1).toUpperCase() || 'M';

  const todayRoutines = useMemo(
    () => routines.filter((routine) => isRoutineVisibleToday(routine, todayDayKey)),
    [routines, todayDayKey]
  );

  const myRoutineLogs = useMemo(() => routineLogs.filter((log) => log.user_id === userId), [routineLogs, userId]);
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

  const routineStreakMap = useMemo(() => buildRoutineStreakMap(myRoutineLogs), [myRoutineLogs]);

  const groupedGoals = useMemo(() => {
    const periodLabels: Record<RoutinePeriodKey, string> = {
      morning: isKo ? '오전' : 'Morning',
      afternoon: isKo ? '오후' : 'Afternoon',
      evening: isKo ? '저녁' : 'Evening',
      flexible: isKo ? '시간 미정' : 'Flexible',
    };
    const goalMap = new Map<RoutinePeriodKey, PersonalGoalView[]>();

    ROUTINE_PERIOD_ORDER.forEach((period) => {
      goalMap.set(period, []);
    });

    personalGoals
      .slice()
      .sort(compareRoutineTimes)
      .forEach((goal) => {
        const period = getRoutinePeriod(goal.reminder_time);
        goalMap.get(period)?.push(goal);
      });

    return ROUTINE_PERIOD_ORDER.map((period) => ({
      key: period,
      label: periodLabels[period],
      items: goalMap.get(period) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [isKo, personalGoals]);

  const sharedGoalViews = useMemo<SharedGoalPreview[]>(() => {
    if (!friendProfile) {
      return [];
    }

    return sharedGoals.map((goal) => {
      const myDoneToday = sharedGoalCheckins.some(
        (checkin) => checkin.goal_id === goal.id && checkin.user_id === userId && checkin.check_date === todayKey
      );
      const friendDoneToday = sharedGoalCheckins.some(
        (checkin) =>
          checkin.goal_id === goal.id &&
          checkin.user_id === friendProfile.id &&
          checkin.check_date === todayKey
      );

      return {
        ...goal,
        myDoneToday,
        friendDoneToday,
        bothDoneToday: myDoneToday && friendDoneToday,
      };
    });
  }, [friendProfile, sharedGoalCheckins, sharedGoals, todayKey, userId]);

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
  const weekCheckedCount = weekStats.doneCount + weekStats.partialCount;
  const hasBattleStarted = Boolean(friendProfile && battleMeta?.battle_started_at);

  const myTodayCompletedCount = useMemo(
    () =>
      myRoutineLogs.filter(
        (log) =>
          log.log_date === todayKey &&
          (normalizeRoutineStatus(log.status) === 'done' || normalizeRoutineStatus(log.status) === 'partial')
      ).length,
    [myRoutineLogs, todayKey]
  );

  const friendTodayVisibleCount = useMemo(
    () => friendRoutines.filter((routine) => isRoutineVisibleToday(routine, todayDayKey)).length,
    [friendRoutines, todayDayKey]
  );

  const friendTodayCompletedCount = useMemo(
    () =>
      routineLogs.filter(
        (log) =>
          log.user_id === friendProfile?.id &&
          log.log_date === todayKey &&
          (normalizeRoutineStatus(log.status) === 'done' || normalizeRoutineStatus(log.status) === 'partial')
      ).length,
    [friendProfile?.id, routineLogs, todayKey]
  );

  const mySharedDoneCount = sharedGoalViews.filter((goal) => goal.myDoneToday).length;
  const friendSharedDoneCount = sharedGoalViews.filter((goal) => goal.friendDoneToday).length;
  const bothSharedDoneCount = sharedGoalViews.filter((goal) => goal.bothDoneToday).length;

  const battleTeaserHref = !friendProfile || !hasBattleStarted ? '/friends' : '/battle';
  const battleTeaserTitle = !friendProfile
    ? isKo
      ? '친구를 연결해 배틀을 열어보세요.'
      : 'Connect a friend to open the battle.'
    : !hasBattleStarted
      ? isKo
        ? `${friendLabel}님과 연결됐어요. 이제 배틀 정보를 정해보세요.`
        : `You are connected with ${friendLabel}. Set the battle details next.`
      : battleSummary.leader === 'tied'
        ? isKo
          ? '이번 주는 아직 팽팽한 동점이에요.'
          : 'The battle is still tied this week.'
        : battleSummary.leader === 'me'
          ? isKo
            ? `${profileLabel} ${Math.abs(battleSummary.difference)}점 앞서는 중`
            : `${profileLabel} leads by ${Math.abs(battleSummary.difference)} points`
          : isKo
            ? `${friendLabel} ${Math.abs(battleSummary.difference)}점 앞서는 중`
            : `${friendLabel} leads by ${Math.abs(battleSummary.difference)} points`;
  const battleTeaserBody = !friendProfile
    ? isKo
      ? '공동 목표와 친구 진행 상황이 이 영역에 함께 정리돼요.'
      : 'Shared goals and battle updates will appear here.'
    : !hasBattleStarted
      ? isKo
        ? '친구 화면에서 배틀 제목과 내기를 정하면 바로 비교가 시작돼요.'
        : 'Set the battle title and wager in Friends to start comparing.'
      : isKo
        ? `오늘 ${friendLabel}님은 ${friendTodayCompletedCount}/${friendTodayVisibleCount}개를 체크했어요.`
        : `${friendLabel} checked ${friendTodayCompletedCount}/${friendTodayVisibleCount} routines today.`;
  const battleDifferenceText = !friendProfile
    ? isKo
      ? '친구를 연결하면 비교가 시작돼요.'
      : 'Connect a friend first'
    : battleSummary.leader === 'tied'
      ? isKo
        ? '이번 주는 아직 동점이에요.'
        : 'You are tied right now'
      : isKo
        ? `${Math.abs(battleSummary.difference)}점 차이`
        : `${Math.abs(battleSummary.difference)} pts apart`;

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

    return isKo ? '휴식' : 'Rest';
  };

  const getRoutineCardClassName = (goal: PersonalGoalView) => {
    const baseClass =
      goal.status === 'done'
        ? 'dashboard-routine-card dashboard-routine-card-done'
        : `dashboard-routine-card dashboard-routine-card-${goal.status}`;
    const feedback = routineFeedback[goal.id];

    return feedback ? `${baseClass} dashboard-routine-card-feedback` : baseClass;
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
      showToast(isKo ? '우선순위를 저장하지 못했어요.' : 'Could not save the priority.');
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
            ? '먼저 routine_logs SQL을 적용해주세요.'
            : 'Apply the routine_logs SQL first.'
          : isKo
            ? '상태를 저장하지 못했어요.'
            : 'Could not save the status.'
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
        <header className="home-top-card dashboard-top-card">
          <div className="dashboard-header-row">
            <div className="dashboard-header-copy">
              <p className="home-date-label">{todayLabel}</p>
              <h1 className="dashboard-title">{isKo ? '오늘의 루틴' : 'Today routines'}</h1>
              <p className="dashboard-subtitle">
                {isKo
                  ? '개인 루틴을 먼저 체크하고, 친구와 함께하는 목표는 아래에서 따로 확인하세요.'
                  : 'Check your personal routines first, then review shared goals with your friend below.'}
              </p>
            </div>

            <Link className="home-bell-button dashboard-profile-shortcut" to="/mypage" aria-label={t('home.myPageAria')}>
              {profileInitial}
            </Link>
          </div>

          <div className="dashboard-summary-grid">
            <article className="dashboard-summary-card dashboard-summary-card-large">
              <span className="dashboard-summary-label">{isKo ? '오늘 완료' : 'Done today'}</span>
              <strong className="dashboard-summary-value">
                {completedCount}
                <em>/ {personalGoals.length}</em>
              </strong>
              <p className="dashboard-summary-copy">
                {personalGoals.length === 0
                  ? isKo
                    ? '오늘 보여줄 개인 루틴이 없어요.'
                    : 'There are no personal routines scheduled today.'
                  : remainingCount === 0
                    ? isKo
                      ? '오늘 예정한 루틴을 모두 체크했어요.'
                      : 'You checked everything scheduled for today.'
                    : isKo
                      ? `${remainingCount}개의 루틴이 아직 남아 있어요.`
                      : `${remainingCount} routines are still waiting.`}
              </p>
            </article>

            <article className="dashboard-summary-card">
              <span className="dashboard-summary-label">{isKo ? '연속 달성' : 'Current streak'}</span>
              <strong className="dashboard-summary-value">
                {streak}
                <em>{isKo ? '일' : 'd'}</em>
              </strong>
              <p className="dashboard-summary-copy">
                {streak > 0
                  ? isKo
                    ? '오늘도 이어가고 있어요.'
                    : 'Your streak is still alive today.'
                  : isKo
                    ? '오늘부터 다시 시작해보세요.'
                    : 'A fresh streak can start today.'}
              </p>
            </article>

            <article className="dashboard-summary-card">
              <span className="dashboard-summary-label">{isKo ? '이번 주 점수' : 'Weekly score'}</span>
              <strong className="dashboard-summary-value">
                {battleSummary.myScore}
                <em>pt</em>
              </strong>
              <p className="dashboard-summary-copy">
                {isKo ? `${myTodayCompletedCount}개 체크 중` : `${myTodayCompletedCount} check-ins today`}
              </p>
            </article>
          </div>
        </header>

        <main className="home-content dashboard-home-content">
          <section className="dashboard-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="dashboard-panel-kicker">{isKo ? '개인 루틴' : 'Personal routines'}</p>
                <h2>{isKo ? '오늘 해야 할 일' : 'Today focus'}</h2>
                <p className="dashboard-panel-description">
                  {isKo
                    ? '오전, 오후, 저녁 순서로 정리해 두었어요. 체크 버튼으로 바로 완료할 수 있어요.'
                    : 'Grouped into morning, afternoon, and evening so you can check them off quickly.'}
                </p>
              </div>

              <button className="text-button" type="button" onClick={openCreateSheet}>
                {isKo ? '추가' : 'Add'}
              </button>
            </div>

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>{isKo ? '오늘 보여줄 루틴이 없어요.' : 'Nothing scheduled for today.'}</h3>
                <p>
                  {isKo
                    ? '반복 요일이나 시간을 정해 루틴을 만들면 이 화면에서 바로 체크할 수 있어요.'
                    : 'Add a routine with repeat days or a reminder time and it will show up here.'}
                </p>
                <button className="inline-action-link" type="button" onClick={openCreateSheet}>
                  {isKo ? '루틴 추가하기' : 'Add routine'}
                </button>
              </article>
            ) : (
              <div className="dashboard-period-list">
                {groupedGoals.map((group) => (
                  <section key={group.key} className="dashboard-period-group">
                    <div className="dashboard-period-header">
                      <h3>{group.label}</h3>
                      <span className="dashboard-period-badge">{group.items.length}{isKo ? '개' : ''}</span>
                    </div>

                    <div className="dashboard-routine-list">
                      {group.items.map((goal) => {
                        const formattedTime = formatRoutineTime(goal.reminder_time, screenLocale);
                        const scheduleLabel = formatRoutineSchedule(goal);
                        const streakCount = routineStreakMap[goal.id] ?? 0;
                        const noteButtonLabel = expandedNotes[goal.id]
                          ? isKo ? '메모 닫기' : 'Hide note'
                          : goal.note
                            ? isKo ? '메모 보기' : 'View note'
                            : isKo ? '메모 추가' : 'Add note';
                        const timeCopy = formattedTime ? `${formattedTime} · ${scheduleLabel}` : scheduleLabel;

                        return (
                          <article key={goal.id} className={getRoutineCardClassName(goal)}>
                            {routineFeedback[goal.id] && (
                              <span
                                key={routineFeedback[goal.id].id}
                                className={`dashboard-routine-feedback dashboard-routine-feedback-${routineFeedback[goal.id].status}`}
                              >
                                {getRoutineFeedbackLabel(routineFeedback[goal.id].status)}
                              </span>
                            )}

                            <div className="dashboard-routine-grid">
                              <button
                                className={goal.status === 'done' ? 'dashboard-check-button dashboard-check-button-active' : 'dashboard-check-button'}
                                type="button"
                                onClick={() => handleSetRoutineStatus(goal.id, goal.status === 'done' ? 'pending' : 'done', { toggleSame: false })}
                                disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                                aria-label={goal.status === 'done' ? `${goal.title} undo` : `${goal.title} done`}
                              >
                                <span className="dashboard-check-glyph">{goal.status === 'done' ? '✓' : ''}</span>
                              </button>

                              <div className="dashboard-routine-main">
                                <div className="dashboard-routine-head">
                                  <div>
                                    <div className="dashboard-routine-title-row">
                                      <h3>{goal.title}</h3>
                                      {goal.category === 'battle' && <span className="dashboard-tag dashboard-tag-battle">{isKo ? '배틀 연결' : 'Battle'}</span>}
                                    </div>
                                    <p className="dashboard-routine-time">{timeCopy}</p>
                                  </div>

                                  <details className="task-menu task-menu-floating">
                                    <summary className="task-menu-trigger" aria-label={t('home.menuAria', { title: goal.title })}>
                                      <span />
                                      <span />
                                      <span />
                                    </summary>

                                    <div className="task-menu-popover">
                                      <button className="task-menu-item" type="button" onClick={() => openEditSheet(goal)}>{isKo ? '수정' : 'Edit'}</button>
                                      <button className="task-menu-item" type="button" onClick={() => handleCyclePriority(goal)} disabled={pendingAction === `priority-${goal.id}`}>{isKo ? '우선순위 변경' : 'Change priority'}</button>
                                      <button className="task-menu-item" type="button" onClick={() => handleSetRoutineStatus(goal.id, 'pending', { toggleSame: false })} disabled={pendingAction === `routine-${goal.id}`}>{isKo ? '상태 초기화' : 'Reset status'}</button>
                                      <button className="task-menu-item task-menu-item-danger" type="button" onClick={() => handleDeleteRoutine(goal.id)} disabled={pendingAction === `delete-${goal.id}`}>{pendingAction === `delete-${goal.id}` ? (isKo ? '삭제 중...' : 'Deleting...') : (isKo ? '삭제' : 'Delete')}</button>
                                    </div>
                                  </details>
                                </div>

                                <div className="dashboard-routine-meta">
                                  <span className={`dashboard-status-badge dashboard-status-badge-${goal.status}`}>{statusLabels[goal.status]}</span>
                                  <span className="dashboard-meta-chip">{scheduleLabel}</span>
                                  {streakCount > 0 && <span className="dashboard-meta-chip">{isKo ? `${streakCount}일 연속` : `${streakCount}-day streak`}</span>}
                                </div>

                                <div className="dashboard-routine-actions">
                                  {(['partial', 'rest'] as const).map((status) => (
                                    <button
                                      key={status}
                                      className={goal.status === status ? 'dashboard-action-chip dashboard-action-chip-active' : 'dashboard-action-chip'}
                                      type="button"
                                      onClick={() => handleSetRoutineStatus(goal.id, status)}
                                      disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                                    >
                                      {pendingAction === `routine-${goal.id}` ? (isKo ? '저장 중...' : 'Saving...') : statusLabels[status]}
                                    </button>
                                  ))}

                                  <button
                                    className={expandedNotes[goal.id] ? 'dashboard-action-chip dashboard-note-toggle dashboard-action-chip-active' : 'dashboard-action-chip dashboard-note-toggle'}
                                    type="button"
                                    onClick={() => toggleNote(goal.id)}
                                  >
                                    {noteButtonLabel}
                                  </button>
                                </div>

                                {expandedNotes[goal.id] && (
                                  <label className="routine-note-field dashboard-note-field" htmlFor={`routine-note-${goal.id}`}>
                                    <input
                                      id={`routine-note-${goal.id}`}
                                      type="text"
                                      placeholder={isKo ? '짧은 메모를 남겨보세요.' : 'Add a short note'}
                                      value={noteDrafts[goal.id] ?? goal.note}
                                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [goal.id]: event.target.value }))}
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
                  </section>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="dashboard-panel-kicker">{isKo ? '공동 목표' : 'Shared goals'}</p>
                <h2>{isKo ? '친구와 함께 실천 중인 목표' : 'Goals you are doing together'}</h2>
                <p className="dashboard-panel-description">
                  {isKo
                    ? '개인 루틴과 분리해 두어 함께 달성 중인 목표만 따로 볼 수 있어요.'
                    : 'Kept separate from personal routines so the shared goals stay easy to scan.'}
                </p>
              </div>

              <Link className="dashboard-inline-link" to={battleTeaserHref}>{friendProfile ? (isKo ? '배틀 열기' : 'Open battle') : (isKo ? '친구 연결' : 'Connect')}</Link>
            </div>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>{isKo ? '아직 연결된 친구가 없어요.' : 'No friend connected yet.'}</h3>
                <p>{isKo ? '친구를 연결하면 공동 목표와 배틀 요약이 이 영역에 함께 정리돼요.' : 'Connect a friend to start shared goals and see the daily battle preview here.'}</p>
                <Link className="inline-action-link" to="/friends">{isKo ? '친구 연결하기' : 'Open Friends'}</Link>
              </article>
            ) : sharedGoalViews.length === 0 ? (
              <article className="empty-state-card">
                <h3>{isKo ? '진행 중인 공동 목표가 없어요.' : 'No shared goals yet.'}</h3>
                <p>{isKo ? '배틀 화면에서 공동 목표를 만들면 오늘 달성 상태를 여기에서 먼저 볼 수 있어요.' : 'Create a shared goal in Battle and its daily progress will preview here first.'}</p>
                <Link className="inline-action-link" to="/battle">{isKo ? '공동 목표 만들기' : 'Open battle'}</Link>
              </article>
            ) : (
              <>
                <article className="dashboard-shared-overview">
                  <div className="dashboard-shared-copy">
                    <p className="dashboard-panel-kicker">{isKo ? `${friendLabel}님과의 공동 목표` : `Shared with ${friendLabel}`}</p>
                    <h3>{isKo ? `오늘 함께 완료한 목표 ${bothSharedDoneCount}/${sharedGoalViews.length}` : `${bothSharedDoneCount}/${sharedGoalViews.length} shared goals done together today`}</h3>
                    <p>{battleTeaserBody}</p>
                  </div>

                  <div className="dashboard-shared-stats">
                    <div className="dashboard-shared-stat"><span>{isKo ? '내 완료' : 'Mine'}</span><strong>{mySharedDoneCount}</strong></div>
                    <div className="dashboard-shared-stat"><span>{isKo ? '친구 완료' : 'Friend'}</span><strong>{friendSharedDoneCount}</strong></div>
                  </div>
                </article>

                <div className="dashboard-shared-list">
                  {sharedGoalViews.slice(0, 3).map((goal) => (
                    <article key={goal.id} className="dashboard-shared-card">
                      <div>
                        <h3>{goal.title}</h3>
                        <p>{goal.rule_text || goal.description || (isKo ? '오늘 함께 체크해보세요.' : 'Check this together today.')}</p>
                      </div>

                      <div className="dashboard-shared-status-row">
                        <span className={goal.myDoneToday ? 'dashboard-shared-pill dashboard-shared-pill-active' : 'dashboard-shared-pill'}>{isKo ? '나' : 'Me'} {goal.myDoneToday ? '✓' : '○'}</span>
                        <span className={goal.friendDoneToday ? 'dashboard-shared-pill dashboard-shared-pill-active' : 'dashboard-shared-pill'}>{friendLabel} {goal.friendDoneToday ? '✓' : '○'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="dashboard-panel dashboard-friend-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="dashboard-panel-kicker">{isKo ? '친구 요약' : 'Friend pulse'}</p>
                <h2>{isKo ? '오늘 친구와 배틀 요약' : 'Your friend and battle snapshot'}</h2>
                <p className="dashboard-panel-description">
                  {isKo
                    ? '친구의 오늘 진행 상황과 배틀 상태를 홈에서 가볍게 확인할 수 있어요.'
                    : 'A quick summary of your friend, shared goals, and the current battle state.'}
                </p>
              </div>
            </div>

            {!friendProfile ? (
              <article className="dashboard-friend-card dashboard-friend-card-wide">
                <span className="dashboard-friend-label">{isKo ? '배틀 상태' : 'Battle status'}</span>
                <strong className="dashboard-friend-value">{isKo ? '친구 연결 필요' : 'Friend needed'}</strong>
                <p className="dashboard-friend-note">{isKo ? '친구를 연결하면 홈에서 바로 비교와 공동 목표 요약을 볼 수 있어요.' : 'Connect a friend to unlock comparison and shared goal summaries.'}</p>
                <Link className="dashboard-friend-link" to="/friends">{isKo ? '친구 화면 열기' : 'Open Friends'}</Link>
              </article>
            ) : (
              <>
                <div className="dashboard-friend-grid">
                  <article className="dashboard-friend-card">
                    <span className="dashboard-friend-label">{isKo ? '친구 오늘 완료' : 'Friend today'}</span>
                    <strong className="dashboard-friend-value">{friendTodayCompletedCount}<em>/ {friendTodayVisibleCount}</em></strong>
                    <p className="dashboard-friend-note">{isKo ? `${friendLabel}님이 오늘 체크한 개인 루틴` : `${friendLabel}'s personal check-ins today`}</p>
                  </article>

                  <article className="dashboard-friend-card">
                    <span className="dashboard-friend-label">{isKo ? '공동 목표 진행' : 'Shared goals'}</span>
                    <strong className="dashboard-friend-value">{sharedGoalViews.length}<em>{isKo ? '개' : ' live'}</em></strong>
                    <p className="dashboard-friend-note">{isKo ? `오늘 함께 완료 ${bothSharedDoneCount}개` : `${bothSharedDoneCount} completed together today`}</p>
                  </article>
                </div>

                <article className="dashboard-friend-card dashboard-friend-card-wide">
                  <span className="dashboard-friend-label">{isKo ? '이번 주 배틀' : 'This week battle'}</span>
                  <strong className="dashboard-friend-value">{battleTeaserTitle}</strong>
                  <p className="dashboard-friend-note">{hasBattleStarted ? `${battleDifferenceText} · ${profileLabel} ${battleSummary.myScore} : ${battleSummary.friendScore} ${friendLabel}` : battleTeaserBody}</p>
                  <Link className="dashboard-friend-link" to={battleTeaserHref}>{hasBattleStarted ? (isKo ? '배틀 자세히 보기' : 'Open battle') : (isKo ? '배틀 준비하기' : 'Set up battle')}</Link>
                </article>
              </>
            )}
          </section>

          <section className="dashboard-panel dashboard-week-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="dashboard-panel-kicker">{isKo ? '기록 미리보기' : 'Record preview'}</p>
                <h2>{isKo ? '이번 주 꾸준함' : 'This week at a glance'}</h2>
                <p className="dashboard-panel-description">
                  {isKo
                    ? '큰 차트 대신 요일별 상태를 간단히 확인할 수 있게 정리했어요.'
                    : 'A light weekly snapshot so you can read each day without a heavy chart.'}
                </p>
              </div>

              <Link className="dashboard-inline-link" to="/stats">{isKo ? '기록 보기' : 'Open records'}</Link>
            </div>

            <div className="dashboard-week-stats">
              <article className="dashboard-week-stat">
                <span className="dashboard-week-label">{isKo ? '이번 주 완료율' : 'Weekly rate'}</span>
                <strong className="dashboard-week-value">{weekStats.percent}<em>%</em></strong>
              </article>
              <article className="dashboard-week-stat">
                <span className="dashboard-week-label">{isKo ? '체크한 루틴' : 'Checked routines'}</span>
                <strong className="dashboard-week-value">{weekCheckedCount}<em>/ {weekStats.totalSlots}</em></strong>
              </article>
            </div>

            <div className="dashboard-week-row" aria-label={isKo ? '이번 주 요일별 기록' : 'Weekly routine status'}>
              {weekStats.daily.map((day) => (
                <div key={day.dateKey} className="dashboard-week-day">
                  <span className="dashboard-week-daylabel">{getWeekdayLabel(day.dateKey, screenLocale)}</span>
                  <span className={`dashboard-week-cell dashboard-week-cell-${day.status}`}>{day.status === 'done' ? '✓' : day.status === 'partial' ? '◐' : day.status === 'rest' ? '−' : ''}</span>
                  <span className="dashboard-week-date">{getDateNumberLabel(day.dateKey, screenLocale)}</span>
                </div>
              ))}
            </div>
          </section>
        </main>

        <button className="fab-button fab-button-extended" type="button" onClick={openCreateSheet} aria-label={isKo ? '루틴 추가하기' : 'Add routine'}>
          + {isKo ? '루틴 추가' : 'Add routine'}
        </button>

        {toast && (
          <div className="home-toast" role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        {routineSheetOpen && (
          <RoutineEditorSheet initialRoutine={editingRoutine} onClose={() => setRoutineSheetOpen(false)} onSaved={handleRoutineSaved} />
        )}

        <BottomTabBar />
      </div>
    </div>
  );
}
