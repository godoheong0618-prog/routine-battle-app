import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatOpponentLabel,
  formatOpponentSubject,
  formatSelfLabel,
  formatSelfSubject,
  normalizeDisplayName,
} from '../lib/nameDisplay';
import {
  CheckinRow,
  FriendshipRow,
  ProfileRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  calculateStreak,
  ensureProfile,
  fetchFriendConnection,
  filterSharedGoalsForPair,
  getTodayDayKey,
  getTodayKey,
  isRoutineVisibleToday,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type PersonalGoalView = RoutineRow & {
  completed: boolean;
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
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
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
        loadNotice = loadNotice || t('home.loadTasksError');

        if (active) {
          setRoutines([]);
        }
      }

      const relatedUserIds = currentFriend ? [user.id, currentFriend.id] : [user.id];

      try {
        const { data, error } = await supabase
          .from('checkins')
          .select('user_id, routine_id, check_in_date')
          .in('user_id', relatedUserIds);

        if (error) {
          throw error;
        }

        if (active) {
          setCheckins((data as CheckinRow[]) ?? []);
        }
      } catch (loadError) {
        console.warn('Home checkins load failed:', loadError);
        loadNotice = loadNotice || t('home.loadHistoryError');

        if (active) {
          setCheckins([]);
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
    ? t('home.battleBarScoreLine', {
        me: profileLabel,
        myScore: battleSummary.myScore,
        friend: friendLabel,
        friendScore: battleSummary.friendScore,
      })
    : '';

  const battleWagerText = battleMeta?.wager_text?.trim()
    ? t('home.battleBarWager', { text: battleMeta.wager_text.trim() })
    : t('home.battleBarNoWager');

  const battleSetupTitle = isKo ? '배틀 설정을 저장하면 이번 주 요약이 바로 보여요' : 'Save battle setup to unlock the weekly summary';
  const battleSetupBody = isKo
    ? `${friendLabel}와 연결되었어요. 친구 탭에서 배틀 이름과 내기를 정하면 홈 상단에 바로 반영돼요.`
    : `You are connected with ${friendLabel}. Add a battle name and wager in Friends to show the summary here.`;
  const battleSetupAction = isKo ? '배틀 설정하기' : 'Set up battle';
  const battleChipText = !friendProfile ? t('home.battleWaiting') : hasBattleStarted ? battleDifferenceText : isKo ? '설정 필요' : 'Setup needed';
  const scoreSuffix = isKo ? '점' : 'pts';

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
              <p className="section-eyebrow">{isKo ? '루틴 배틀' : 'Routine battle'}</p>
            </div>

            <Link className="home-bell-button home-profile-shortcut" to="/mypage" aria-label={t('home.myPageAria')}>
              {profileInitial}
            </Link>
          </div>

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
            <p className="section-eyebrow">{t('home.eyebrow')}</p>
            <h1 className="home-streak-title">{t('home.summaryTitle', { done: completedCount, total: personalGoals.length })}</h1>
            <p className="hero-subtitle">
              {personalGoals.length === 0 ? t('home.summaryEmpty') : t('home.summaryProgress', { progress, streak })}
            </p>
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
              <strong>{battleChipText}</strong>
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
                    <div className={goal.completed ? 'goal-check goal-check-completed' : 'goal-check'}>{goal.completed ? '✓' : ''}</div>

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

                      <div className="home-task-actions">
                        <button
                          className="primary-button home-task-button"
                          type="button"
                          onClick={() => handleToggleRoutine(goal.id)}
                          disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                        >
                          {pendingAction === `routine-${goal.id}`
                            ? t('home.saving')
                            : goal.completed
                              ? t('home.undo')
                              : t('home.complete')}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
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
