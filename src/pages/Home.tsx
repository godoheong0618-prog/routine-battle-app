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
};

export default function Home() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [routineError, setRoutineError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const navigate = useNavigate();

  const todayKey = useMemo(() => getTodayKey(), []);
  const todayDayKey = useMemo(() => getTodayDayKey(), []);

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
      setRoutineError('');

      let ensuredProfile: ProfileRow | null = null;
      let connectedFriend: ProfileRow | null = null;

      try {
        ensuredProfile = await ensureProfile(user);
        connectedFriend = await fetchProfile(ensuredProfile.friend_id);

        if (!active) {
          return;
        }

        setProfile(ensuredProfile);
        setFriendProfile(connectedFriend);
      } catch (loadError) {
        console.warn('Home optional profile load failed:', loadError);

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

        if (active) {
          setRoutines([]);
          setRoutineError('루틴을 불러오지 못했어요.');
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
          console.warn('Home optional checkins load failed:', error);
          if (active) {
            setCheckins([]);
          }
        } else if (active) {
          setCheckins((data as CheckinRow[]) ?? []);
        }
      } else {
        console.warn('Home optional checkins load failed:', checkinsResult.reason);
        if (active) {
          setCheckins([]);
        }
      }

      let loadedSharedGoals: SharedGoalRow[] = [];

      if (sharedGoalsResult.status === 'fulfilled') {
        const { data, error } = sharedGoalsResult.value;

        if (error) {
          console.warn('Home optional shared goals load failed:', error);
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
        console.warn('Home optional shared goals load failed:', sharedGoalsResult.reason);
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
          console.warn('Home optional shared goal checkins load failed:', loadError);
          if (active) {
            setSharedGoalCheckins([]);
          }
        }
      } else if (active) {
        setSharedGoalCheckins([]);
      }

      if (active) {
        setLoading(false);
      }
    };

    loadHome();

    return () => {
      active = false;
    };
  }, [navigate]);

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

  const quickStarts = useMemo(() => {
    return todayRoutines.slice(0, 4).map((routine) => ({
      id: routine.id,
      title: routine.title,
    }));
  }, [todayRoutines]);

  const sharedGoalViews = useMemo<SharedGoalView[]>(() => {
    if (!friendProfile) {
      return [];
    }

    return sharedGoals.map((goal) => ({
      ...goal,
      myDoneToday: sharedGoalCheckins.some(
        (checkin) => checkin.goal_id === goal.id && checkin.user_id === userId && checkin.check_date === todayKey
      ),
      friendDoneToday: sharedGoalCheckins.some(
        (checkin) =>
          checkin.goal_id === goal.id &&
          checkin.user_id === friendProfile.id &&
          checkin.check_date === todayKey
      ),
    }));
  }, [friendProfile, sharedGoalCheckins, sharedGoals, todayKey, userId]);

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
  const totalCount = todayRoutines.length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const displayMyScore = battleSummary.myScore;
  const displayFriendScore = friendProfile ? battleSummary.friendScore : 0;
  const displayDifference = Math.abs(displayMyScore - displayFriendScore);
  const battleLeader = friendProfile
    ? displayMyScore === displayFriendScore
      ? '지금은 동점이에요'
      : displayMyScore > displayFriendScore
        ? `${profile?.nickname || '내가'}가 앞서고 있어요`
        : `${friendName}가 앞서고 있어요`
    : '친구를 연결하면 주간 배틀이 시작돼요';
  const battleScoreText = friendProfile
    ? `나 ${displayMyScore}점 · ${friendName} ${displayFriendScore}점 · ${displayDifference}점 차이`
    : '친구를 연결하면 실제 점수 비교가 시작돼요.';

  const handleToggleRoutine = async (routineId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const routineKey = String(routineId);

    setPendingAction(`routine-${routineId}`);
    setNotice('');

    if (completedRoutineIds.has(routineKey)) {
      const { error } = await supabase
        .from('checkins')
        .delete()
        .eq('user_id', userId)
        .eq('routine_id', routineId)
        .eq('check_date', todayKey);

      if (error) {
        console.warn('Routine checkin delete failed:', error);
        setNotice('완료 상태를 바꾸지 못했어요.');
        setPendingAction('');
        return;
      }

      setCheckins((current) =>
        current.filter(
          (checkin) =>
            !(
              checkin.user_id === userId &&
              String(checkin.routine_id) === routineKey &&
              checkin.check_date === todayKey
            )
        )
      );
      setPendingAction('');
      return;
    }

    const payload = {
      user_id: userId,
      routine_id: routineId,
      check_date: todayKey,
    };

    let saveError =
      (
        await supabase.from('checkins').upsert(payload, {
          onConflict: 'user_id,routine_id,check_date',
          ignoreDuplicates: false,
        })
      ).error ?? null;

    if (saveError?.code === '42P10') {
      saveError = (await supabase.from('checkins').insert(payload)).error ?? null;
    }

    if (saveError && saveError.code !== '23505') {
      console.warn('Routine checkin insert failed:', saveError);
      setNotice('완료 상태를 저장하지 못했어요.');
      setPendingAction('');
      return;
    }

    setCheckins((current) => {
      const alreadyExists = current.some(
        (checkin) =>
          checkin.user_id === userId &&
          String(checkin.routine_id) === routineKey &&
          checkin.check_date === todayKey
      );

      return alreadyExists ? current : [...current, payload];
    });
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
    setNotice('');

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
      setNotice('루틴을 삭제하지 못했어요.');
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    setCheckins((current) =>
      current.filter((checkin) => !(checkin.user_id === userId && String(checkin.routine_id) === String(routineId)))
    );
    setNotice('루틴을 삭제했어요.');
    setPendingAction('');
  };

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    if (!friendProfile) {
      setNotice('친구를 연결한 뒤 공동 목표를 체크할 수 있어요.');
      return;
    }

    setPendingAction(`shared-${goalId}`);
    setNotice('');

    const alreadyDone = sharedGoalCheckins.some(
      (checkin) => checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey
    );

    if (alreadyDone) {
      const { error } = await supabase
        .from('shared_goal_checkins')
        .delete()
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('check_date', todayKey);

      if (error) {
        console.warn('Shared goal checkin delete failed:', error);
        setNotice('공동 목표 상태를 바꾸지 못했어요.');
        setPendingAction('');
        return;
      }

      setSharedGoalCheckins((current) =>
        current.filter(
          (checkin) =>
            !(checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey)
        )
      );
      setPendingAction('');
      return;
    }

    const payload = {
      goal_id: goalId,
      user_id: userId,
      check_date: todayKey,
    };

    const { error } = await supabase.from('shared_goal_checkins').insert(payload);

    if (error) {
      console.warn('Shared goal checkin insert failed:', error);
      setNotice('공동 목표 상태를 저장하지 못했어요.');
      setPendingAction('');
      return;
    }

    setSharedGoalCheckins((current) => [...current, payload]);
    setPendingAction('');
  };

  const handleSendNudge = async (goalTitle?: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    if (!friendProfile) {
      setNotice('친구를 먼저 연결해 주세요.');
      return;
    }

    const { error } = await supabase.from('nudges').insert({
      sender_id: userId,
      receiver_id: friendProfile.id,
      message: goalTitle ? `${goalTitle} 아직 안 했지?` : '오늘 루틴 아직 안 했지?',
    });

    if (error) {
      console.warn('Nudge insert failed:', error);
      setNotice('찌르기를 보내지 못했어요.');
      return;
    }

    setNotice(`${friendName}에게 찌르기를 보냈어요.`);
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen home-screen">
        <header className="home-top-card">
          <div className="hero-top-row">
            <div>
              <p className="section-eyebrow">오늘의 루틴</p>
              <h1 className="home-streak-title">🔥 {streak}일 연속</h1>
              <p className="hero-subtitle">
                오늘 {completedCount} / {totalCount} 완료
              </p>
            </div>
            <button className="home-bell-button" type="button" aria-label="알림">
              •
            </button>
          </div>

          <div className="progress-card progress-card-soft">
            <div className="progress-card-header">
              <span>진행률</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <main className="home-content home-content-polished">
          <section className="battle-card battle-card-polished">
            <div className="battle-copy">
              <p className="battle-label">이번 주 배틀</p>
              <h2 className="battle-title battle-title-large">{battleLeader}</h2>
              <p className="battle-score battle-score-tight">{battleScoreText}</p>
            </div>
            <Link className="battle-rule-card" to={friendProfile ? '/battle' : '/friends'}>
              <span>{friendProfile ? '배틀' : '친구 연결'}</span>
              <strong>{friendProfile ? '공동 목표와 점수를 확인해 보세요' : '친구를 연결하고 실제 배틀을 시작해 보세요'}</strong>
            </Link>
          </section>

          <section className="home-section">
            <div className="section-header">
              <h2>오늘 바로 시작</h2>
              <Link to="/create-routine">+ 추가</Link>
            </div>

            {quickStarts.length === 0 ? (
              <article className="empty-state-card">
                <h3>오늘 표시할 루틴이 아직 없어요</h3>
                <p>샘플 데이터 없이 실제 루틴만 보여줘요. 새 루틴을 추가해 보세요.</p>
                <Link className="inline-action-link" to="/create-routine">
                  루틴 만들기
                </Link>
              </article>
            ) : (
              <div className="quick-grid quick-grid-polished">
                {quickStarts.map((item) => (
                  <button key={item.id} className="quick-chip quick-chip-polished" type="button">
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="section-header">
              <h2>개인 목표</h2>
              <Link to="/create-routine">루틴 추가</Link>
            </div>

            {routineError && <p className="error home-error">{routineError}</p>}
            {notice && <p className="notice-text">{notice}</p>}

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>오늘 보여줄 루틴이 아직 없어요</h3>
                <p>매일 루틴을 만들거나 오늘 요일에 맞는 특정 요일 루틴을 추가해 보세요.</p>
                <Link className="inline-action-link" to="/create-routine">
                  루틴 만들기
                </Link>
              </article>
            ) : (
              <div className="goal-list">
                {personalGoals.map((goal) => (
                  <article key={goal.id} className={goal.completed ? 'goal-card goal-card-completed' : 'goal-card'}>
                    <div className={goal.completed ? 'goal-check goal-check-completed' : 'goal-check'}>
                      {goal.completed ? '✓' : ''}
                    </div>
                    <div className="goal-copy">
                      <h3>{goal.title}</h3>
                      <p>{goal.meta}</p>
                    </div>
                    <div className="goal-actions">
                      <Link className="goal-delete-button" to={`/create-routine?id=${goal.id}`}>
                        수정
                      </Link>
                      <button
                        className="goal-delete-button"
                        type="button"
                        onClick={() => handleDeleteRoutine(goal.id)}
                        disabled={pendingAction === `delete-${goal.id}`}
                      >
                        {pendingAction === `delete-${goal.id}` ? '삭제 중...' : '삭제'}
                      </button>
                      <button
                        className="goal-status-link"
                        type="button"
                        onClick={() => handleToggleRoutine(goal.id)}
                        disabled={pendingAction === `routine-${goal.id}`}
                      >
                        {pendingAction === `routine-${goal.id}` ? '저장 중...' : goal.completed ? '완료 취소' : '완료'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="section-header">
              <h2>공동 목표</h2>
              <Link to={friendProfile ? '/battle' : '/friends'}>{friendProfile ? '배틀 관리' : '친구 연결'}</Link>
            </div>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>공동 목표는 친구 연결 후 사용할 수 있어요</h3>
                <p>데모 목표 없이 실제 친구와 만든 공동 목표만 이곳에 표시돼요.</p>
                <Link className="inline-action-link" to="/friends">
                  친구 연결하러 가기
                </Link>
              </article>
            ) : sharedGoalViews.length === 0 ? (
              <article className="empty-state-card">
                <h3>아직 공동 목표가 없어요</h3>
                <p>{friendName}와 함께할 목표를 만들면 이곳에 실제 데이터가 쌓여요.</p>
                <Link className="inline-action-link" to="/battle">
                  공동 목표 만들기
                </Link>
              </article>
            ) : (
              <div className="shared-list">
                {sharedGoalViews.map((goal) => (
                  <article key={goal.id} className="shared-card shared-card-polished">
                    <div className="shared-header">
                      <div>
                        <h3>{goal.title}</h3>
                        <p>{goal.description || '같이 달성하면 추가 점수를 얻는 공동 목표예요.'}</p>
                        <span className="shared-status-note">
                          {goal.myDoneToday && goal.friendDoneToday
                            ? '오늘 둘 다 완료했어요.'
                            : goal.friendDoneToday
                              ? `${friendName}가 먼저 완료했어요.`
                              : `${friendName}와 같이 진행 중이에요.`}
                        </span>
                      </div>
                      <span className="proof-pill">+{goal.points ?? 3}점</span>
                    </div>

                    <div className="shared-players">
                      <div className="shared-player-box">
                        <span>나</span>
                        <strong>{goal.myDoneToday ? '완료' : '미완료'}</strong>
                      </div>
                      <div className="shared-player-box">
                        <span>{friendName}</span>
                        <strong>{goal.friendDoneToday ? '완료' : '미완료'}</strong>
                      </div>
                    </div>

                    <div className="shared-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => handleToggleSharedGoal(goal.id)}
                        disabled={pendingAction === `shared-${goal.id}`}
                      >
                        {pendingAction === `shared-${goal.id}` ? '저장 중...' : goal.myDoneToday ? '완료 취소' : '완료하기'}
                      </button>
                      <button className="secondary-button" type="button" onClick={() => handleSendNudge(goal.title)}>
                        찌르기
                      </button>
                    </div>

                    <div className="shared-tags">
                      <span>실제 친구 연결</span>
                      <span>실시간 체크</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <Link className="fab-button" to="/create-routine" aria-label="새 루틴 만들기">
          +
        </Link>

        <BottomTabBar />
      </div>
    </div>
  );
}
