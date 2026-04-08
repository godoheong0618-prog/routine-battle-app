import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BattleScoreCard from '../components/BattleScoreCard';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatOpponentLabel,
  formatOpponentSubject,
  formatSelfLabel,
  formatSelfSubject,
} from '../lib/nameDisplay';
import {
  FriendshipRow,
  NudgeRow,
  ProfileRow,
  RoutineLogRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  ensureProfile,
  fetchFriendConnection,
  fetchRoutineLogsForUsers,
  filterSharedGoalsForPair,
  getBattleActionHint,
  getDaysUntilWeekEnd,
  getTodayKey,
  getWeekDateKeys,
  isPositiveRoutineStatus,
  normalizeRoutineCategory,
  normalizeRoutineStatus,
  RoutineStatus,
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
  const [routineLogs, setRoutineLogs] = useState<RoutineLogRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
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
  const isKo = locale === 'ko';
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

        const filteredGoals = filterSharedGoalsForPair(
          (sharedGoalData as SharedGoalRow[]) ?? [],
          user.id,
          connection.friendProfile.id
        );

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
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${connection.friendProfile.id}),and(sender_id.eq.${connection.friendProfile.id},receiver_id.eq.${user.id})`
          )
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
  const personalStatsLabel = isKo ? `${profileLabel} 개인 완료` : `${profileLabel} personal completions`;
  const opponentPersonalStatsLabel = isKo ? `${opponentLabel} 개인 완료` : `${opponentLabel} personal completions`;
  const sharedStatsLabel = isKo ? `${profileLabel} 공동 목표 완료` : `${profileLabel} shared goal completions`;
  const opponentSharedStatsLabel = isKo ? `${opponentLabel} 공동 목표 완료` : `${opponentLabel} shared goal completions`;

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
  const hasBattleStarted = Boolean(friendProfile && battleMeta?.battle_started_at);
  const battleSetupTitle = isKo ? `${opponentLabel}와 배틀 준비만 남았어요` : `You are almost ready to battle ${opponentLabel}`;
  const battleSetupBody = isKo
    ? '친구 탭에서 배틀 이름과 내기를 저장하면 점수판과 공동 목표가 여기 바로 열려요.'
    : 'Save the battle name and wager in Friends to open the scoreboard and shared goals here.';
  const battleSetupAction = isKo ? '친구 탭에서 설정하기' : 'Set up in Friends';
  const scoreSuffix = isKo ? '점' : 'pts';
  const achievementLeaderText =
    battleSummary.weeklyPercentLeader === 'me'
      ? isKo
        ? `${profileLabel} 주간 달성률이 앞서요`
        : `${profileLabel} is ahead by weekly rate`
      : battleSummary.weeklyPercentLeader === 'friend'
        ? isKo
          ? `${opponentLabel} 주간 달성률이 앞서요`
          : `${opponentLabel} is ahead by weekly rate`
        : battleSummary.weeklyPercentLeader === 'tied'
          ? isKo
            ? '주간 달성률은 동점이에요'
            : 'Weekly rate is tied'
          : t('battle.statusWaiting');
  const achievementLine = `${profileLabel} ${battleSummary.myWeeklyPercent}% · ${opponentLabel} ${battleSummary.friendWeeklyPercent}%`;
  const statusLabels: Record<RoutineStatus, string> = {
    pending: isKo ? '대기' : 'Pending',
    done: isKo ? '완료' : 'Done',
    partial: isKo ? '조금 함' : 'Partial',
    rest: isKo ? '쉼' : 'Rest',
  };
  const scoreboardTitle =
    battleSummary.leader === 'me'
      ? isKo
        ? `${profileLabel} 리드`
        : `${profileLabel} leads`
      : battleSummary.leader === 'friend'
        ? isKo
          ? `${opponentLabel} 리드`
          : `${opponentLabel} leads`
        : battleSummary.leader === 'tied'
          ? isKo
          ? '동점 상황'
          : 'Tied battle'
        : t('battle.statusWaiting');
  const scoreboardHint = getBattleActionHint({
    difference: battleSummary.difference,
    hasFriend: Boolean(friendProfile),
    locale,
  });
  const battleDaysLeft = getDaysUntilWeekEnd();
  const weekDateKeys = useMemo(() => getWeekDateKeys(), []);

  const battleRoutineViews = useMemo<BattleRoutineView[]>(() => {
    if (!friendProfile) {
      return [];
    }

    const battleRoutines = routines.filter((routine) => normalizeRoutineCategory(routine.category) === 'battle');
    const grouped = new Map<string, { title: string; description: string; myRoutine?: RoutineRow; friendRoutine?: RoutineRow }>();

    battleRoutines.forEach((routine) => {
      const key = routine.title.trim().toLowerCase();
      const group = grouped.get(key) ?? {
        title: routine.title,
        description: routine.description ?? '',
      };

      if (routine.user_id === userId) {
        group.myRoutine = routine;
      }

      if (routine.user_id === friendProfile.id) {
        group.friendRoutine = routine;
      }

      grouped.set(key, group);
    });

    return Array.from(grouped.values()).map((group) => {
      const myTodayLog = group.myRoutine
        ? routineLogs.find(
            (log) => log.routine_id === group.myRoutine?.id && log.user_id === userId && log.log_date === todayKey
          )
        : null;
      const friendTodayLog = group.friendRoutine
        ? routineLogs.find(
            (log) =>
              log.routine_id === group.friendRoutine?.id &&
              log.user_id === friendProfile.id &&
              log.log_date === todayKey
          )
        : null;
      const myWeeklySuccess = group.myRoutine
        ? routineLogs.filter(
            (log) =>
              log.routine_id === group.myRoutine?.id &&
              log.user_id === userId &&
              weekDateKeys.includes(log.log_date) &&
              isPositiveRoutineStatus(log.status)
          ).length
        : 0;
      const friendWeeklySuccess = group.friendRoutine
        ? routineLogs.filter(
            (log) =>
              log.routine_id === group.friendRoutine?.id &&
              log.user_id === friendProfile.id &&
              weekDateKeys.includes(log.log_date) &&
              isPositiveRoutineStatus(log.status)
          ).length
        : 0;

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

  const handleCreateSharedGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!friendProfile || !userId || !hasBattleStarted) {
      setNotice(hasBattleStarted ? t('battle.noFriendBody') : battleSetupBody);
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
    if (!userId || !friendProfile || !hasBattleStarted) {
      setNotice(hasBattleStarted ? t('battle.noFriendBody') : battleSetupBody);
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
    if (!userId || !friendProfile || !hasBattleStarted) {
      setNotice(hasBattleStarted ? t('battle.noFriendBody') : battleSetupBody);
      return;
    }

    const message = goalTitle ? t('battle.nudgeMessageWithGoal', { title: goalTitle }) : t('battle.nudgeMessageDefault');

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
          ) : !hasBattleStarted ? (
            <article className="empty-state-card">
              <h3>{battleSetupTitle}</h3>
              <p>{battleSetupBody}</p>
              <Link className="inline-action-link" to="/friends">
                {battleSetupAction}
              </Link>
            </article>
          ) : (
            <>
              <BattleScoreCard
                eyebrow={battleTitle}
                title={scoreboardTitle}
                myLabel={profileLabel}
                friendLabel={opponentLabel}
                myScore={battleSummary.myScore}
                friendScore={battleSummary.friendScore}
                leader={battleSummary.leader}
                daysLeft={battleDaysLeft}
                actionHint={scoreboardHint}
                hasFriend={Boolean(friendProfile)}
                hasBattleStarted={hasBattleStarted}
                emptyTitle={battleSetupTitle}
                emptyBody={battleSetupBody}
                setupHref="/friends"
                setupLabel={battleSetupAction}
                ctaHref="#battle-routines"
                ctaLabel={isKo ? '배틀 열기' : 'Open battle'}
              />

              <section className="section-block" id="battle-routines">
                <div className="section-header section-header-stack">
                  <div>
                    <h2>{isKo ? '배틀 루틴' : 'Battle routines'}</h2>
                    <p className="section-description">
                      {isKo ? '오늘 상태와 이번 주 성공 수만 간단히 비교해요.' : 'Compare today status and weekly wins only.'}
                    </p>
                  </div>
                </div>

                {battleRoutineViews.length === 0 ? (
                  <article className="empty-state-card">
                    <h3>{isKo ? '아직 배틀 루틴이 없어요' : 'No battle routines yet'}</h3>
                    <p>{isKo ? '루틴 추가에서 배틀 루틴으로 표시하면 여기에 모여요.' : 'Mark a routine as Battle and it will appear here.'}</p>
                  </article>
                ) : (
                  <div className="battle-routine-list">
                    {battleRoutineViews.map((routine) => (
                      <article key={routine.title} className="battle-routine-card">
                        <div>
                          <h3>{routine.title}</h3>
                          {routine.description && <p>{routine.description}</p>}
                        </div>
                        <div className="battle-routine-status-pair">
                          <div className="battle-routine-status-grid">
                            <span>{profileLabel}</span>
                            <strong>{statusLabels[routine.myStatus]}</strong>
                            <small>{isKo ? `이번 주 ${routine.myWeeklySuccess}회` : `${routine.myWeeklySuccess} this week`}</small>
                          </div>
                          <div className="battle-routine-status-grid">
                            <span>{opponentLabel}</span>
                            <strong>{statusLabels[routine.friendStatus]}</strong>
                            <small>{isKo ? `이번 주 ${routine.friendWeeklySuccess}회` : `${routine.friendWeeklySuccess} this week`}</small>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
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
                    <strong>{battleSummary.myPersonalActions}</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{opponentPersonalStatsLabel}</span>
                    <strong>{battleSummary.friendPersonalActions}</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{sharedStatsLabel}</span>
                    <strong>{battleSummary.mySharedCompletions}</strong>
                  </article>
                  <article className="stat-card battle-history-card">
                    <span>{opponentSharedStatsLabel}</span>
                    <strong>{battleSummary.friendSharedCompletions}</strong>
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
