import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import { formatOpponentLabel, formatSelfLabel } from '../lib/nameDisplay';
import {
  FriendshipRow,
  NudgeRow,
  ProfileRow,
  RoutineLogRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  RoutineStatus,
  calculateBattleScores,
  connectFriendByCode,
  disconnectFriendConnection,
  ensureProfile,
  fetchFriendConnection,
  fetchRoutineLogsForUsers,
  filterSharedGoalsForPair,
  getBattleActionHint,
  getDaysUntilWeekEnd,
  getLastDateKeys,
  getTodayDayKey,
  getTodayKey,
  getWeekDateKeys,
  isPositiveRoutineStatus,
  isRoutineVisibleToday,
  normalizeFriendCode,
  normalizeRoutineCategory,
  normalizeRoutineStatus,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type SharedGoalView = SharedGoalRow & {
  myDoneToday: boolean;
  friendDoneToday: boolean;
  statusText: string;
};

type BattleRoutineView = {
  title: string;
  description: string;
  myStatus: RoutineStatus;
  friendStatus: RoutineStatus;
  myWeeklySuccess: number;
  friendWeeklySuccess: number;
};

type ToastState = {
  id: number;
  message: string;
};

type RecentFlowDay = {
  dateKey: string;
  myCount: number;
  friendCount: number;
};

function buildGoalStatus({
  myDoneToday,
  friendDoneToday,
  isKo,
}: {
  myDoneToday: boolean;
  friendDoneToday: boolean;
  isKo: boolean;
}) {
  if (myDoneToday && friendDoneToday) {
    return isKo ? '오늘 둘 다 완료했어요.' : 'Both completed this today.';
  }

  if (myDoneToday) {
    return isKo ? '나는 완료했고 친구를 기다리는 중이에요.' : 'You are done and waiting on your friend.';
  }

  if (friendDoneToday) {
    return isKo ? '친구가 먼저 완료했어요.' : 'Your friend completed it first.';
  }

  return isKo ? '아직 둘 다 체크하지 않았어요.' : 'Neither of you has checked in yet.';
}

function getStatusLabel(status: RoutineStatus, isKo: boolean) {
  if (status === 'done') {
    return isKo ? '완료' : 'Done';
  }

  if (status === 'partial') {
    return isKo ? '부분 완료' : 'Partial';
  }

  if (status === 'rest') {
    return isKo ? '휴식' : 'Rest';
  }

  return isKo ? '대기' : 'Pending';
}

function getStatusMark(status: RoutineStatus) {
  if (status === 'done') {
    return '✓';
  }

  if (status === 'partial') {
    return '◐';
  }

  if (status === 'rest') {
    return '−';
  }

  return '○';
}

function getDateLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00`));
}

export default function Battle() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [battleMeta, setBattleMeta] = useState<FriendshipRow | null>(null);
  const [routineLogs, setRoutineLogs] = useState<RoutineLogRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [title, setTitle] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [stakeText, setStakeText] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [sharedGoalSheetOpen, setSharedGoalSheetOpen] = useState(false);
  const [friendSheetOpen, setFriendSheetOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';
  const screenLocale = isKo ? 'ko-KR' : 'en-US';
  const todayKey = useMemo(() => getTodayKey(), []);
  const todayDayKey = useMemo(() => getTodayDayKey(), []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    let active = true;

    const loadBattle = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate('/login');
        return;
      }

      setUserId(user.id);

      try {
        const ensuredProfile = await ensureProfile(user);
        const connection = await fetchFriendConnection(ensuredProfile);

        if (!active) {
          return;
        }

        setProfile(connection.profile);
        setFriendProfile(connection.friendProfile);
        setBattleMeta(connection.friendship);

        if (!connection.friendProfile) {
          setRoutineLogs([]);
          setRoutines([]);
          setSharedGoals([]);
          setSharedGoalCheckins([]);
          setNudges([]);
          setLoading(false);
          return;
        }

        const relatedUserIds = [user.id, connection.friendProfile.id];

        const { data: routineData, error: routineError } = await supabase
          .from('routines')
          .select('*')
          .in('user_id', relatedUserIds);

        if (routineError) {
          throw routineError;
        }

        if (active) {
          setRoutines(((routineData as RoutineRow[]) ?? []).filter((routine) => !routine.is_template));
        }

        const logData = await fetchRoutineLogsForUsers(relatedUserIds);

        if (active) {
          setRoutineLogs(logData);
        }

        const { data: sharedGoalData, error: sharedGoalError } = await supabase
          .from('shared_goals')
          .select('*')
          .or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (sharedGoalError) {
          throw sharedGoalError;
        }

        const filteredGoals = filterSharedGoalsForPair((sharedGoalData as SharedGoalRow[]) ?? [], user.id, connection.friendProfile.id);

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

        const { data: nudgeData, error: nudgeError } = await supabase
          .from('nudges')
          .select('id, sender_id, receiver_id, message, created_at')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${connection.friendProfile.id}),and(sender_id.eq.${connection.friendProfile.id},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: false })
          .limit(8);

        if (nudgeError) {
          throw nudgeError;
        }

        if (active) {
          setNudges((nudgeData as NudgeRow[]) ?? []);
        }
      } catch (loadError) {
        console.warn('Battle load failed:', loadError);
        if (active) {
          setError(isKo ? '배틀 정보를 불러오지 못했어요.' : 'Could not load the battle view.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadBattle();

    return () => {
      active = false;
    };
  }, [isKo, navigate]);

  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: isKo ? '나' : 'Me' });
  const opponentLabel = formatOpponentLabel(friendProfile?.nickname, { locale });
  const battleTitle = battleMeta?.battle_title?.trim() || (isKo ? '이번 주 루틴 배틀' : 'This week battle');
  const hasBattleStarted = Boolean(friendProfile && battleMeta?.battle_started_at);
  const battleSetupTitle = isKo ? `${opponentLabel}님과 배틀 준비 중이에요.` : `You are almost ready to battle ${opponentLabel}.`;
  const battleSetupBody = isKo
    ? '친구 화면에서 배틀 제목과 내기를 정하면 비교 정보와 공동 목표가 여기에서 열려요.'
    : 'Set the battle title and wager in Friends to unlock the comparison view and shared goals here.';
  const battleSetupAction = isKo ? '친구 화면으로 이동' : 'Open Friends';

  const battleSummary = useMemo(() => {
    return calculateBattleScores({
      currentUserId: userId,
      friendId: friendProfile?.id ?? null,
      checkins: routineLogs,
      sharedGoalCheckins,
      sharedGoals,
      routines,
    });
  }, [friendProfile?.id, routineLogs, routines, sharedGoalCheckins, sharedGoals, userId]);

  const weekDateKeys = useMemo(() => getWeekDateKeys(), []);
  const recentFlowKeys = useMemo(() => getLastDateKeys(7), []);

  const sharedGoalViews = useMemo<SharedGoalView[]>(() => {
    if (!friendProfile) {
      return [];
    }

    return sharedGoals.map((goal) => {
      const myDoneToday = sharedGoalCheckins.some(
        (checkin) => checkin.goal_id === goal.id && checkin.user_id === userId && checkin.check_date === todayKey
      );
      const friendDoneToday = sharedGoalCheckins.some(
        (checkin) => checkin.goal_id === goal.id && checkin.user_id === friendProfile.id && checkin.check_date === todayKey
      );

      return {
        ...goal,
        myDoneToday,
        friendDoneToday,
        statusText: buildGoalStatus({ myDoneToday, friendDoneToday, isKo }),
      };
    });
  }, [friendProfile, isKo, sharedGoalCheckins, sharedGoals, todayKey, userId]);

  const battleRoutineViews = useMemo<BattleRoutineView[]>(() => {
    if (!friendProfile) {
      return [];
    }

    const battleRoutines = routines.filter((routine) => normalizeRoutineCategory(routine.category) === 'battle');
    const grouped = new Map<string, { title: string; description: string; myRoutine?: RoutineRow; friendRoutine?: RoutineRow }>();

    battleRoutines.forEach((routine) => {
      const key = routine.title.trim().toLowerCase();
      const group = grouped.get(key) ?? { title: routine.title, description: routine.description ?? '' };
      if (routine.user_id === userId) {
        group.myRoutine = routine;
      }
      if (routine.user_id === friendProfile.id) {
        group.friendRoutine = routine;
      }
      grouped.set(key, group);
    });

    return Array.from(grouped.values()).map((group) => {
      const myTodayLog = group.myRoutine ? routineLogs.find((log) => log.routine_id === group.myRoutine?.id && log.user_id === userId && log.log_date === todayKey) : null;
      const friendTodayLog = group.friendRoutine ? routineLogs.find((log) => log.routine_id === group.friendRoutine?.id && log.user_id === friendProfile.id && log.log_date === todayKey) : null;
      const myWeeklySuccess = group.myRoutine ? routineLogs.filter((log) => log.routine_id === group.myRoutine?.id && log.user_id === userId && weekDateKeys.includes(log.log_date) && isPositiveRoutineStatus(log.status)).length : 0;
      const friendWeeklySuccess = group.friendRoutine ? routineLogs.filter((log) => log.routine_id === group.friendRoutine?.id && log.user_id === friendProfile.id && weekDateKeys.includes(log.log_date) && isPositiveRoutineStatus(log.status)).length : 0;

      return {
        title: group.title,
        description: group.description,
        myStatus: myTodayLog ? normalizeRoutineStatus(myTodayLog.status) : 'pending',
        friendStatus: friendTodayLog ? normalizeRoutineStatus(friendTodayLog.status) : 'pending',
        myWeeklySuccess,
        friendWeeklySuccess,
      };
    });
  }, [friendProfile, routineLogs, routines, todayKey, userId, weekDateKeys]);

  const myTodayVisibleCount = useMemo(() => routines.filter((routine) => routine.user_id === userId && isRoutineVisibleToday(routine, todayDayKey)).length, [routines, todayDayKey, userId]);
  const friendTodayVisibleCount = useMemo(() => routines.filter((routine) => routine.user_id === friendProfile?.id && isRoutineVisibleToday(routine, todayDayKey)).length, [friendProfile?.id, routines, todayDayKey]);
  const myTodayCompletedCount = useMemo(() => routineLogs.filter((log) => log.user_id === userId && log.log_date === todayKey && isPositiveRoutineStatus(log.status)).length, [routineLogs, todayKey, userId]);
  const friendTodayCompletedCount = useMemo(() => routineLogs.filter((log) => log.user_id === friendProfile?.id && log.log_date === todayKey && isPositiveRoutineStatus(log.status)).length, [friendProfile?.id, routineLogs, todayKey]);
  const myTodaySharedCount = sharedGoalViews.filter((goal) => goal.myDoneToday).length;
  const friendTodaySharedCount = sharedGoalViews.filter((goal) => goal.friendDoneToday).length;
  const weeklyCompletionGap = battleSummary.myPersonalActions - battleSummary.friendPersonalActions;
  const battleHint = getBattleActionHint({ difference: battleSummary.difference, hasFriend: Boolean(friendProfile), locale });
  const battleDaysLeft = getDaysUntilWeekEnd();

  const recentFlow = useMemo<RecentFlowDay[]>(() => {
    if (!friendProfile) {
      return [];
    }

    return recentFlowKeys.map((dateKey) => ({
      dateKey,
      myCount: routineLogs.filter((log) => log.user_id === userId && log.log_date === dateKey && isPositiveRoutineStatus(log.status)).length,
      friendCount: routineLogs.filter((log) => log.user_id === friendProfile.id && log.log_date === dateKey && isPositiveRoutineStatus(log.status)).length,
    }));
  }, [friendProfile, recentFlowKeys, routineLogs, userId]);

  const handleCreateSharedGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!friendProfile || !userId || !hasBattleStarted) {
      setNotice(hasBattleStarted ? (isKo ? '친구를 먼저 연결해주세요.' : 'Connect a friend first.') : battleSetupBody);
      return;
    }

    const nextTitle = title.trim();
    const nextRuleText = ruleText.trim();
    const nextStakeText = stakeText.trim();

    if (!nextTitle) {
      setError(isKo ? '목표 이름을 입력해주세요.' : 'Enter a goal title.');
      return;
    }

    setPendingAction('shared-create');

    const sharedGoalPayload = {
      owner_id: userId,
      friend_id: friendProfile.id,
      title: nextTitle,
      description: nextRuleText || null,
      rule_text: nextRuleText || null,
      stake_text: nextStakeText || null,
      points: 3,
    };

    const { data, error: insertError } = await supabase.from('shared_goals').insert(sharedGoalPayload).select('*').single();

    if (insertError) {
      console.warn('Shared goal create failed:', insertError);
      const message = isKo ? '공동 목표를 저장하지 못했어요.' : 'Could not save the shared goal.';
      setError(message);
      setNotice(message);
      setToast({ id: Date.now(), message });
      setPendingAction('');
      return;
    }

    setSharedGoals((current) => [data as SharedGoalRow, ...current]);
    setTitle('');
    setRuleText('');
    setStakeText('');
    setSharedGoalSheetOpen(false);
    setNotice(isKo ? '공동 목표를 만들었어요.' : 'Shared goal created.');
    setToast({ id: Date.now(), message: isKo ? '공동 목표를 만들었어요.' : 'Shared goal created.' });
    setPendingAction('');
  };

  const handleConnectFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!profile) {
      setError(isKo ? '프로필 정보를 먼저 불러와주세요.' : 'Load your profile first.');
      return;
    }

    setPendingAction('friend-connect');

    try {
      const connection = await connectFriendByCode(profile, inviteCode);
      const nextConnection = await fetchFriendConnection(connection.profile);
      setProfile(nextConnection.profile);
      setFriendProfile(nextConnection.friendProfile);
      setBattleMeta(nextConnection.friendship);
      setInviteCode('');
      setFriendSheetOpen(false);
      setToast({ id: Date.now(), message: isKo ? '친구를 연결했어요.' : 'Friend connected.' });
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : isKo ? '친구 연결에 실패했어요.' : 'Could not connect your friend.';
      setError(message);
      setToast({ id: Date.now(), message });
    } finally {
      setPendingAction('');
    }
  };

  const handleDisconnectFriend = async () => {
    if (!profile) {
      setError(isKo ? '프로필 정보를 먼저 불러와주세요.' : 'Load your profile first.');
      return;
    }

    setPendingAction('friend-disconnect');
    setError('');
    setNotice('');

    try {
      const result = await disconnectFriendConnection(profile, battleMeta?.id ?? null);
      setProfile(result.profile);
      setFriendProfile(null);
      setBattleMeta(null);
      setRoutines([]);
      setRoutineLogs([]);
      setSharedGoals([]);
      setSharedGoalCheckins([]);
      setNudges([]);
      setDisconnectOpen(false);
      setFriendSheetOpen(false);
      setToast({ id: Date.now(), message: isKo ? '친구 연결을 해제했어요.' : 'Friend connection removed.' });
    } catch (disconnectError) {
      const message = disconnectError instanceof Error ? disconnectError.message : isKo ? '친구 연결을 해제하지 못했어요.' : 'Could not remove this friend connection.';
      setError(message);
      setToast({ id: Date.now(), message });
    } finally {
      setPendingAction('');
    }
  };

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId || !friendProfile || !hasBattleStarted) {
      setNotice(hasBattleStarted ? (isKo ? '친구를 먼저 연결해주세요.' : 'Connect a friend first.') : battleSetupBody);
      return;
    }

    setPendingAction(`shared-${goalId}`);
    setError('');
    setNotice('');

    const alreadyDone = sharedGoalCheckins.some((checkin) => checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey);

    if (alreadyDone) {
      const { error: deleteError } = await supabase.from('shared_goal_checkins').delete().eq('goal_id', goalId).eq('user_id', userId).eq('check_date', todayKey);

      if (deleteError) {
        setError(isKo ? '공동 목표 상태를 바꾸지 못했어요.' : 'Could not update the shared goal.');
        setPendingAction('');
        return;
      }

      setSharedGoalCheckins((current) => current.filter((checkin) => !(checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey)));
      setPendingAction('');
      return;
    }

    const payload = { goal_id: goalId, user_id: userId, check_date: todayKey };
    const { error: insertError } = await supabase.from('shared_goal_checkins').insert(payload);

    if (insertError) {
      setError(isKo ? '공동 목표 상태를 바꾸지 못했어요.' : 'Could not update the shared goal.');
      setPendingAction('');
      return;
    }

    setSharedGoalCheckins((current) => [...current, payload]);
    setPendingAction('');
  };

  const handleSendNudge = async (goalTitle?: string) => {
    if (!userId || !friendProfile || !hasBattleStarted) {
      setNotice(hasBattleStarted ? (isKo ? '친구를 먼저 연결해주세요.' : 'Connect a friend first.') : battleSetupBody);
      return;
    }

    const message = goalTitle
      ? isKo ? `${goalTitle} 체크했는지 같이 확인해봐요.` : `Let's check in on ${goalTitle}.`
      : isKo ? '오늘 루틴 체크했는지 확인해봐요.' : 'Checking in on today\'s routines.';

    const { data, error: nudgeError } = await supabase.from('nudges').insert({ sender_id: userId, receiver_id: friendProfile.id, message }).select('id, sender_id, receiver_id, message, created_at').single();

    if (nudgeError) {
      setError(isKo ? '알림을 보내지 못했어요.' : 'Could not send the nudge.');
      return;
    }

    setNudges((current) => [data as NudgeRow, ...current].slice(0, 8));
    setNotice(isKo ? `${opponentLabel}님에게 알림을 보냈어요.` : `Sent a nudge to ${opponentLabel}.`);
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen subpage-screen battle-dashboard-screen">
        <header className="subpage-header battle-page-header battle-dashboard-header">
          <div className="battle-page-header-row">
            <div>
              <p className="section-eyebrow">{isKo ? '배틀' : 'Battle'}</p>
              <h1>{isKo ? '친구와 루틴 비교' : 'Compare with your friend'}</h1>
              <p>{isKo ? '과한 게임 느낌 대신, 차이와 역전 가능성이 한눈에 보이도록 정리했어요.' : 'A calm comparison view that keeps the difference and comeback path easy to read.'}</p>
            </div>
            <button className="battle-header-action" type="button" onClick={() => setFriendSheetOpen(true)}>{isKo ? '친구 관리' : 'Friends'}</button>
          </div>
        </header>

        <main className="subpage-content battle-dashboard-content">
          {error && <p className="error home-error">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          {!friendProfile ? (
            <article className="empty-state-card">
              <h3>{isKo ? '배틀할 친구가 아직 없어요.' : 'No friend connected yet.'}</h3>
              <p>{isKo ? '친구를 연결하면 공동 목표와 주간 비교 카드가 여기에 나타나요.' : 'Connect a friend to unlock the weekly comparison and shared goal sections.'}</p>
              <Link className="inline-action-link" to="/friends">{isKo ? '친구 연결하기' : 'Open Friends'}</Link>
            </article>
          ) : !hasBattleStarted ? (
            <article className="empty-state-card">
              <h3>{battleSetupTitle}</h3>
              <p>{battleSetupBody}</p>
              <Link className="inline-action-link" to="/friends">{battleSetupAction}</Link>
            </article>
          ) : (
            <>
              <section className="battle-hero-card">
                <div className="battle-hero-topbar">
                  <div>
                    <p className="battle-hero-kicker">{battleTitle}</p>
                    <h2>{battleSummary.leader === 'tied' ? (isKo ? '이번 주는 동점이에요.' : 'The battle is tied this week.') : battleSummary.leader === 'me' ? (isKo ? `${profileLabel}이 앞서고 있어요.` : `${profileLabel} is ahead.`) : (isKo ? `${opponentLabel}이 앞서고 있어요.` : `${opponentLabel} is ahead.`)}</h2>
                    <p>{battleMeta?.wager_text ? (isKo ? `내기: ${battleMeta.wager_text}` : `Wager: ${battleMeta.wager_text}`) : (isKo ? '이번 주 진행 상황을 비교하고 있어요.' : 'Tracking this week\'s progress side by side.')}</p>
                  </div>
                  <span className="battle-days-pill">D-{battleDaysLeft}</span>
                </div>

                <div className="battle-versus-grid">
                  <article className="battle-versus-card">
                    <span>{profileLabel}</span>
                    <strong>{battleSummary.myPersonalActions}</strong>
                    <p>{battleSummary.myScore} pt · {battleSummary.myWeeklyPercent}%</p>
                  </article>
                  <div className="battle-versus-divider">VS</div>
                  <article className="battle-versus-card">
                    <span>{opponentLabel}</span>
                    <strong>{battleSummary.friendPersonalActions}</strong>
                    <p>{battleSummary.friendScore} pt · {battleSummary.friendWeeklyPercent}%</p>
                  </article>
                </div>

                <div className="battle-hero-stats">
                  <article className="battle-hero-stat">
                    <span>{isKo ? '완료 개수 차이' : 'Completion gap'}</span>
                    <strong>{Math.abs(weeklyCompletionGap)}</strong>
                  </article>
                  <article className="battle-hero-stat">
                    <span>{isKo ? '점수 차이' : 'Score gap'}</span>
                    <strong>{Math.abs(battleSummary.difference)}</strong>
                  </article>
                  <article className="battle-hero-stat">
                    <span>{isKo ? '보너스' : 'Shared bonus'}</span>
                    <strong>+{battleSummary.sharedBonusCount}</strong>
                  </article>
                </div>

                <div className="battle-hero-message">
                  <strong>{weeklyCompletionGap === 0 ? (isKo ? '완료 개수는 아직 같아요.' : 'Completion counts are even right now.') : weeklyCompletionGap > 0 ? (isKo ? `${weeklyCompletionGap}개 앞서고 있어요.` : `You are ahead by ${weeklyCompletionGap}.`) : (isKo ? `${Math.abs(weeklyCompletionGap)}개 뒤지고 있어요.` : `You are behind by ${Math.abs(weeklyCompletionGap)}.`)}</strong>
                  <p>{battleHint}</p>
                </div>
              </section>

              <section className="battle-section-card">
                <div className="battle-section-header">
                  <div>
                    <p className="battle-section-kicker">{isKo ? '오늘 진행' : 'Today'}</p>
                    <h2>{isKo ? '오늘 누가 더 앞섰는지' : 'Today\'s progress'}</h2>
                  </div>
                </div>

                <div className="battle-today-grid">
                  <article className="battle-today-card">
                    <span>{profileLabel}</span>
                    <strong>{myTodayCompletedCount}<em>/ {myTodayVisibleCount}</em></strong>
                    <p>{isKo ? `공동 목표 ${myTodaySharedCount}개 체크` : `${myTodaySharedCount} shared goals checked`}</p>
                  </article>
                  <article className="battle-today-card">
                    <span>{opponentLabel}</span>
                    <strong>{friendTodayCompletedCount}<em>/ {friendTodayVisibleCount}</em></strong>
                    <p>{isKo ? `공동 목표 ${friendTodaySharedCount}개 체크` : `${friendTodaySharedCount} shared goals checked`}</p>
                  </article>
                </div>

                <p className="battle-support-copy">{myTodayCompletedCount === friendTodayCompletedCount ? (isKo ? '오늘은 아직 같은 페이스예요.' : 'Today is still tied.') : myTodayCompletedCount > friendTodayCompletedCount ? (isKo ? `오늘은 ${profileLabel}이 ${myTodayCompletedCount - friendTodayCompletedCount}개 더 체크했어요.` : `${profileLabel} checked ${myTodayCompletedCount - friendTodayCompletedCount} more today.`) : (isKo ? `오늘은 ${opponentLabel}이 ${friendTodayCompletedCount - myTodayCompletedCount}개 더 체크했어요.` : `${opponentLabel} checked ${friendTodayCompletedCount - myTodayCompletedCount} more today.`)}</p>
              </section>

              <section className="battle-section-card" id="battle-routines">
                <div className="battle-section-header">
                  <div>
                    <p className="battle-section-kicker">{isKo ? '공동 경쟁 루틴' : 'Competition routines'}</p>
                    <h2>{isKo ? '오늘 반영 상태와 주간 누적' : 'Today status and weekly totals'}</h2>
                  </div>
                </div>

                {battleRoutineViews.length === 0 ? (
                  <article className="empty-state-card">
                    <h3>{isKo ? '배틀용 루틴이 아직 없어요.' : 'No battle routines yet.'}</h3>
                    <p>{isKo ? '루틴을 배틀 카테고리로 지정하면 이 목록에 비교 카드가 생겨요.' : 'Mark a routine as Battle and it will appear here for comparison.'}</p>
                  </article>
                ) : (
                  <div className="battle-routine-list">
                    {battleRoutineViews.map((routine) => (
                      <article key={routine.title} className="battle-routine-row">
                        <div className="battle-routine-copy">
                          <h3>{routine.title}</h3>
                          {routine.description && <p>{routine.description}</p>}
                        </div>
                        <div className="battle-routine-compare">
                          <div className="battle-routine-side">
                            <span>{profileLabel}</span>
                            <strong>{getStatusMark(routine.myStatus)} {getStatusLabel(routine.myStatus, isKo)}</strong>
                            <small>{isKo ? `이번 주 ${routine.myWeeklySuccess}회` : `${routine.myWeeklySuccess} this week`}</small>
                          </div>
                          <div className="battle-routine-side">
                            <span>{opponentLabel}</span>
                            <strong>{getStatusMark(routine.friendStatus)} {getStatusLabel(routine.friendStatus, isKo)}</strong>
                            <small>{isKo ? `이번 주 ${routine.friendWeeklySuccess}회` : `${routine.friendWeeklySuccess} this week`}</small>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="battle-section-card">
                <div className="battle-section-header">
                  <div>
                    <p className="battle-section-kicker">{isKo ? '공동 목표' : 'Shared goals'}</p>
                    <h2>{isKo ? '친구와 함께 체크하는 목표' : 'Goals you are checking together'}</h2>
                  </div>
                  <button className="text-button" type="button" onClick={() => setSharedGoalSheetOpen(true)}>{isKo ? '목표 추가' : 'Add goal'}</button>
                </div>

                {sharedGoalViews.length === 0 ? (
                  <article className="empty-state-card">
                    <h3>{isKo ? '공동 목표가 아직 없어요.' : 'No shared goals yet.'}</h3>
                    <p>{isKo ? '함께 지킬 규칙이나 내기를 목표로 추가해보세요.' : 'Add a shared goal to keep a small rule or wager visible for both of you.'}</p>
                  </article>
                ) : (
                  <div className="battle-shared-list-modern">
                    {sharedGoalViews.map((goal) => (
                      <article key={goal.id} className="battle-shared-goal-card">
                        <div className="battle-shared-goal-head">
                          <div>
                            <h3>{goal.title}</h3>
                            <p>{goal.rule_text || goal.description || (isKo ? '오늘 함께 체크해보세요.' : 'Check this together today.')}</p>
                          </div>
                          <span className="battle-points-pill">{goal.points ?? 3} pt</span>
                        </div>
                        {goal.stake_text && <p className="battle-goal-stake">{isKo ? `내기: ${goal.stake_text}` : `Stake: ${goal.stake_text}`}</p>}
                        <p className="battle-goal-status-copy">{goal.statusText}</p>
                        <div className="battle-goal-players">
                          <div className={goal.myDoneToday ? 'battle-goal-player battle-goal-player-active' : 'battle-goal-player'}>
                            <span>{profileLabel}</span>
                            <strong>{goal.myDoneToday ? '✓' : '○'}</strong>
                          </div>
                          <div className={goal.friendDoneToday ? 'battle-goal-player battle-goal-player-active' : 'battle-goal-player'}>
                            <span>{opponentLabel}</span>
                            <strong>{goal.friendDoneToday ? '✓' : '○'}</strong>
                          </div>
                        </div>
                        <div className="shared-actions">
                          <button className="primary-button" type="button" onClick={() => handleToggleSharedGoal(goal.id)} disabled={pendingAction === `shared-${goal.id}`}>{pendingAction === `shared-${goal.id}` ? (isKo ? '저장 중...' : 'Saving...') : goal.myDoneToday ? (isKo ? '체크 취소' : 'Undo') : (isKo ? '내 체크 완료' : 'Mark mine')}</button>
                          <button className="secondary-button" type="button" onClick={() => handleSendNudge(goal.title)}>{isKo ? '친구에게 알림' : 'Send nudge'}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="battle-section-card">
                <div className="battle-section-header">
                  <div>
                    <p className="battle-section-kicker">{isKo ? '최근 7일' : 'Recent 7 days'}</p>
                    <h2>{isKo ? '배틀 흐름 요약' : 'Recent flow'}</h2>
                  </div>
                </div>

                <div className="battle-flow-list">
                  {recentFlow.map((day) => (
                    <article key={day.dateKey} className="battle-flow-row">
                      <div>
                        <strong>{getDateLabel(day.dateKey, screenLocale)}</strong>
                        <p>{day.myCount === day.friendCount ? (isKo ? '같은 수로 체크했어요.' : 'Same number checked.') : day.myCount > day.friendCount ? (isKo ? `${profileLabel}이 앞섰어요.` : `${profileLabel} led this day.`) : (isKo ? `${opponentLabel}이 앞섰어요.` : `${opponentLabel} led this day.`)}</p>
                      </div>
                      <div className="battle-flow-values">
                        <span>{profileLabel} {day.myCount}</span>
                        <span>{opponentLabel} {day.friendCount}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="battle-section-card">
                <div className="battle-section-header">
                  <div>
                    <p className="battle-section-kicker">{isKo ? '최근 메시지' : 'Recent nudges'}</p>
                    <h2>{isKo ? '친구와 주고받은 알림' : 'What you sent recently'}</h2>
                  </div>
                </div>

                {nudges.length === 0 ? (
                  <article className="empty-state-card">
                    <h3>{isKo ? '아직 보낸 알림이 없어요.' : 'No nudges yet.'}</h3>
                    <p>{isKo ? '공동 목표 카드에서 친구에게 가볍게 알림을 보내볼 수 있어요.' : 'Use the shared goal cards to send a quick nudge to your friend.'}</p>
                  </article>
                ) : (
                  <div className="battle-feed-list">
                    {nudges.map((nudge) => (
                      <article key={nudge.id} className="battle-feed-row">
                        <div>
                          <strong>{nudge.sender_id === userId ? (isKo ? '내가 보냄' : 'Sent by me') : (isKo ? `${opponentLabel}이 보냄` : `Sent by ${opponentLabel}`)}</strong>
                          <p>{nudge.message}</p>
                        </div>
                        <span>{new Intl.DateTimeFormat(screenLocale, { month: 'short', day: 'numeric' }).format(new Date(nudge.created_at))}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        {toast && <div className="home-toast" role="status" aria-live="polite">{toast.message}</div>}

        {sharedGoalSheetOpen && (
          <div className="modal-backdrop" role="presentation" onClick={() => setSharedGoalSheetOpen(false)}>
            <form className="modal-card bottom-sheet-card shared-goal-sheet" role="dialog" aria-modal="true" aria-labelledby="shared-goal-sheet-title" onSubmit={handleCreateSharedGoal} onClick={(event) => event.stopPropagation()}>
              <h2 id="shared-goal-sheet-title" className="modal-title">{isKo ? '공동 목표 추가' : 'Add shared goal'}</h2>
              <p className="modal-copy">{isKo ? '짧은 목표와 규칙, 내기를 적어두면 오늘 체크가 더 쉬워져요.' : 'Keep the goal, rule, and stake short so it stays easy to check every day.'}</p>
              <label className="field-group" htmlFor="shared-goal-title"><span>{isKo ? '목표 이름' : 'Goal title'}</span><input id="shared-goal-title" type="text" placeholder={isKo ? '예: 저녁 15분 산책' : 'e.g. 15-minute evening walk'} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} required /></label>
              <label className="field-group" htmlFor="shared-goal-rule"><span>{isKo ? '규칙' : 'Rule'}</span><textarea id="shared-goal-rule" rows={3} placeholder={isKo ? '예: 자기 전까지 체크하기' : 'e.g. Check in before bed'} value={ruleText} onChange={(event) => setRuleText(event.target.value)} maxLength={160} /></label>
              <label className="field-group" htmlFor="shared-goal-stake"><span>{isKo ? '내기 또는 보상' : 'Stake or reward'}</span><input id="shared-goal-stake" type="text" placeholder={isKo ? '예: 진 사람이 커피 사기' : 'e.g. Loser buys coffee'} value={stakeText} onChange={(event) => setStakeText(event.target.value)} maxLength={80} /></label>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setSharedGoalSheetOpen(false)} disabled={pendingAction === 'shared-create'}>{isKo ? '취소' : 'Cancel'}</button>
                <button className="primary-button" type="submit" disabled={pendingAction === 'shared-create'}>{pendingAction === 'shared-create' ? (isKo ? '저장 중...' : 'Saving...') : (isKo ? '만들기' : 'Create')}</button>
              </div>
            </form>
          </div>
        )}

        {friendSheetOpen && (
          <div className="modal-backdrop" role="presentation" onClick={() => setFriendSheetOpen(false)}>
            <div className="modal-card bottom-sheet-card friend-management-sheet" role="dialog" aria-modal="true" aria-labelledby="friend-management-title" onClick={(event) => event.stopPropagation()}>
              <h2 id="friend-management-title" className="modal-title">{isKo ? '친구 관리' : 'Manage friend'}</h2>
              <p className="modal-copy">{isKo ? '친구를 연결하면 배틀 점수와 공동 목표를 함께 볼 수 있어요.' : 'Connect a friend to share battle scores and shared goals.'}</p>
              <div className="friend-sheet-code-card"><span>{isKo ? '내 초대 코드' : 'My invite code'}</span><strong>{profile?.friend_code ?? '--------'}</strong></div>
              {friendProfile ? (
                <div className="friend-sheet-current-card">
                  <div><span>{isKo ? '현재 연결된 친구' : 'Current friend'}</span><strong>{opponentLabel}</strong></div>
                  <button className="danger-button" type="button" onClick={() => setDisconnectOpen(true)} disabled={pendingAction === 'friend-disconnect'}>{isKo ? '친구 연결 해제' : 'Remove friend'}</button>
                </div>
              ) : (
                <form className="friend-sheet-connect-form" onSubmit={handleConnectFriend}>
                  <label className="field-group" htmlFor="battle-friend-code"><span>{isKo ? '친구 코드 입력' : 'Friend code'}</span><input id="battle-friend-code" type="text" placeholder={isKo ? '초대 코드 입력' : 'Enter invite code'} value={inviteCode} onChange={(event) => setInviteCode(normalizeFriendCode(event.target.value))} maxLength={12} /></label>
                  <button className="primary-button" type="submit" disabled={pendingAction === 'friend-connect'}>{pendingAction === 'friend-connect' ? (isKo ? '연결 중...' : 'Connecting...') : (isKo ? '친구 추가' : 'Add friend')}</button>
                </form>
              )}
              <div className="modal-actions">
                <Link className="secondary-button modal-link-button" to="/friends" onClick={() => setFriendSheetOpen(false)}>{isKo ? '친구 화면 열기' : 'Open Friends'}</Link>
                <button className="primary-button" type="button" onClick={() => setFriendSheetOpen(false)}>{isKo ? '닫기' : 'Close'}</button>
              </div>
            </div>
          </div>
        )}

        {disconnectOpen && (
          <div className="modal-backdrop" role="presentation" onClick={() => pendingAction !== 'friend-disconnect' && setDisconnectOpen(false)}>
            <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="disconnect-friend-title" onClick={(event) => event.stopPropagation()}>
              <h2 id="disconnect-friend-title" className="modal-title">{isKo ? '친구 연결을 해제할까요?' : 'Remove this friend connection?'}</h2>
              <p className="modal-copy">{isKo ? '배틀과 공동 목표 비교도 함께 사라질 수 있어요.' : 'Battle and shared goal comparisons may stop appearing as well.'}</p>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setDisconnectOpen(false)} disabled={pendingAction === 'friend-disconnect'}>{isKo ? '취소' : 'Cancel'}</button>
                <button className="danger-button" type="button" onClick={handleDisconnectFriend} disabled={pendingAction === 'friend-disconnect'}>{pendingAction === 'friend-disconnect' ? (isKo ? '해제 중...' : 'Removing...') : (isKo ? '확인' : 'Confirm')}</button>
              </div>
            </div>
          </div>
        )}

        <BottomTabBar />
      </div>
    </div>
  );
}
