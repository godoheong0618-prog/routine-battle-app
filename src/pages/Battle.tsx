import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatOpponentLabel,
  formatOpponentSubject,
  formatSelfLabel,
  formatSelfSubject,
} from '../lib/nameDisplay';
import {
  CheckinRow,
  FriendshipRow,
  NudgeRow,
  ProfileRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  ensureProfile,
  fetchFriendshipByUsers,
  fetchProfile,
  getTodayKey,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type SharedGoalView = SharedGoalRow & {
  myDoneToday: boolean;
  friendDoneToday: boolean;
  statusText: string;
};

function buildHeroTitle({
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
    return t('battle.heroWaiting');
  }

  if (leader === 'tied') {
    return t('battle.heroTied');
  }

  if (leader === 'me') {
    return t('battle.heroLeadMe', { name: myLeadName, points: Math.abs(difference) });
  }

  return t('battle.heroLeadFriend', { name: opponentLeadName, points: Math.abs(difference) });
}

function buildStatusLabel(
  leader: 'me' | 'friend' | 'tied' | 'waiting',
  t: ReturnType<typeof useLanguage>['t']
) {
  if (leader === 'me') {
    return t('battle.statusLeading');
  }

  if (leader === 'friend') {
    return t('battle.statusTrailing');
  }

  if (leader === 'tied') {
    return t('battle.statusTied');
  }

  return t('battle.statusWaiting');
}

function buildGoalStatus({
  myDoneToday,
  friendDoneToday,
  t,
}: {
  myDoneToday: boolean;
  friendDoneToday: boolean;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  if (myDoneToday && friendDoneToday) {
    return t('battle.goalStatusBoth');
  }

  if (myDoneToday) {
    return t('battle.goalStatusMine');
  }

  if (friendDoneToday) {
    return t('battle.goalStatusFriend');
  }

  return t('battle.goalStatusNone');
}

export default function Battle() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [battleMeta, setBattleMeta] = useState<FriendshipRow | null>(null);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const todayKey = useMemo(() => getTodayKey(), []);

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

        if (!active) {
          return;
        }

        setProfile(ensuredProfile);

        const connectedFriend = await fetchProfile(ensuredProfile.friend_id);

        if (!active) {
          return;
        }

        setFriendProfile(connectedFriend);

        const friendship = await fetchFriendshipByUsers(user.id, connectedFriend?.id ?? null);

        if (active) {
          setBattleMeta(friendship);
        }

        const relatedUserIds = connectedFriend ? [user.id, connectedFriend.id] : [user.id];

        const [checkinsResult, sharedGoalsResult] = await Promise.allSettled([
          supabase.from('checkins').select('user_id, routine_id, check_in_date').in('user_id', relatedUserIds),
          supabase
            .from('shared_goals')
            .select('*')
            .or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`)
            .order('created_at', { ascending: false }),
        ]);

        let loadedSharedGoals: SharedGoalRow[] = [];

        if (checkinsResult.status === 'fulfilled' && !checkinsResult.value.error) {
          setCheckins((checkinsResult.value.data as CheckinRow[]) ?? []);
        } else {
          console.warn('Battle checkins load failed:', checkinsResult);
        }

        if (sharedGoalsResult.status === 'fulfilled' && !sharedGoalsResult.value.error) {
          loadedSharedGoals = (sharedGoalsResult.value.data as SharedGoalRow[]) ?? [];
          setSharedGoals(loadedSharedGoals);
        } else {
          console.warn('Battle shared goals load failed:', sharedGoalsResult);
        }

        if (loadedSharedGoals.length > 0) {
          try {
            const goalIds = loadedSharedGoals.map((goal) => goal.id);
            const { data, error: sharedCheckinsError } = await supabase
              .from('shared_goal_checkins')
              .select('goal_id, user_id, check_date')
              .in('goal_id', goalIds)
              .in('user_id', relatedUserIds);

            if (sharedCheckinsError) {
              throw sharedCheckinsError;
            }

            if (active) {
              setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
            }
          } catch (sharedCheckinsError) {
            console.warn('Battle shared goal checkins load failed:', sharedCheckinsError);

            if (active) {
              setSharedGoalCheckins([]);
            }
          }
        } else if (active) {
          setSharedGoalCheckins([]);
        }

        if (connectedFriend) {
          try {
            const { data, error: nudgeError } = await supabase
              .from('nudges')
              .select('id, sender_id, receiver_id, message, created_at')
              .or(
                `and(sender_id.eq.${user.id},receiver_id.eq.${connectedFriend.id}),and(sender_id.eq.${connectedFriend.id},receiver_id.eq.${user.id})`
              )
              .order('created_at', { ascending: false })
              .limit(8);

            if (nudgeError) {
              throw nudgeError;
            }

            if (active) {
              setNudges((data as NudgeRow[]) ?? []);
            }
          } catch (nudgeError) {
            console.warn('Battle nudges load failed:', nudgeError);

            if (active) {
              setNudges([]);
            }
          }
        } else if (active) {
          setNudges([]);
        }
      } catch (loadError) {
        console.warn('Battle load failed:', loadError);

        if (active) {
          setError(t('battle.loadError'));
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
  }, [navigate, t]);

  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: t('common.me') });
  const opponentLabel = formatOpponentLabel(friendProfile?.nickname, { locale });
  const profileSubject = formatSelfSubject(profile?.nickname, { locale });
  const opponentSubject = formatOpponentSubject(friendProfile?.nickname, { locale });
  const sharedOpponentLabel = formatOpponentLabel(undefined, { locale });
  const personalStatsLabel = locale === 'ko' ? `${profileLabel} 개인 완료` : `${profileLabel} personal completions`;
  const opponentPersonalStatsLabel =
    locale === 'ko' ? `${opponentLabel} 개인 완료` : `${opponentLabel} personal completions`;
  const sharedStatsLabel =
    locale === 'ko' ? `${profileLabel} 공동 목표 완료` : `${profileLabel} shared goal completions`;
  const opponentSharedStatsLabel =
    locale === 'ko' ? `${opponentLabel} 공동 목표 완료` : `${opponentLabel} shared goal completions`;

  const battleSummary = useMemo(() => {
    return calculateBattleScores({
      currentUserId: userId,
      friendId: friendProfile?.id ?? null,
      checkins,
      sharedGoalCheckins,
      sharedGoals,
    });
  }, [checkins, friendProfile?.id, sharedGoalCheckins, sharedGoals, userId]);

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

      return {
        ...goal,
        myDoneToday,
        friendDoneToday,
        statusText: buildGoalStatus({ myDoneToday, friendDoneToday, t }),
      };
    });
  }, [friendProfile, sharedGoalCheckins, sharedGoals, t, todayKey, userId]);

  const heroTitle = buildHeroTitle({
    hasFriend: Boolean(friendProfile),
    leader: battleSummary.leader,
    myLeadName: profileSubject,
    opponentLeadName: opponentSubject,
    difference: battleSummary.difference,
    t,
  });

  const heroStatus = buildStatusLabel(battleSummary.leader, t);
  const battleTitle = battleMeta?.battle_title?.trim() || t('battle.titleFallback');
  const battleWager = battleMeta?.wager_text?.trim()
    ? t('battle.heroWager', { text: battleMeta.wager_text.trim() })
    : t('battle.heroNoWager');

  const handleCreateSharedGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!friendProfile || !userId) {
      setNotice(t('battle.noFriendBody'));
      return;
    }

    const nextTitle = title.trim();
    const nextDescription = description.trim();

    if (!nextTitle) {
      setError(t('battle.goalSaveError'));
      return;
    }

    const { data, error: insertError } = await supabase
      .from('shared_goals')
      .insert({
        owner_id: userId,
        friend_id: friendProfile.id,
        title: nextTitle,
        description: nextDescription || null,
        points: 3,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(t('battle.goalSaveError'));
      console.warn('Shared goal create failed:', insertError);
      return;
    }

    setSharedGoals((current) => [data as SharedGoalRow, ...current]);
    setTitle('');
    setDescription('');
    setNotice(t('battle.createGoalSuccess'));
  };

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId || !friendProfile) {
      setNotice(t('battle.noFriendBody'));
      return;
    }

    setPendingAction(`shared-${goalId}`);
    setError('');
    setNotice('');

    const alreadyDone = sharedGoalCheckins.some(
      (checkin) => checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey
    );

    if (alreadyDone) {
      const { error: deleteError } = await supabase
        .from('shared_goal_checkins')
        .delete()
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('check_date', todayKey);

      if (deleteError) {
        setError(t('battle.toggleSaveError'));
        console.warn('Shared goal undo failed:', deleteError);
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

    const { error: insertError } = await supabase.from('shared_goal_checkins').insert(payload);

    if (insertError) {
      setError(t('battle.toggleSaveError'));
      console.warn('Shared goal complete failed:', insertError);
      setPendingAction('');
      return;
    }

    setSharedGoalCheckins((current) => [...current, payload]);
    setPendingAction('');
  };

  const handleSendNudge = async (goalTitle?: string) => {
    if (!userId || !friendProfile) {
      setNotice(t('battle.noFriendBody'));
      return;
    }

    const message = goalTitle
      ? t('battle.nudgeMessageWithGoal', { title: goalTitle })
      : t('battle.nudgeMessageDefault');

    const { data, error: nudgeError } = await supabase
      .from('nudges')
      .insert({
        sender_id: userId,
        receiver_id: friendProfile.id,
        message,
      })
      .select('id, sender_id, receiver_id, message, created_at')
      .single();

    if (nudgeError) {
      setError(t('battle.loadError'));
      console.warn('Nudge send failed:', nudgeError);
      return;
    }

    setNudges((current) => [data as NudgeRow, ...current].slice(0, 8));
    setNotice(t('battle.nudgeSuccess', { name: opponentLabel }));
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
      <div className="app-screen subpage-screen">
        <header className="subpage-header battle-page-header">
          <p className="section-eyebrow">{t('battle.eyebrow')}</p>
          <h1>{t('battle.title')}</h1>
          <p>{t('battle.description')}</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          {!friendProfile ? (
            <article className="empty-state-card">
              <h3>{t('battle.noFriendTitle')}</h3>
              <p>{t('battle.noFriendBody')}</p>
              <Link className="inline-action-link" to="/friends">
                {t('battle.openFriends')}
              </Link>
            </article>
          ) : (
            <>
              <section
                className={
                  battleSummary.leader === 'me'
                    ? 'battle-hero-card battle-hero-card-leading'
                    : battleSummary.leader === 'friend'
                      ? 'battle-hero-card battle-hero-card-trailing'
                      : 'battle-hero-card battle-hero-card-tied'
                }
              >
                <div className="battle-hero-top">
                  <div>
                    <p className="section-eyebrow battle-hero-eyebrow">{t('battle.heroEyebrow')}</p>
                    <h2 className="battle-hero-title">{battleTitle}</h2>
                    <p className="battle-hero-copy">{heroTitle}</p>
                  </div>
                  <span className="battle-hero-status-pill">{heroStatus}</span>
                </div>

                <div className="battle-hero-scoreline">
                  {t('battle.heroScoreLine', {
                    me: profileLabel,
                    myScore: battleSummary.myScore,
                    friend: opponentLabel,
                    friendScore: battleSummary.friendScore,
                  })}
                </div>

                <div className="battle-hero-meta">
                  <article className="battle-hero-meta-card">
                    <span>{t('battle.heroDifference', { points: Math.abs(battleSummary.difference) })}</span>
                    <strong>{heroStatus}</strong>
                  </article>
                  <article className="battle-hero-meta-card">
                    <span>{battleWager}</span>
                    <strong>{battleMeta?.wager_text?.trim() ? battleMeta.wager_text.trim() : t('battle.heroNoWager')}</strong>
                  </article>
                </div>
              </section>

              <section className="battle-score-strip">
                <article className="score-panel">
                  <span>{profileLabel}</span>
                  <strong>{battleSummary.myScore}점</strong>
                </article>
                <article className="score-panel">
                  <span>{opponentLabel}</span>
                  <strong>{battleSummary.friendScore}점</strong>
                </article>
                <article className="score-summary-card">
                  <span>{t('battle.scoreboardBonus')}</span>
                  <strong>+{battleSummary.sharedBonusCount}</strong>
                  <p>{t('battle.heroStatus', { status: heroStatus })}</p>
                </article>
              </section>

              <section className="section-block">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>{t('battle.sharedTitle')}</h2>
                    <p className="section-description">{t('battle.sharedDescription')}</p>
                  </div>
                </div>

                {sharedGoalViews.length === 0 ? (
                  <article className="empty-state-card">
                    <h3>{t('battle.sharedEmptyTitle')}</h3>
                    <p>{t('battle.sharedEmptyBody')}</p>
                  </article>
                ) : (
                  <div className="shared-list battle-shared-list">
                    {sharedGoalViews.map((goal) => (
                      <article key={goal.id} className="shared-card battle-shared-card">
                        <div className="shared-header">
                          <div>
                            <h3>{goal.title}</h3>
                            <p>{goal.description || t('battle.sharedDescription')}</p>
                          </div>
                          <span className="proof-pill">{t('battle.goalPoints', { points: goal.points ?? 3 })}</span>
                        </div>

                        <p className="battle-goal-status">{goal.statusText}</p>

                        <div className="shared-players battle-shared-players">
                          <div className={goal.myDoneToday ? 'shared-player-box shared-player-box-active' : 'shared-player-box'}>
                            <span>{t('battle.myStatusLabel')}</span>
                            <strong>{goal.myDoneToday ? t('battle.goalDone') : t('battle.goalWaiting')}</strong>
                          </div>
                          <div
                            className={
                              goal.friendDoneToday ? 'shared-player-box shared-player-box-active' : 'shared-player-box'
                            }
                          >
                            <span>{sharedOpponentLabel}</span>
                            <strong>{goal.friendDoneToday ? t('battle.goalDone') : t('battle.goalWaiting')}</strong>
                          </div>
                        </div>

                        <div className="shared-actions">
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => handleToggleSharedGoal(goal.id)}
                            disabled={pendingAction === `shared-${goal.id}`}
                          >
                            {pendingAction === `shared-${goal.id}`
                              ? t('home.saving')
                              : goal.myDoneToday
                                ? t('battle.goalUndo')
                                : t('battle.goalComplete')}
                          </button>
                          <button className="secondary-button" type="button" onClick={() => handleSendNudge(goal.title)}>
                            {t('battle.nudgeAction')}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="section-block">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>{t('battle.createGoalTitle')}</h2>
                    <p className="section-description">{t('battle.createGoalDescription')}</p>
                  </div>
                </div>

                <form className="invite-card battle-goal-form" onSubmit={handleCreateSharedGoal}>
                  <input
                    type="text"
                    placeholder={t('battle.goalTitlePlaceholder')}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                  <textarea
                    rows={3}
                    placeholder={t('battle.goalDescriptionPlaceholder')}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                  <button className="primary-button" type="submit">
                    {t('battle.createGoalAction')}
                  </button>
                </form>
              </section>

              <section className="section-block">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>{t('battle.statsTitle')}</h2>
                    <p className="section-description">{t('battle.statsDescription')}</p>
                  </div>
                </div>

                <div className="battle-history-grid">
                  <article className="stat-card battle-history-card">
                    <span>{personalStatsLabel}</span>
                    <strong>{battleSummary.myPersonalActions}회</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{opponentPersonalStatsLabel}</span>
                    <strong>{battleSummary.friendPersonalActions}회</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{sharedStatsLabel}</span>
                    <strong>{battleSummary.mySharedCompletions}회</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{opponentSharedStatsLabel}</span>
                    <strong>{battleSummary.friendSharedCompletions}회</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{t('battle.statBonus')}</span>
                    <strong>+{battleSummary.sharedBonusCount}</strong>
                  </article>
                </div>
              </section>

              <section className="section-block">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>{t('battle.recentTitle')}</h2>
                    <p className="section-description">{t('battle.recentDescription')}</p>
                  </div>
                </div>

                {nudges.length === 0 ? (
                  <article className="empty-state-card">
                    <h3>{t('battle.recentEmptyTitle')}</h3>
                    <p>{t('battle.recentEmptyBody')}</p>
                  </article>
                ) : (
                  <div className="feed-list">
                    {nudges.map((nudge) => (
                      <article key={nudge.id} className="feed-card">
                        <div className="feed-avatar">!</div>
                        <div className="feed-copy">
                          <h3>
                            {nudge.sender_id === userId
                              ? t('battle.recentSentByMe')
                              : t('battle.recentSentByFriend', { name: opponentSubject })}
                          </h3>
                          <p>{nudge.message}</p>
                        </div>
                        <span className="feed-time">{new Date(nudge.created_at).toLocaleDateString()}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
