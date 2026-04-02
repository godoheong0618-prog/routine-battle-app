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
      headline: 'Connect a friend to start the battle',
      detail: 'Weekly score and shared goals will show up here once you connect.',
    };
  }

  if (difference === 0) {
    return {
      headline: 'You are tied right now',
      detail:
        remainingActions > 0
          ? 'One more check today can put you in front.'
          : 'Today is done. Come back tomorrow and race again.',
    };
  }

  if (difference > 0) {
    return {
      headline: `${myName} is ahead by ${difference}`,
      detail:
        remainingActions > 0
          ? 'The momentum is good. Finish the rest to hold the lead.'
          : 'You finished today strong. Keep the streak going.',
    };
  }

  return {
    headline: `${friendName} is ahead by ${Math.abs(difference)}`,
    detail:
      remainingActions > 0
        ? 'One more action today could flip the lead.'
        : 'Today is done. Check the battle screen for shared goals.',
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
      let loadNotice = '';

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
        loadNotice = 'We could not load your profile.';

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
        loadNotice = 'We could not load today tasks.';

        if (active) {
          setRoutines([]);
        }
      }

      const relatedUserIds =
        ensuredProfile && connectedFriend ? [user.id, connectedFriend.id] : [user.id];

      const [checkinsResult, sharedGoalsResult] = await Promise.allSettled([
        supabase.from('checkins').select('user_id, routine_id, check_in_date').in('user_id', relatedUserIds),
        supabase.from('shared_goals').select('*').or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`),
      ]);

      if (checkinsResult.status === 'fulfilled') {
        const { data, error } = checkinsResult.value;

        if (error) {
          console.warn('Home checkins load failed:', error);
          loadNotice = 'We could not refresh your completion history.';
          if (active) {
            setCheckins([]);
          }
        } else if (active) {
          setCheckins((data as CheckinRow[]) ?? []);
        }
      } else {
        console.warn('Home checkins load failed:', checkinsResult.reason);
        loadNotice = 'We could not refresh your completion history.';
        if (active) {
          setCheckins([]);
        }
      }

      let loadedSharedGoals: SharedGoalRow[] = [];

      if (sharedGoalsResult.status === 'fulfilled') {
        const { data, error } = sharedGoalsResult.value;

        if (error) {
          console.warn('Home shared goals load failed:', error);
          loadNotice = loadNotice || 'We could not load battle info.';
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
        loadNotice = loadNotice || 'We could not load battle info.';
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
          loadNotice = loadNotice || 'We could not load shared goal progress.';
          if (active) {
            setSharedGoalCheckins([]);
          }
        }
      } else if (active) {
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
  }, [navigate]);

  const profileName = profile?.nickname || 'Me';
  const friendName = friendProfile?.nickname || 'Friend';

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
        .filter((checkin) => checkin.check_in_date === todayKey)
        .map((checkin) => String(checkin.routine_id))
    );
  }, [myCheckins, todayKey]);

  const personalGoals = useMemo<PersonalGoalView[]>(() => {
    return todayRoutines.map((routine) => ({
      ...routine,
      completed: completedRoutineIds.has(String(routine.id)),
      meta: routine.description || `${formatRoutineSchedule(routine)} · target ${routine.target_count ?? 1}`,
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

      let statusText = 'Nobody has started this shared goal yet.';

      if (myDoneToday && friendDoneToday) {
        statusText = 'Both of you completed it today.';
      } else if (myDoneToday) {
        statusText = `${profileName} is done. Waiting on ${friendName}.`;
      } else if (friendDoneToday) {
        statusText = `${friendName} finished first. You can still catch up.`;
      }

      return {
        ...goal,
        myDoneToday,
        friendDoneToday,
        statusText,
      };
    });
  }, [friendName, friendProfile, profileName, sharedGoalCheckins, sharedGoals, todayKey, userId]);

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
    personalGoals.filter((goal) => !goal.completed).length +
    sharedGoalViews.filter((goal) => !goal.myDoneToday).length;
  const battleCopy = buildBattleCopy({
    hasFriend: Boolean(friendProfile),
    friendName,
    myName: profileName,
    difference: battleSummary.difference,
    remainingActions: remainingBattleActions,
  });
  const sharedGoalPreview = sharedGoalViews.slice(0, 1);
  const battleDifferenceText =
    !friendProfile || battleSummary.difference === 0 ? 'Tied' : `${Math.abs(battleSummary.difference)} pts`;

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
    const optimisticCheckin: CheckinRow = {
      user_id: userId,
      routine_id: routineId,
      check_in_date: todayKey,
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
              checkin.check_in_date === todayKey
            )
        );
      }

      const exists = current.some(
        (checkin) =>
          checkin.user_id === userId &&
          String(checkin.routine_id) === routineKey &&
          checkin.check_in_date === todayKey
      );

      return exists ? current : [...current, optimisticCheckin];
    });

    let saveError: { code?: string } | null = null;

    if (alreadyCompleted) {
      saveError =
        (
          await supabase
            .from('checkins')
            .delete()
            .eq('user_id', userId)
            .eq('routine_id', routineId)
            .eq('check_in_date', todayKey)
        ).error ?? null;
    } else {
      saveError =
        (
          await supabase.from('checkins').upsert(optimisticCheckin, {
            onConflict: 'user_id,routine_id,check_in_date',
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
      showToast('Could not save completion. Please try again.');
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

    const confirmed = window.confirm('Delete this routine?');

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
      showToast('Could not delete the routine.');
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    setCheckins((current) =>
      current.filter((checkin) => !(checkin.user_id === userId && String(checkin.routine_id) === String(routineId)))
    );
    showToast('Routine deleted.');
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
              <p className="section-eyebrow">Today</p>
              <h1 className="home-streak-title">
                {completedCount} / {personalGoals.length} done
              </h1>
              <p className="hero-subtitle">
                {personalGoals.length === 0
                  ? 'Nothing is scheduled for today yet.'
                  : `${progress}% complete · ${streak} day streak`}
              </p>
            </div>

            <Link className="home-bell-button home-profile-shortcut" to="/mypage" aria-label="My page">
              {profile?.nickname?.slice(0, 1)?.toUpperCase() || 'MY'}
            </Link>
          </div>

          <div className="progress-card progress-card-soft">
            <div className="progress-card-header">
              <span>Today progress</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="summary-chip-row">
            <article className="summary-chip">
              <span>Streak</span>
              <strong>{streak} days</strong>
            </article>
            <article className="summary-chip">
              <span>Left</span>
              <strong>{remainingCount}</strong>
            </article>
            <article className="summary-chip">
              <span>Battle</span>
              <strong>{friendProfile ? battleDifferenceText : 'Waiting'}</strong>
            </article>
          </div>
        </header>

        <main className="home-content home-content-polished">
          <section className="home-section">
            <div className="section-header section-header-stack">
              <div>
                <h2>Today tasks</h2>
                <p className="section-description">
                  {personalGoals.length === 0
                    ? 'There is nothing to do today.'
                    : remainingCount === 0
                      ? 'You finished everything for today.'
                      : `${remainingCount} tasks are ready to complete right now.`}
                </p>
              </div>
              <Link to="/create-routine">Add</Link>
            </div>

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>No tasks for today</h3>
                <p>Add a routine and it will appear here with a single clear completion action.</p>
                <Link className="inline-action-link" to="/create-routine">
                  Add routine
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
                      {goal.completed ? 'OK' : ''}
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
                            ? 'Saving...'
                            : goal.completed
                              ? 'Undo'
                              : 'Complete'}
                        </button>

                        <details className="task-menu">
                          <summary className="task-menu-trigger" aria-label={`${goal.title} menu`}>
                            <span />
                            <span />
                            <span />
                          </summary>

                          <div className="task-menu-popover">
                            <Link className="task-menu-item" to={`/create-routine?id=${goal.id}`}>
                              Edit
                            </Link>
                            <button
                              className="task-menu-item task-menu-item-danger"
                              type="button"
                              onClick={() => handleDeleteRoutine(goal.id)}
                              disabled={pendingAction === `delete-${goal.id}`}
                            >
                              {pendingAction === `delete-${goal.id}` ? 'Deleting...' : 'Delete'}
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
                <h2>Friend battle</h2>
                <p className="section-description">{battleCopy.detail}</p>
              </div>
              <Link to={friendProfile ? '/battle' : '/friends'}>{friendProfile ? 'Details' : 'Connect'}</Link>
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
                <p className="section-eyebrow">This week</p>
                <h3 className="battle-title battle-title-large">{battleCopy.headline}</h3>
                <p className="battle-score battle-score-tight">{battleCopy.detail}</p>
              </div>

              <div className="home-battle-score-grid">
                <article className="home-battle-score">
                  <span>{profileName}</span>
                  <strong>{battleSummary.myScore} pts</strong>
                </article>
                <article className="home-battle-score">
                  <span>{friendName}</span>
                  <strong>{friendProfile ? battleSummary.friendScore : 0} pts</strong>
                </article>
              </div>
            </article>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>No friend connected yet</h3>
                <p>Connect a friend to see score gaps and shared goals here.</p>
                <Link className="inline-action-link" to="/friends">
                  Connect friend
                </Link>
              </article>
            ) : sharedGoalViews.length === 0 ? (
              <article className="empty-state-card">
                <h3>No shared goals yet</h3>
                <p>Create one shared goal and the battle area will feel much more alive.</p>
                <Link className="inline-action-link" to="/battle">
                  Create shared goal
                </Link>
              </article>
            ) : (
              <div className="battle-goal-list">
                {sharedGoalPreview.map((goal) => (
                  <article key={goal.id} className="battle-goal-card">
                    <div className="battle-goal-header">
                      <div>
                        <h3>{goal.title}</h3>
                        <p>{goal.description || 'A shared goal you can chase together.'}</p>
                      </div>
                      <span className="proof-pill">+{goal.points ?? 3} pts</span>
                    </div>

                    <p className="battle-goal-status">{goal.statusText}</p>

                    <div className="summary-chip-row">
                      <article className="summary-chip">
                        <span>Me</span>
                        <strong>{goal.myDoneToday ? 'Done' : 'Not yet'}</strong>
                      </article>
                      <article className="summary-chip">
                        <span>{friendName}</span>
                        <strong>{goal.friendDoneToday ? 'Done' : 'Waiting'}</strong>
                      </article>
                      <article className="summary-chip">
                        <span>Next</span>
                        <strong>{goal.myDoneToday ? 'View battle' : 'Your move'}</strong>
                      </article>
                    </div>
                  </article>
                ))}

                <Link className="inline-action-link inline-action-link-light" to="/battle">
                  Open battle details
                </Link>
              </div>
            )}
          </section>
        </main>

        <Link className="fab-button fab-button-extended" to="/create-routine" aria-label="Add routine">
          + Add routine
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
