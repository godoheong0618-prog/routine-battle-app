import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import { MessageKey, MessageVars } from '../i18n/messages';
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

type TranslateFn = (key: MessageKey, vars?: MessageVars) => string;

function buildBattleCopy({
  hasFriend,
  friendName,
  myName,
  difference,
  remainingActions,
  t,
}: {
  hasFriend: boolean;
  friendName: string;
  myName: string;
  difference: number;
  remainingActions: number;
  t: TranslateFn;
}) {
  if (!hasFriend) {
    return {
      headline: t('home.battleCopy.noFriendHeadline'),
      detail: t('home.battleCopy.noFriendDetail'),
    };
  }

  if (difference === 0) {
    return {
      headline: t('home.battleCopy.tiedHeadline'),
      detail:
        remainingActions > 0
          ? t('home.battleCopy.tiedDetailActive')
          : t('home.battleCopy.tiedDetailDone'),
    };
  }

  if (difference > 0) {
    return {
      headline: t('home.battleCopy.leadingHeadline', { name: myName, points: difference }),
      detail:
        remainingActions > 0
          ? t('home.battleCopy.leadingDetailActive')
          : t('home.battleCopy.leadingDetailDone'),
    };
  }

  return {
    headline: t('home.battleCopy.trailingHeadline', {
      name: friendName,
      points: Math.abs(difference),
    }),
    detail:
      remainingActions > 0
        ? t('home.battleCopy.trailingDetailActive')
        : t('home.battleCopy.trailingDetailDone'),
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
  const { t } = useLanguage();

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
        loadNotice = t('home.loadTasksError');

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
          loadNotice = t('home.loadHistoryError');

          if (active) {
            setCheckins([]);
          }
        } else if (active) {
          setCheckins((data as CheckinRow[]) ?? []);
        }
      } else {
        console.warn('Home checkins load failed:', checkinsResult.reason);
        loadNotice = t('home.loadHistoryError');

        if (active) {
          setCheckins([]);
        }
      }

      let loadedSharedGoals: SharedGoalRow[] = [];

      if (sharedGoalsResult.status === 'fulfilled') {
        const { data, error } = sharedGoalsResult.value;

        if (error) {
          console.warn('Home shared goals load failed:', error);
          loadNotice = loadNotice || t('home.loadBattleError');

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
        loadNotice = loadNotice || t('home.loadBattleError');

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
          loadNotice = loadNotice || t('home.loadSharedError');

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
  }, [navigate, t]);

  const profileName = profile?.nickname || t('common.me');
  const friendName = friendProfile?.nickname || t('common.friend');

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
      meta: routine.description || t('home.goalMeta', { count: routine.target_count ?? 1 }),
    }));
  }, [completedRoutineIds, t, todayRoutines]);

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

      let statusText = t('home.sharedStatus.none');

      if (myDoneToday && friendDoneToday) {
        statusText = t('home.sharedStatus.both');
      } else if (myDoneToday) {
        statusText = t('home.sharedStatus.mine', {
          mine: profileName,
          friend: friendName,
        });
      } else if (friendDoneToday) {
        statusText = t('home.sharedStatus.friend', {
          friend: friendName,
        });
      }

      return {
        ...goal,
        myDoneToday,
        friendDoneToday,
        statusText,
      };
    });
  }, [friendName, friendProfile, profileName, sharedGoalCheckins, sharedGoals, t, todayKey, userId]);

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

  const battleCopy = useMemo(
    () =>
      buildBattleCopy({
        hasFriend: Boolean(friendProfile),
        friendName,
        myName: profileName,
        difference: battleSummary.difference,
        remainingActions: remainingBattleActions,
        t,
      }),
    [battleSummary.difference, friendName, friendProfile, profileName, remainingBattleActions, t]
  );

  const sharedGoalPreview = sharedGoalViews.slice(0, 1);
  const battleDifferenceText = !friendProfile
    ? t('home.battleWaiting')
    : battleSummary.difference === 0
      ? t('home.battleTied')
      : t('home.battleDifference', { points: Math.abs(battleSummary.difference) });

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
      showToast(t('home.saveError'));
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

    const confirmed = window.confirm(t('home.deleteConfirm'));

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
      showToast(t('home.deleteError'));
      setPendingAction('');
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));
    setCheckins((current) =>
      current.filter((checkin) => !(checkin.user_id === userId && String(checkin.routine_id) === String(routineId)))
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
              <p className="section-eyebrow">{t('home.eyebrow')}</p>
              <h1 className="home-streak-title">
                {t('home.summaryTitle', { done: completedCount, total: personalGoals.length })}
              </h1>
              <p className="hero-subtitle">
                {personalGoals.length === 0
                  ? t('home.summaryEmpty')
                  : t('home.summaryProgress', { progress, streak })}
              </p>
            </div>

            <Link className="home-bell-button home-profile-shortcut" to="/mypage" aria-label={t('home.myPageAria')}>
              {profile?.nickname?.slice(0, 1)?.toUpperCase() || 'MY'}
            </Link>
          </div>

          <div className="progress-card progress-card-soft">
            <div className="progress-card-header">
              <span>{t('home.progressLabel')}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="summary-chip-row">
            <article className="summary-chip">
              <span>{t('home.streakLabel')}</span>
              <strong>{t('home.streakValue', { count: streak })}</strong>
            </article>
            <article className="summary-chip">
              <span>{t('home.leftLabel')}</span>
              <strong>{t('home.leftValue', { count: remainingCount })}</strong>
            </article>
            <article className="summary-chip">
              <span>{t('home.battleLabel')}</span>
              <strong>{battleDifferenceText}</strong>
            </article>
          </div>
        </header>

        <main className="home-content home-content-polished">
          <section className="home-section">
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
              <Link to="/create-routine">{t('home.add')}</Link>
            </div>

            {personalGoals.length === 0 ? (
              <article className="empty-state-card">
                <h3>{t('home.tasksEmptyTitle')}</h3>
                <p>{t('home.tasksEmptyBody')}</p>
                <Link className="inline-action-link" to="/create-routine">
                  {t('home.addRoutine')}
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
                            ? t('home.saving')
                            : goal.completed
                              ? t('home.undo')
                              : t('home.complete')}
                        </button>

                        <details className="task-menu">
                          <summary
                            className="task-menu-trigger"
                            aria-label={t('home.menuAria', { title: goal.title })}
                          >
                            <span />
                            <span />
                            <span />
                          </summary>

                          <div className="task-menu-popover">
                            <Link className="task-menu-item" to={`/create-routine?id=${goal.id}`}>
                              {t('home.edit')}
                            </Link>
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
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('home.battleTitle')}</h2>
                <p className="section-description">{battleCopy.detail}</p>
              </div>
              <Link to={friendProfile ? '/battle' : '/friends'}>
                {friendProfile ? t('home.battleLinkDetails') : t('home.battleLinkConnect')}
              </Link>
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
                <p className="section-eyebrow">{t('home.battleThisWeek')}</p>
                <h3 className="battle-title battle-title-large">{battleCopy.headline}</h3>
                <p className="battle-score battle-score-tight">{battleCopy.detail}</p>
              </div>

              <div className="home-battle-score-grid">
                <article className="home-battle-score">
                  <span>{profileName}</span>
                  <strong>{t('home.scoreValue', { points: battleSummary.myScore })}</strong>
                </article>
                <article className="home-battle-score">
                  <span>{friendName}</span>
                  <strong>{t('home.scoreValue', { points: friendProfile ? battleSummary.friendScore : 0 })}</strong>
                </article>
              </div>
            </article>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>{t('home.connectFriendTitle')}</h3>
                <p>{t('home.connectFriendBody')}</p>
                <Link className="inline-action-link" to="/friends">
                  {t('home.connectFriendAction')}
                </Link>
              </article>
            ) : sharedGoalViews.length === 0 ? (
              <article className="empty-state-card">
                <h3>{t('home.noSharedGoalsTitle')}</h3>
                <p>{t('home.noSharedGoalsBody')}</p>
                <Link className="inline-action-link" to="/battle">
                  {t('home.createSharedGoal')}
                </Link>
              </article>
            ) : (
              <div className="battle-goal-list">
                {sharedGoalPreview.map((goal) => (
                  <article key={goal.id} className="battle-goal-card">
                    <div className="battle-goal-header">
                      <div>
                        <h3>{goal.title}</h3>
                        <p>{goal.description || t('home.sharedFallback')}</p>
                      </div>
                      <span className="proof-pill">{t('home.scoreValue', { points: goal.points ?? 3 })}</span>
                    </div>

                    <p className="battle-goal-status">{goal.statusText}</p>

                    <div className="summary-chip-row">
                      <article className="summary-chip">
                        <span>{t('home.sharedMeLabel')}</span>
                        <strong>{goal.myDoneToday ? t('home.sharedDone') : t('home.sharedNotYet')}</strong>
                      </article>
                      <article className="summary-chip">
                        <span>{friendName}</span>
                        <strong>{goal.friendDoneToday ? t('home.sharedDone') : t('home.sharedWaiting')}</strong>
                      </article>
                      <article className="summary-chip">
                        <span>{t('home.sharedNextLabel')}</span>
                        <strong>{goal.myDoneToday ? t('home.sharedViewBattle') : t('home.sharedYourMove')}</strong>
                      </article>
                    </div>
                  </article>
                ))}

                <Link className="inline-action-link inline-action-link-light" to="/battle">
                  {t('home.openBattleDetails')}
                </Link>
              </div>
            )}
          </section>
        </main>

        <Link className="fab-button fab-button-extended" to="/create-routine" aria-label={t('home.addRoutine')}>
          + {t('home.addRoutine')}
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
