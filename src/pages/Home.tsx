import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import {
  CheckinRow,
  ProfileRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  calculateStreak,
  ensureProfile,
  fetchProfile,
  formatRoutineSchedule,
  getTodayDayKey,
  getTodayKey,
  isRoutineVisibleToday,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type PersonalGoalView = RoutineRow & {
  completed: boolean;
  meta: string;
};

type SharedGoalView = SharedGoalRow & {
  myDoneToday: boolean;
  friendDoneToday: boolean;
  statusText: string;
};

type ToastState = {
  id: number;
  message: string;
};

function buildBattleCopy({
  hasFriend,
  friendName,
  myName,
  difference,
  remainingActions,
}: {
  hasFriend: boolean;
  friendName: string;
  myName: string;
  difference: number;
  remainingActions: number;
}) {
  if (!hasFriend) {
    return {
      headline: '친구를 연결하고 배틀을 시작해 보세요',
      detail: '이번 주 점수와 공동 목표는 친구를 연결하면 바로 보여요.',
    };
  }

  if (difference === 0) {
    return {
      headline: '지금 동점이에요',
      detail:
        remainingActions > 0
          ? '오늘 체크 하나가 승부를 가를 수 있어요.'
          : '오늘 할 일은 모두 끝냈어요. 내일 다시 점수를 쌓아봐요.',
    };
  }

  if (difference > 0) {
    return {
      headline: `${myName}이 ${difference}점 앞서고 있어요`,
      detail:
        remainingActions > 0
          ? '지금 페이스 좋아요. 남은 체크만 마무리하면 돼요.'
          : '오늘 할 일은 모두 끝냈어요. 이 흐름을 유지해 보세요.',
    };
  }

  return {
    headline: `${friendName}이 ${Math.abs(difference)}점 앞서고 있어요`,
    detail:
      remainingActions > 0
        ? '오늘 하나만 더 하면 역전 가능해요.'
        : '지금은 따라갈 체크가 없어요. 공동 목표를 다시 확인해 보세요.',
  };
}

export default function Home() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const navigate = useNavigate();

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

      let ensuredProfile: ProfileRow | null = null;
      let connectedFriend: ProfileRow | null = null;
      let homeLoadMessage = '';

      try {
        ensuredProfile = await ensureProfile(user);
        connectedFriend = await fetchProfile(ensuredProfile.friend_id);

        if (!active) {
          return;
        }

        setProfile(ensuredProfile);
        setFriendProfile(connectedFriend);
      } catch (loadError) {
        console.warn('Home profile load failed:', loadError);
        homeLoadMessage = '홈 정보를 일부 불러오지 못했어요.';

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
      }

      try {
        const { data, error } = await supabase.from('routines').select('*').eq('user_id', user.id);

        if (error) {
          throw error;
        }

        if (active) {
          setRoutines((data as RoutineRow[]) ?? []);
        }
      } catch (loadError) {
        console.warn('Home routines load failed:', loadError);
        homeLoadMessage = '오늘 할 일을 불러오지 못했어요.';

        if (active) {
          setRoutines([]);
        }
      }

      const relatedUserIds =
        ensuredProfile && connectedFriend ? [user.id, connectedFriend.id] : [user.id];

      const [checkinsResult, sharedGoalsResult] = await Promise.allSettled([
        supabase.from('checkins').select('user_id, routine_id, check_date').in('user_id', relatedUserIds),
        supabase.from('shared_goals').select('*').or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`),
      ]);

      if (checkinsResult.status === 'fulfilled') {
        const { data, error } = checkinsResult.value;

        if (error) {
          console.warn('Home checkins load failed:', error);
          homeLoadMessage = '체크 기록을 최신 상태로 불러오지 못했어요.';
          if (active) {
            setCheckins([]);
          }
        } else if (active) {
          setCheckins((data as CheckinRow[]) ?? []);
        }
      } else {
        console.warn('Home checkins load failed:', checkinsResult.reason);
        homeLoadMessage = '체크 기록을 최신 상태로 불러오지 못했어요.';
        if (active) {
          setCheckins([]);
        }
      }

      let loadedSharedGoals: SharedGoalRow[] = [];

      if (sharedGoalsResult.status === 'fulfilled') {
        const { data, error } = sharedGoalsResult.value;

        if (error) {
          console.warn('Home shared goals load failed:', error);
          homeLoadMessage = homeLoadMessage || '배틀 정보를 일부 불러오지 못했어요.';
          if (active) {
            setSharedGoals([]);
          }
        } else {
          loadedSharedGoals = (data as SharedGoalRow[]) ?? [];
          if (active) {
            setSharedGoals(loadedSharedGoals);
          }
        }
      } else {
        console.warn('Home shared goals load failed:', sharedGoalsResult.reason);
        homeLoadMessage = homeLoadMessage || '배틀 정보를 일부 불러오지 못했어요.';
        if (active) {
          setSharedGoals([]);
        }
      }

      if (loadedSharedGoals.length > 0) {
        try {
          const goalIds = loadedSharedGoals.map((goal) => goal.id);
          const { data, error } = await supabase
            .from('shared_goal_checkins')
            .select('goal_id, user_id, check_date')
            .in('goal_id', goalIds)
            .in('user_id', relatedUserIds);

          if (error) {
            throw error;
          }

          if (active) {
            setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
          }
        } catch (loadError) {
          console.warn('Home shared goal checkins load failed:', loadError);
          homeLoadMessage = homeLoadMessage || '공동 목표 진행 상태를 불러오지 못했어요.';
          if (active) {
            setSharedGoalCheckins([]);
          }
        }
      } else if (active) {
        setSharedGoalCheckins([]);
      }

      if (active) {
        if (homeLoadMessage) {
          setToast({ id: Date.now(), message: homeLoadMessage });
        }
        setLoading(false);
      }
    };

    loadHome();

    return () => {
      active = false;
    };
  }, [navigate]);

  const profileName = profile?.nickname || '나';
  const friendName = friendProfile?.nickname || '친구';

  const todayRoutines = useMemo(
    () => routines.filter((routine) => isRoutineVisibleToday(routine, todayDayKey)),
    [routines, todayDayKey]
  );

  const myCheckins = useMemo(
    () => checkins.filter((checkin) => checkin.user_id === userId),
    [checkins, userId]
  );

  const completedRoutineIds = useMemo(() => {
    return new Set(
      myCheckins
        .filter((checkin) => checkin.check_date === todayKey)
        .map((checkin) => String(checkin.routine_id))
    );
  }, [myCheckins, todayKey]);

  const personalGoals = useMemo<PersonalGoalView[]>(() => {
    return todayRoutines.map((routine) => ({
      ...routine,
      completed: completedRoutineIds.has(String(routine.id)),
      meta: routine.description || `${formatRoutineSchedule(routine)} · ${routine.target_count ?? 1}회 목표`,
    }));
  }, [completedRoutineIds, todayRoutines]);

  const sharedGoalViews = useMemo<SharedGoalView[]>(() => {
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

      let statusText = '둘 다 아직 시작 전이에요.';

      if (myDoneToday && friendDoneToday) {
        statusText = '둘 다 완료했어요.';
      } else if (myDoneToday) {
        statusText = `나는 완료했고 ${friendName}를 기다리는 중이에요.`;
      } else if (friendDoneToday) {
        statusText = `${friendName}는 완료했어요. 지금 따라가 보세요.`;
      }

      return {
        ...goal,
        myDoneToday,
        friendDoneToday,
        statusText,
      };
    });
  }, [friendName, friendProfile, sharedGoalCheckins, sharedGoals, todayKey, userId]);

  const battleSummary = useMemo(() => {
    return calculateBattleScores({
      currentUserId: userId,
      friendId: friendProfile?.id ?? null,
      checkins,
      sharedGoalCheckins,
      sharedGoals,
    });
  }, [checkins, friendProfile?.id, sharedGoalCheckins, sharedGoals, userId]);

  const streak = useMemo(() => calculateStreak(myCheckins), [myCheckins]);
  const completedCount = personalGoals.filter((goal) => goal.completed).length;
  const remainingCount = Math.max(personalGoals.length - completedCount, 0);
  const progress = personalGoals.length === 0 ? 0 : Math.round((completedCount / personalGoals.length) * 100);
  const remainingBattleActions =
    personalGoals.filter((goal) => !goal.completed).length + sharedGoalViews.filter((goal) => !goal.myDoneToday).length;
  const battleCopy = buildBattleCopy({
    hasFriend: Boolean(friendProfile),
    friendName,
    myName: profileName,
    difference: battleSummary.difference,
    remainingActions: remainingBattleActions,
  });
  const sharedGoalPreview = sharedGoalViews.slice(0, 2);
  const battleDifferenceText =
    !friendProfile || battleSummary.difference === 0 ? '동점' : `${Math.abs(battleSummary.difference)}점 차`;

  const showToast = (message: string) => {
    setToast({ id: Date.now(), message });
  };

  const handleToggleRoutine = async (routineId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const routineKey = String(routineId);
    const actionKey = `routine-${routineId}`;
    const alreadyCompleted = completedRoutineIds.has(routineKey);
    const optimisticCheckin = {
      user_id: userId,
      routine_id: routineId,
      check_date: todayKey,
    };
    const previousCheckins = checkins;

    setPendingAction(actionKey);
    setCheckins((current) => {
      if (alreadyCompleted) {
        return current.filter(
          (checkin) =>
            !(
              checkin.user_id === userId &&
              String(checkin.routine_id) === routineKey &&
              checkin.check_date === todayKey
            )
        );
      }

      const exists = current.some(
        (checkin) =>
          checkin.user_id === userId &&
          String(checkin.routine_id) === routineKey &&
          checkin.check_date === todayKey
      );

      return exists ? current : [...current, optimisticCheckin];
    });

    let saveError = null;

    if (alreadyCompleted) {
      saveError =
        (
          await supabase
            .from('checkins')
            .delete()
            .eq('user_id', userId)
            .eq('routine_id', routineId)
            .eq('check_date', todayKey)
        ).error ?? null;
    } else {
      saveError =
        (
          await supabase.from('checkins').upsert(optimisticCheckin, {
            onConflict: 'user_id,routine_id,check_date',
            ignoreDuplicates: false,
          })
        ).error ?? null;

      if (saveError?.code === '42P10') {
        saveError = (await supabase.from('checkins').insert(optimisticCheckin)).error ?? null;
      }

      if (saveError?.code === '23505') {
        saveError = null;
      }
    }

    if (saveError) {
      console.warn('Routine checkin save failed:', saveError);
      setCheckins(previousCheckins);
      showToast('저장에 실패했어요. 다시 시도해 주세요.');
      setPendingAction('');
      return;
    }

    setPendingAction('');
  };

  const handleDeleteRoutine = async (routineId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const confirmed = window.confirm('이 루틴을 삭제할까요?');

    if (!confirmed) {
      return;
    }

    setPendingAction(`delete-${routineId}`);

    const { error: checkinDeleteError } = await supabase
      .from('checkins')
      .delete()
      .eq('user_id', userId)
      .eq('routine_id', routineId);

    if (checkinDeleteError) {
      console.warn('Routine checkins delete failed:', checkinDeleteError);
    }

    const { error: routineDeleteError } = await supabase
      .from('routines')
      .delete()
      .eq('id', routineId)
      .eq('user_id', userId);

    if (routineDeleteError) {
      console.warn('Routine delete failed:', routineDeleteError);
      showToast('루틴을 삭제하지 못했어요.');
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    setCheckins((current) =>
      current.filter((checkin) => !(checkin.user_id === userId && String(checkin.routine_id) === String(routineId)))
    );
    showToast('루틴을 삭제했어요.');
    setPendingAction('');
  };

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId || !friendProfile) {
      showToast('친구를 먼저 연결해 주세요.');
      return;
    }

    const actionKey = `shared-${goalId}`;
    const alreadyDone = sharedGoalCheckins.some(
      (checkin) => checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey
    );
    const optimisticCheckin = {
      goal_id: goalId,
      user_id: userId,
      check_date: todayKey,
    };
    const previousCheckins = sharedGoalCheckins;

    setPendingAction(actionKey);
    setSharedGoalCheckins((current) => {
      if (alreadyDone) {
        return current.filter(
          (checkin) => !(checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey)
        );
      }

      const exists = current.some(
        (checkin) => checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey
      );

      return exists ? current : [...current, optimisticCheckin];
    });

    let saveError = null;

    if (alreadyDone) {
      saveError =
        (
          await supabase
            .from('shared_goal_checkins')
            .delete()
            .eq('goal_id', goalId)
            .eq('user_id', userId)
            .eq('check_date', todayKey)
        ).error ?? null;
    } else {
      saveError = (await supabase.from('shared_goal_checkins').insert(optimisticCheckin)).error ?? null;

      if (saveError?.code === '23505') {
        saveError = null;
      }
    }

    if (saveError) {
      console.warn('Shared goal checkin save failed:', saveError);
      setSharedGoalCheckins(previousCheckins);
      showToast('공동 목표 상태를 저장하지 못했어요.');
      setPendingAction('');
      return;
    }

    setPendingAction('');
  };

  const handleSendNudge = async (goalTitle?: string) => {
    if (!userId || !friendProfile) {
      showToast('친구를 먼저 연결해 주세요.');
      return;
    }

    const { error } = await supabase.from('nudges').insert({
      sender_id: userId,
      receiver_id: friendProfile.id,
      message: goalTitle ? `${goalTitle} 아직 안 했지?` : '오늘 루틴 아직 안 했지?',
    });

    if (error) {
      console.warn('Nudge insert failed:', error);
      showToast('찌르기를 보내지 못했어요.');
      return;
    }

    showToast(`${friendName}에게 찌르기를 보냈어요.`);
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
              <p className="section-eyebrow">오늘 진행 상황</p>
              <h1 className="home-streak-title">
                오늘 {completedCount} / {personalGoals.length} 완료
              </h1>
              <p className="hero-subtitle">
                {personalGoals.length === 0
                  ? '오늘 체크할 루틴이 없어요. 새 루틴을 추가해 보세요.'
                  : `진행률 ${progress}% · ${streak}일 연속`}
              </p>
            </div>

            <Link className="home-bell-button home-profile-shortcut" to="/mypage" aria-label="마이페이지">
              {profile?.nickname?.slice(0, 1) || 'MY'}
            </Link>
          </div>

          <div className="progress-card progress-card-soft">
            <div className="progress-card-header">
              <span>오늘 진행률</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="summary-chip-row">
            <article className="summary-chip">
              <span>스트릭</span>
              <strong>{streak}일</strong>
            </article>
            <article className="summary-chip">
              <span>남은 할 일</span>
              <strong>{remainingCount}개</strong>
            </article>
            <article className="summary-chip">
              <span>배틀</span>
              <strong>{friendProfile ? battleDifferenceText : '대기 중'}</strong>
            </article>
          </div>
        </header>

        <main className="home-content home-content-polished">
          <section className="home-section">
            <div className="section-header section-header-stack">
              <div>
                <h2>오늘 할 일</h2>
                <p className="section-description">
                  {personalGoals.length === 0
                    ? '아직 오늘 할 일이 없어요.'
                    : remainingCount === 0
                      ? '오늘 할 일을 모두 끝냈어요.'
                      : `지금 바로 체크할 루틴 ${remainingCount}개가 남아 있어요.`}
                </p>
              </div>
              <Link to="/create-routine">추가</Link>
            </div>

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>아직 오늘 할 일이 없어요.</h3>
                <p>루틴을 추가하면 홈에서 바로 완료 체크를 할 수 있어요.</p>
                <Link className="inline-action-link" to="/create-routine">
                  루틴 추가하기
                </Link>
              </article>
            ) : (
              <div className="today-task-list">
                {personalGoals.map((goal) => (
                  <article
                    key={goal.id}
                    className={goal.completed ? 'home-task-card home-task-card-completed' : 'home-task-card'}
                  >
                    <div className={goal.completed ? 'goal-check goal-check-completed' : 'goal-check'}>
                      {goal.completed ? '✓' : ''}
                    </div>

                    <div className="home-task-main">
                      <div className="goal-copy">
                        <h3>{goal.title}</h3>
                        <p>{goal.meta}</p>
                      </div>

                      <div className="home-task-actions">
                        <button
                          className="primary-button home-task-button"
                          type="button"
                          onClick={() => handleToggleRoutine(goal.id)}
                          disabled={
                            pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`
                          }
                        >
                          {pendingAction === `routine-${goal.id}`
                            ? '저장 중...'
                            : goal.completed
                              ? '완료 취소'
                              : '완료'}
                        </button>

                        <details className="task-menu">
                          <summary className="task-menu-trigger" aria-label={`${goal.title} 관리 메뉴`}>
                            <span />
                            <span />
                            <span />
                          </summary>

                          <div className="task-menu-popover">
                            <Link className="task-menu-item" to={`/create-routine?id=${goal.id}`}>
                              수정
                            </Link>
                            <button
                              className="task-menu-item task-menu-item-danger"
                              type="button"
                              onClick={() => handleDeleteRoutine(goal.id)}
                              disabled={pendingAction === `delete-${goal.id}`}
                            >
                              {pendingAction === `delete-${goal.id}` ? '삭제 중...' : '삭제'}
                            </button>
                          </div>
                        </details>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="section-header section-header-stack">
              <div>
                <h2>친구 배틀</h2>
                <p className="section-description">{battleCopy.detail}</p>
              </div>
              <Link to={friendProfile ? '/battle' : '/friends'}>{friendProfile ? '자세히' : '연결'}</Link>
            </div>

            <article
              className={
                friendProfile
                  ? battleSummary.difference > 0
                    ? 'home-battle-overview home-battle-overview-leading'
                    : battleSummary.difference < 0
                      ? 'home-battle-overview home-battle-overview-trailing'
                      : 'home-battle-overview home-battle-overview-tied'
                  : 'home-battle-overview'
              }
            >
              <div className="home-battle-copy">
                <p className="section-eyebrow">이번 주 점수</p>
                <h3 className="battle-title battle-title-large">{battleCopy.headline}</h3>
                <p className="battle-score battle-score-tight">{battleCopy.detail}</p>
              </div>

              <div className="home-battle-score-grid">
                <article className="home-battle-score">
                  <span>{profileName}</span>
                  <strong>{battleSummary.myScore}점</strong>
                </article>
                <article className="home-battle-score">
                  <span>{friendName}</span>
                  <strong>{friendProfile ? battleSummary.friendScore : 0}점</strong>
                </article>
              </div>
            </article>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>친구를 연결하면 배틀이 시작돼요.</h3>
                <p>초대 코드로 연결하면 점수 차이와 공동 목표를 바로 볼 수 있어요.</p>
                <Link className="inline-action-link" to="/friends">
                  친구 연결하러 가기
                </Link>
              </article>
            ) : sharedGoalViews.length === 0 ? (
              <article className="empty-state-card">
                <h3>아직 공동 목표가 없어요.</h3>
                <p>{friendName}와 함께 체크할 목표를 만들면 배틀이 더 재미있어져요.</p>
                <Link className="inline-action-link" to="/battle">
                  공동 목표 만들기
                </Link>
              </article>
            ) : (
              <div className="battle-goal-list">
                {sharedGoalPreview.map((goal) => (
                  <article key={goal.id} className="battle-goal-card">
                    <div className="battle-goal-header">
                      <div>
                        <h3>{goal.title}</h3>
                        <p>{goal.description || '친구와 함께 체크하는 공동 목표예요.'}</p>
                      </div>
                      <span className="proof-pill">+{goal.points ?? 3}점</span>
                    </div>

                    <p className="battle-goal-status">{goal.statusText}</p>

                    <div className="battle-goal-actions">
                      <button
                        className="primary-button battle-goal-button"
                        type="button"
                        onClick={() => handleToggleSharedGoal(goal.id)}
                        disabled={pendingAction === `shared-${goal.id}`}
                      >
                        {pendingAction === `shared-${goal.id}`
                          ? '저장 중...'
                          : goal.myDoneToday
                            ? '완료 취소'
                            : '나도 완료'}
                      </button>
                      <button className="text-button battle-goal-nudge" type="button" onClick={() => handleSendNudge(goal.title)}>
                        찌르기
                      </button>
                    </div>
                  </article>
                ))}

                {sharedGoalViews.length > sharedGoalPreview.length && (
                  <Link className="inline-action-link inline-action-link-light" to="/battle">
                    공동 목표 전체 보기
                  </Link>
                )}
              </div>
            )}
          </section>
        </main>

        <Link className="fab-button fab-button-extended" to="/create-routine" aria-label="루틴 추가">
          + 루틴 추가
        </Link>

        {toast && (
          <div className="home-toast" role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        <BottomTabBar />
      </div>
    </div>
  );
}
