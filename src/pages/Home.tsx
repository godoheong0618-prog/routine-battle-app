import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import {
  CheckinRow,
  DEMO_FRIEND,
  ProfileRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  calculateStreak,
  ensureProfile,
  fetchProfile,
  formatRoutineSchedule,
  getDisplayFriendProfile,
  getTodayDayKey,
  getTodayKey,
  isDemoFriend,
  isRoutineVisibleToday,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

const quickStartDefaults = [
  { id: 'quick-study-30', title: '공부 30분' },
  { id: 'quick-workout-10', title: '운동 10분' },
  { id: 'quick-water-1l', title: '물 1L' },
  { id: 'quick-read-20', title: '독서 20분' },
];

const bonusMissions = [
  { id: 'bonus-1', title: '오늘 개인 목표 3개 완료하면 +2점', point: '+2점' },
  { id: 'bonus-2', title: '공동 목표 둘 다 완료하면 +3점', point: '+3점' },
  { id: 'bonus-3', title: '친구보다 먼저 끝내면 +1점', point: '+1점' },
];

const demoSharedGoals: SharedGoalRow[] = [
  {
    id: 'demo-shared-1',
    owner_id: 'demo-me',
    friend_id: DEMO_FRIEND.id,
    title: '공부 2시간',
    description: '오늘 영어 단어까지 포함',
    points: 3,
  },
  {
    id: 'demo-shared-2',
    owner_id: 'demo-me',
    friend_id: DEMO_FRIEND.id,
    title: '11시 전 취침',
    description: '핸드폰 30분 전 끄기',
    points: 3,
  },
];

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
        setProfile(ensuredProfile);
        setFriendProfile(connectedFriend);
      } catch (error) {
        console.warn('Home optional profile load failed:', error);
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

        setRoutines((data as RoutineRow[]) ?? []);
      } catch (error) {
        console.warn('Home routines load failed:', error);
        setRoutines([]);
        setRoutineError('루틴을 불러오지 못했어요.');
      }

      const relatedUserIds =
        ensuredProfile && connectedFriend ? [user.id, connectedFriend.id] : [user.id];

      const [checkinsResult, sharedGoalsResult] = await Promise.allSettled([
        supabase.from('checkins').select('user_id, routine_id, check_date').in('user_id', relatedUserIds),
        supabase
          .from('shared_goals')
          .select('*')
          .or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`),
      ]);

      if (checkinsResult.status === 'fulfilled') {
        const { data, error } = checkinsResult.value;
        if (error) {
          console.warn('Home optional checkins load failed:', error);
          setCheckins([]);
        } else {
          setCheckins((data as CheckinRow[]) ?? []);
        }
      } else {
        console.warn('Home optional checkins load failed:', checkinsResult.reason);
        setCheckins([]);
      }

      let loadedSharedGoals: SharedGoalRow[] = [];

      if (sharedGoalsResult.status === 'fulfilled') {
        const { data, error } = sharedGoalsResult.value;
        if (error) {
          console.warn('Home optional shared goals load failed:', error);
          setSharedGoals([]);
        } else {
          loadedSharedGoals = (data as SharedGoalRow[]) ?? [];
          setSharedGoals(loadedSharedGoals);
        }
      } else {
        console.warn('Home optional shared goals load failed:', sharedGoalsResult.reason);
        setSharedGoals([]);
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

          setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
        } catch (error) {
          console.warn('Home optional shared goal checkins load failed:', error);
          setSharedGoalCheckins([]);
        }
      } else {
        setSharedGoalCheckins([]);
      }

      setLoading(false);
    };

    loadHome();
  }, [navigate]);

  const displayFriend = useMemo(() => getDisplayFriendProfile(friendProfile), [friendProfile]);
  const usingDemoFriend = isDemoFriend(friendProfile);

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
      myCheckins.filter((checkin) => checkin.check_date === todayKey).map((checkin) => checkin.routine_id)
    );
  }, [myCheckins, todayKey]);

  const personalGoals = useMemo<PersonalGoalView[]>(() => {
    return todayRoutines.map((routine) => ({
      ...routine,
      completed: completedRoutineIds.has(routine.id),
      meta: routine.description || `${formatRoutineSchedule(routine)} · ${routine.target_count ?? 1}회 목표`,
    }));
  }, [completedRoutineIds, todayRoutines]);

  const quickStarts = useMemo(() => {
    if (todayRoutines.length === 0) {
      return quickStartDefaults;
    }

    return todayRoutines.slice(0, 4).map((routine) => ({
      id: routine.id,
      title: routine.title,
    }));
  }, [todayRoutines]);

  const visibleSharedGoals = useMemo(() => {
    return sharedGoals.length > 0 ? sharedGoals : demoSharedGoals;
  }, [sharedGoals]);

  const sharedGoalViews = useMemo<SharedGoalView[]>(() => {
    return visibleSharedGoals.map((goal, index) => ({
      ...goal,
      myDoneToday: sharedGoalCheckins.some(
        (checkin) =>
          checkin.goal_id === goal.id &&
          checkin.user_id === userId &&
          checkin.check_date === todayKey
      ),
      friendDoneToday: friendProfile
        ? sharedGoalCheckins.some(
            (checkin) =>
              checkin.goal_id === goal.id &&
              checkin.user_id === friendProfile.id &&
              checkin.check_date === todayKey
          )
        : index === 0,
    }));
  }, [friendProfile, sharedGoalCheckins, todayKey, userId, visibleSharedGoals]);

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

  const displayMyScore = usingDemoFriend ? Math.max(battleSummary.myScore, completedCount * 2) : battleSummary.myScore;
  const displayFriendScore = usingDemoFriend ? 10 : battleSummary.friendScore;
  const displayDifference = displayMyScore - displayFriendScore;
  const battleLeader =
    displayDifference >= 0 ? `${profile?.nickname ?? '내가'}가 앞서고 있어` : `${displayFriend.nickname || '친구'}가 앞서고 있어`;

  const handleToggleRoutine = async (routineId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    setPendingAction(`routine-${routineId}`);
    setNotice('');

    if (completedRoutineIds.has(routineId)) {
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
            !(checkin.user_id === userId && checkin.routine_id === routineId && checkin.check_date === todayKey)
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

    const { error } = await supabase.from('checkins').insert(payload);

    if (error) {
      console.warn('Routine checkin insert failed:', error);
      setNotice('완료 상태를 저장하지 못했어요.');
      setPendingAction('');
      return;
    }

    setCheckins((current) => [...current, payload]);
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
      current.filter((checkin) => !(checkin.user_id === userId && checkin.routine_id === routineId))
    );
    setNotice('루틴을 삭제했어요.');
    setPendingAction('');
  };

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId) {
      navigate('/login');
      return;
    }

    if (usingDemoFriend) {
      setNotice('재헌과의 공동 목표는 지금 데모 상태로 보여주고 있어요.');
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

    if (usingDemoFriend) {
      setNotice(`재헌에게 "${goalTitle ?? '오늘 루틴'}" 찌르기를 보냈어요. (MVP 데모)`);
      return;
    }

    const { error } = await supabase.from('nudges').insert({
      sender_id: userId,
      receiver_id: displayFriend.id,
      message: goalTitle ? `${goalTitle} 아직 안 했지?` : '아직 안 했지? 오늘 루틴 체크해!',
    });

    if (error) {
      console.warn('Nudge insert failed:', error);
      setNotice('찌르기를 보내지 못했어요.');
      return;
    }

    setNotice(`${displayFriend.nickname || '친구'}에게 찌르기를 보냈어요.`);
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
              🔔
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
              <p className="battle-score battle-score-tight">
                나 {displayMyScore}점 · {displayFriend.nickname || '친구'} {displayFriendScore}점 ·{' '}
                {Math.abs(displayDifference)}점 차이
              </p>
            </div>
            <Link className="battle-rule-card" to="/battle">
              <span>벌칙</span>
              <strong>이번 주 진 사람은 음료 사기</strong>
            </Link>
          </section>

          <section className="home-section">
            <div className="section-header">
              <h2>오늘 바로 시작</h2>
              <Link to="/create-routine">+ 추가</Link>
            </div>
            <div className="quick-grid quick-grid-polished">
              {quickStarts.map((item) => (
                <button key={item.id} className="quick-chip quick-chip-polished" type="button">
                  {item.title}
                </button>
              ))}
            </div>
          </section>

          <section className="home-section">
            <div className="section-header">
              <h2>오늘의 보너스 미션</h2>
              <span className="mission-hint">점수 추가</span>
            </div>
            <div className="bonus-list">
              {bonusMissions.map((mission) => (
                <article key={mission.id} className="bonus-card bonus-card-polished">
                  <span>{mission.title}</span>
                  <strong>{mission.point}</strong>
                </article>
              ))}
            </div>
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
                <h3>오늘 보여줄 루틴이 아직 없어요.</h3>
                <p>매일 루틴을 만들거나 오늘 요일에 맞는 특정 요일 루틴을 추가해보세요.</p>
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
              <Link to="/battle">배틀 관리</Link>
            </div>

            <div className="shared-list">
              {sharedGoalViews.map((goal) => (
                <article key={goal.id} className="shared-card shared-card-polished">
                  <div className="shared-header">
                    <div>
                      <h3>{goal.title}</h3>
                      <p>{goal.description || '같이 달성하면 추가 점수를 얻는 공동 목표예요.'}</p>
                      <span className="shared-status-note">
                        {goal.myDoneToday && goal.friendDoneToday
                          ? '오늘 둘 다 완료했어요. 보너스 점수 가능!'
                          : goal.friendDoneToday
                            ? `${displayFriend.nickname || '친구'}가 먼저 완료했어요.`
                            : `${displayFriend.nickname || '친구'}와 같이 진행 중이에요.`}
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
                      <span>{displayFriend.nickname || '친구'}</span>
                      <strong>{goal.friendDoneToday ? '완료' : '미완료'}</strong>
                    </div>
                  </div>

                  <div className="shared-actions">
                    <button className="primary-button" type="button" onClick={() => handleToggleSharedGoal(goal.id)}>
                      {goal.myDoneToday ? '완료 취소' : '완료하기'}
                    </button>
                    <button className="secondary-button" type="button" onClick={() => handleSendNudge(goal.title)}>
                      찌르기
                    </button>
                  </div>

                  <div className="shared-tags">
                    <span>{usingDemoFriend ? '재헌 더미 연결' : '실제 친구 연결'}</span>
                    <span>메모 가능</span>
                  </div>
                </article>
              ))}
            </div>
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
