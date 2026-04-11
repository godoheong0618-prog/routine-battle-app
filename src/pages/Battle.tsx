import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { AvatarConfig } from '../components/battle/AvatarBadge';
import BattleHeader from '../components/battle/BattleHeader';
import BattleScoreCard from '../components/battle/BattleScoreCard';
import SharedRoutineList, { SharedRoutineItem } from '../components/battle/SharedRoutineList';
import TodayProgressCard from '../components/battle/TodayProgressCard';
import WeeklyChartCard, { WeeklyBarDatum } from '../components/battle/WeeklyChartCard';
import { useLanguage } from '../i18n/LanguageContext';
import { formatOpponentLabel, formatSelfLabel } from '../lib/nameDisplay';
import {
  FriendshipRow,
  NudgeRow,
  ProfileRow,
  RoutineLogRow,
  RoutineRow,
  RoutineStatus,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
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
  normalizeRoutineCategory,
  normalizeRoutineStatus,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type SharedGoalView = SharedGoalRow & { myDoneToday: boolean; friendDoneToday: boolean; statusText: string };
type BattleRoutineView = { id: string; title: string; description: string; myStatus: RoutineStatus; friendStatus: RoutineStatus; myWeeklySuccess: number; friendWeeklySuccess: number };

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon battle-clone-inline-icon-small">
      <path d="M12 5.25a3.25 3.25 0 0 0-3.25 3.25v1.25c0 .94-.28 1.86-.8 2.64L6.5 14.5h11l-1.45-2.11a4.56 4.56 0 0 1-.8-2.64V8.5A3.25 3.25 0 0 0 12 5.25Z" />
      <path d="M10.25 17.5a1.9 1.9 0 0 0 3.5 0" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-inline-icon">
      <path d="M8 5.5h8v2.25A4 4 0 0 1 12 11.75 4 4 0 0 1 8 7.75V5.5Z" />
      <path d="M9 18.5h6" />
      <path d="M10.5 15.25h3" />
      <path d="M12 11.75v3.5" />
      <path d="M8 6.75H5.75A1.75 1.75 0 0 0 4 8.5c0 1.8 1.45 3.25 3.25 3.25H8" />
      <path d="M16 6.75h2.25A1.75 1.75 0 0 1 20 8.5c0 1.8-1.45 3.25-3.25 3.25H16" />
    </svg>
  );
}

const goalStatus = (myDoneToday: boolean, friendDoneToday: boolean, isKo: boolean) =>
  myDoneToday && friendDoneToday
    ? isKo ? '오늘 둘 다 완료했어요.' : 'Both completed this today.'
    : myDoneToday
      ? isKo ? '나는 완료했고 친구를 기다리는 중이에요.' : 'You are done and waiting on your friend.'
      : friendDoneToday
        ? isKo ? '친구가 먼저 완료했어요.' : 'Your friend completed it first.'
        : isKo ? '아직 둘 다 체크하지 않았어요.' : 'Neither of you has checked in yet.';

const barHeight = (count: number, maxCount: number) => 18 + Math.round((count / Math.max(1, maxCount)) * 42);

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
  const [sharedGoalSheetOpen, setSharedGoalSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [myAvatar] = useState<AvatarConfig>({ avatarBgColor: '#ffd348', avatarEmoji: '😊' });
  const [opponentAvatar] = useState<AvatarConfig>({ avatarBgColor: '#111111', avatarEmoji: '🦊' });
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';
  const screenLocale = isKo ? 'ko-KR' : 'en-US';
  const todayKey = useMemo(() => getTodayKey(), []);
  const todayDayKey = useMemo(() => getTodayDayKey(), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    const loadBattle = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { navigate('/login'); return; }
      setUserId(user.id);
      try {
        const ensuredProfile = await ensureProfile(user);
        const connection = await fetchFriendConnection(ensuredProfile);
        if (!active) return;
        setProfile(connection.profile);
        setFriendProfile(connection.friendProfile);
        setBattleMeta(connection.friendship);
        if (!connection.friendProfile) { setLoading(false); return; }
        const ids = [user.id, connection.friendProfile.id];
        const [{ data: routineData, error: routineError }, logData, { data: sharedGoalData, error: sharedGoalError }, { data: nudgeData, error: nudgeError }] = await Promise.all([
          supabase.from('routines').select('*').in('user_id', ids),
          fetchRoutineLogsForUsers(ids),
          supabase.from('shared_goals').select('*').or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`).order('created_at', { ascending: false }),
          supabase.from('nudges').select('id, sender_id, receiver_id, message, created_at').or(`and(sender_id.eq.${user.id},receiver_id.eq.${connection.friendProfile.id}),and(sender_id.eq.${connection.friendProfile.id},receiver_id.eq.${user.id})`).order('created_at', { ascending: false }).limit(6),
        ]);
        if (routineError) throw routineError;
        if (sharedGoalError) throw sharedGoalError;
        if (nudgeError) throw nudgeError;
        const filteredGoals = filterSharedGoalsForPair((sharedGoalData as SharedGoalRow[]) ?? [], user.id, connection.friendProfile.id);
        setRoutines(((routineData as RoutineRow[]) ?? []).filter((routine) => !routine.is_template));
        setRoutineLogs(logData);
        setSharedGoals(filteredGoals);
        setNudges((nudgeData as NudgeRow[]) ?? []);
        if (filteredGoals.length > 0) {
          const { data: sharedCheckins, error: sharedCheckinsError } = await supabase.from('shared_goal_checkins').select('goal_id, user_id, check_date').in('goal_id', filteredGoals.map((goal) => goal.id)).in('user_id', ids);
          if (sharedCheckinsError) throw sharedCheckinsError;
          if (active) setSharedGoalCheckins((sharedCheckins as SharedGoalCheckinRow[]) ?? []);
        }
      } catch (loadError) {
        console.warn('Battle load failed:', loadError);
        if (active) setError(isKo ? '배틀 정보를 불러오지 못했어요.' : 'Could not load the battle view.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBattle();
    return () => { active = false; };
  }, [isKo, navigate]);

  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: isKo ? '나' : 'Me' });
  const opponentLabel = formatOpponentLabel(friendProfile?.nickname, { locale });
  const hasBattleStarted = Boolean(friendProfile && battleMeta?.battle_started_at);
  const battleSummary = useMemo(() => calculateBattleScores({ currentUserId: userId, friendId: friendProfile?.id ?? null, checkins: routineLogs, sharedGoalCheckins, sharedGoals, routines }), [friendProfile?.id, routineLogs, routines, sharedGoalCheckins, sharedGoals, userId]);
  const weekKeys = useMemo(() => getWeekDateKeys(), []);
  const recentKeys = useMemo(() => getLastDateKeys(7), []);
  const myTodayVisibleCount = useMemo(() => routines.filter((routine) => routine.user_id === userId && isRoutineVisibleToday(routine, todayDayKey)).length, [routines, todayDayKey, userId]);
  const friendTodayVisibleCount = useMemo(() => routines.filter((routine) => routine.user_id === friendProfile?.id && isRoutineVisibleToday(routine, todayDayKey)).length, [friendProfile?.id, routines, todayDayKey]);
  const myTodayCompletedCount = useMemo(() => routineLogs.filter((log) => log.user_id === userId && log.log_date === todayKey && isPositiveRoutineStatus(log.status)).length, [routineLogs, todayKey, userId]);
  const friendTodayCompletedCount = useMemo(() => routineLogs.filter((log) => log.user_id === friendProfile?.id && log.log_date === todayKey && isPositiveRoutineStatus(log.status)).length, [friendProfile?.id, routineLogs, todayKey]);
  const differenceText = battleSummary.myPersonalActions - battleSummary.friendPersonalActions;
  const actionHint = getBattleActionHint({ difference: battleSummary.difference, hasFriend: Boolean(friendProfile), locale });

  const sharedGoalViews = useMemo<SharedGoalView[]>(() => !friendProfile ? [] : sharedGoals.map((goal) => {
    const myDoneToday = sharedGoalCheckins.some((checkin) => checkin.goal_id === goal.id && checkin.user_id === userId && checkin.check_date === todayKey);
    const friendDoneToday = sharedGoalCheckins.some((checkin) => checkin.goal_id === goal.id && checkin.user_id === friendProfile.id && checkin.check_date === todayKey);
    return { ...goal, myDoneToday, friendDoneToday, statusText: goalStatus(myDoneToday, friendDoneToday, isKo) };
  }), [friendProfile, isKo, sharedGoalCheckins, sharedGoals, todayKey, userId]);

  const battleRoutineViews = useMemo<BattleRoutineView[]>(() => {
    if (!friendProfile) return [];
    const groups = new Map<string, { title: string; description: string; mine?: RoutineRow; friend?: RoutineRow }>();
    routines.filter((routine) => normalizeRoutineCategory(routine.category) === 'battle').forEach((routine) => {
      const key = routine.title.trim().toLowerCase();
      const current = groups.get(key) ?? { title: routine.title, description: routine.description ?? '' };
      if (routine.user_id === userId) current.mine = routine;
      if (routine.user_id === friendProfile.id) current.friend = routine;
      groups.set(key, current);
    });
    return Array.from(groups.values()).map((group) => ({
      id: group.title,
      title: group.title,
      description: group.description,
      myStatus: group.mine ? normalizeRoutineStatus(routineLogs.find((log) => log.routine_id === group.mine?.id && log.user_id === userId && log.log_date === todayKey)?.status) : 'pending',
      friendStatus: group.friend ? normalizeRoutineStatus(routineLogs.find((log) => log.routine_id === group.friend?.id && log.user_id === friendProfile.id && log.log_date === todayKey)?.status) : 'pending',
      myWeeklySuccess: group.mine ? routineLogs.filter((log) => log.routine_id === group.mine?.id && log.user_id === userId && weekKeys.includes(log.log_date) && isPositiveRoutineStatus(log.status)).length : 0,
      friendWeeklySuccess: group.friend ? routineLogs.filter((log) => log.routine_id === group.friend?.id && log.user_id === friendProfile.id && weekKeys.includes(log.log_date) && isPositiveRoutineStatus(log.status)).length : 0,
    }));
  }, [friendProfile, routineLogs, routines, todayKey, userId, weekKeys]);

  const routineItems = useMemo<SharedRoutineItem[]>(() => battleRoutineViews.slice(0, 4).map((routine) => ({
    id: routine.id,
    title: routine.title,
    subtitle: routine.description || (isKo ? `${profileLabel} ${routine.myWeeklySuccess}회 · ${opponentLabel} ${routine.friendWeeklySuccess}회` : `${profileLabel} ${routine.myWeeklySuccess} · ${opponentLabel} ${routine.friendWeeklySuccess}`),
    completed: routine.myStatus === 'done',
    badges: [routine.myStatus === 'done' || routine.myStatus === 'partial' ? { checked: true, tone: 'dark' } : { label: isKo ? '나' : 'Me', tone: 'light' }, routine.friendStatus === 'done' || routine.friendStatus === 'partial' ? { checked: true, tone: 'dark' } : { label: opponentLabel.slice(0, 1), tone: 'light' }],
  })), [battleRoutineViews, isKo, opponentLabel, profileLabel]);

  const recentFlow = useMemo(() => !friendProfile ? [] : recentKeys.map((dateKey) => ({ dateKey, myCount: routineLogs.filter((log) => log.user_id === userId && log.log_date === dateKey && isPositiveRoutineStatus(log.status)).length, friendCount: routineLogs.filter((log) => log.user_id === friendProfile.id && log.log_date === dateKey && isPositiveRoutineStatus(log.status)).length })), [friendProfile, recentKeys, routineLogs, userId]);
  const chartData = useMemo<WeeklyBarDatum[]>(() => {
    const max = recentFlow.reduce((sum, item) => Math.max(sum, item.myCount, item.friendCount), 1);
    return recentFlow.map((item) => ({ day: new Intl.DateTimeFormat(screenLocale, { weekday: 'short' }).format(new Date(`${item.dateKey}T12:00:00`)).slice(0, 1), me: barHeight(item.myCount, max), opponent: barHeight(item.friendCount, max) }));
  }, [recentFlow, screenLocale]);

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId || !hasBattleStarted) return;
    setPendingAction(`shared-${goalId}`);
    const alreadyDone = sharedGoalCheckins.some((checkin) => checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey);
    if (alreadyDone) {
      const { error: deleteError } = await supabase.from('shared_goal_checkins').delete().eq('goal_id', goalId).eq('user_id', userId).eq('check_date', todayKey);
      if (deleteError) { setError(isKo ? '공동 목표 상태를 바꾸지 못했어요.' : 'Could not update the shared goal.'); setPendingAction(''); return; }
      setSharedGoalCheckins((current) => current.filter((checkin) => !(checkin.goal_id === goalId && checkin.user_id === userId && checkin.check_date === todayKey)));
    } else {
      const payload = { goal_id: goalId, user_id: userId, check_date: todayKey };
      const { error: insertError } = await supabase.from('shared_goal_checkins').insert(payload);
      if (insertError) { setError(isKo ? '공동 목표 상태를 바꾸지 못했어요.' : 'Could not update the shared goal.'); setPendingAction(''); return; }
      setSharedGoalCheckins((current) => [...current, payload]);
    }
    setPendingAction('');
  };

  const handleSendNudge = async (goalTitle?: string) => {
    if (!userId || !friendProfile || !hasBattleStarted) return;
    const message = goalTitle ? (isKo ? `${goalTitle} 체크했는지 같이 확인해봐요.` : `Let's check in on ${goalTitle}.`) : isKo ? '오늘 루틴 체크했는지 확인해봐요.' : "Checking in on today's routines.";
    const { data, error: nudgeError } = await supabase.from('nudges').insert({ sender_id: userId, receiver_id: friendProfile.id, message }).select('id, sender_id, receiver_id, message, created_at').single();
    if (nudgeError) { setError(isKo ? '알림을 보내지 못했어요.' : 'Could not send the nudge.'); return; }
    setNudges((current) => [data as NudgeRow, ...current].slice(0, 6));
    setToast(isKo ? `${opponentLabel}님에게 알림을 보냈어요.` : `Sent a nudge to ${opponentLabel}.`);
  };

  const handleCreateSharedGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!friendProfile || !hasBattleStarted || !title.trim()) return;
    setPendingAction('shared-create');
    const payload = { owner_id: userId, friend_id: friendProfile.id, title: title.trim(), description: ruleText.trim() || null, rule_text: ruleText.trim() || null, stake_text: stakeText.trim() || null, points: 3 };
    const { data, error: insertError } = await supabase.from('shared_goals').insert(payload).select('*').single();
    if (insertError) { setError(isKo ? '공동 목표를 저장하지 못했어요.' : 'Could not save the shared goal.'); setPendingAction(''); return; }
    setSharedGoals((current) => [data as SharedGoalRow, ...current]);
    setTitle(''); setRuleText(''); setStakeText(''); setSharedGoalSheetOpen(false); setPendingAction(''); setToast(isKo ? '공동 목표를 만들었어요.' : 'Shared goal created.');
  };

  if (loading) return <div className="mobile-shell"><div className="app-screen loading-screen">{t('common.loading')}</div></div>;

  return (
    <div className="mobile-shell battle-clone-outer">
      <div className="app-screen battle-clone-shell service-screen">
        <main className="battle-clone-page">
          {error ? <p className="error home-error">{error}</p> : null}
          {!friendProfile ? <article className="service-card service-empty-card"><h3>{isKo ? '배틀할 친구가 아직 없어요.' : 'No friend connected yet.'}</h3><p>{isKo ? '친구를 연결하면 배틀 현황과 공동 목표가 이 화면에 나타나요.' : 'Connect a friend to unlock this screen.'}</p><Link className="service-text-link" to="/friends">{isKo ? '친구 연결하기' : 'Open Friends'}</Link></article> : !hasBattleStarted ? <article className="service-card service-empty-card"><h3>{isKo ? `${opponentLabel}님과 배틀 준비 중이에요.` : `You are almost ready to battle ${opponentLabel}.`}</h3><p>{isKo ? '친구 화면에서 배틀 제목과 내기를 정하면 비교 정보가 여기에서 열려요.' : 'Set the battle title and wager in Friends to unlock the comparison view.'}</p><Link className="service-text-link" to="/friends">{isKo ? '친구 화면으로 이동' : 'Open Friends'}</Link></article> : <>
            <BattleHeader title={isKo ? '배틀 현황' : 'Battle'} subtitle={isKo ? `${opponentLabel}님과의 4주차 배틀` : `Week 4 battle with ${opponentLabel}`} countdown={`D-${getDaysUntilWeekEnd()}`} />
            <BattleScoreCard me={{ name: isKo ? '나' : 'Me', completed: myTodayCompletedCount, total: Math.max(1, myTodayVisibleCount), points: battleSummary.myScore, avatarBgColor: myAvatar.avatarBgColor, avatarEmoji: myAvatar.avatarEmoji }} opponent={{ name: opponentLabel, completed: friendTodayCompletedCount, total: Math.max(1, friendTodayVisibleCount), points: battleSummary.friendScore, avatarBgColor: opponentAvatar.avatarBgColor, avatarEmoji: opponentAvatar.avatarEmoji, ring: true }} statusText={differenceText === 0 ? isKo ? '지금은 같은 수로 진행 중이에요.' : 'You are moving at the same pace.' : differenceText > 0 ? isKo ? `${differenceText}개 차이로 앞서고 있어요.` : `You are ahead by ${differenceText}.` : isKo ? `${Math.abs(differenceText)}개 차이로 뒤지고 있어요.` : `You are behind by ${Math.abs(differenceText)}.`} helperText={actionHint} />
            <TodayProgressCard myCount={myTodayCompletedCount} opponentCount={friendTodayCompletedCount} opponentName={opponentLabel} />
            <button className="battle-clone-nudge-button" type="button" onClick={() => handleSendNudge()}><BellIcon /><span>{isKo ? `${opponentLabel}님 콕 찌르기` : `Nudge ${opponentLabel}`}</span></button>
            <div className="service-inline-button-row"><button className="service-inline-pill-button" type="button" onClick={() => setSharedGoalSheetOpen(true)}>{isKo ? '공동 목표 추가' : 'Add shared goal'}</button><Link className="service-inline-pill-button" to="/friends">{isKo ? '친구 설정' : 'Friend settings'}</Link></div>
            <SharedRoutineList items={routineItems} />
            {sharedGoalViews.length > 0 ? <section className="service-section-block battle-extra-section"><div className="service-section-header"><div className="service-section-copy"><h2>{isKo ? '공동 목표' : 'Shared goals'}</h2></div><button className="service-section-action" type="button" onClick={() => setSharedGoalSheetOpen(true)}>{isKo ? '+ 추가' : '+ Add'}</button></div><div className="service-shared-goal-list">{sharedGoalViews.map((goal) => <article key={goal.id} className="service-card service-battle-goal-card"><div className="service-battle-goal-head"><div><h3>{goal.title}</h3><p>{goal.rule_text || goal.description || goal.statusText}</p></div><span className="service-point-pill">{goal.points ?? 3} pt</span></div><div className="service-battle-goal-status"><span>{isKo ? '나' : 'Me'} {goal.myDoneToday ? '✓' : '○'}</span><span>{opponentLabel} {goal.friendDoneToday ? '✓' : '○'}</span></div><div className="service-inline-button-row"><button className="service-inline-pill-button service-inline-pill-button-dark" type="button" onClick={() => handleToggleSharedGoal(goal.id)} disabled={pendingAction === `shared-${goal.id}`}>{pendingAction === `shared-${goal.id}` ? isKo ? '저장 중...' : 'Saving...' : goal.myDoneToday ? isKo ? '체크 취소' : 'Undo' : isKo ? '내 체크 완료' : 'Mark mine'}</button><button className="service-inline-pill-button" type="button" onClick={() => handleSendNudge(goal.title)}>{isKo ? '친구에게 알림' : 'Nudge'}</button></div></article>)}</div></section> : null}
            <WeeklyChartCard data={chartData} opponentName={opponentLabel} />
            <section className="battle-clone-summary-card"><div className="battle-clone-summary-copy"><div className="battle-clone-summary-icon"><TrophyIcon /></div><div><strong>{isKo ? '이번 주 누적' : 'This week total'}</strong><p>{battleSummary.leader === 'friend' ? isKo ? '분발하세요!' : 'Keep pushing!' : battleSummary.leader === 'me' ? isKo ? '좋은 흐름이에요!' : 'Great momentum!' : isKo ? '아직 팽팽해요!' : 'Still tied!'}</p></div></div><div className="battle-clone-summary-score"><strong>{battleSummary.myScore}</strong><span>vs {battleSummary.friendScore} pt</span></div></section>
            {nudges.length > 0 ? <section className="service-section-block battle-extra-section"><div className="service-section-header"><div className="service-section-copy"><h2>{isKo ? '최근 알림' : 'Recent nudges'}</h2></div></div><div className="service-feed-list">{nudges.map((nudge) => <article key={nudge.id} className="service-card service-feed-card"><div><strong>{nudge.sender_id === userId ? isKo ? '내가 보냄' : 'Sent by me' : isKo ? `${opponentLabel}이 보냄` : `Sent by ${opponentLabel}`}</strong><p>{nudge.message}</p></div><span>{new Intl.DateTimeFormat(screenLocale, { month: 'short', day: 'numeric' }).format(new Date(nudge.created_at))}</span></article>)}</div></section> : null}
          </>}
        </main>
        {toast ? <div className="home-toast" role="status" aria-live="polite">{toast}</div> : null}
        {sharedGoalSheetOpen ? <div className="modal-backdrop" role="presentation" onClick={() => setSharedGoalSheetOpen(false)}><form className="modal-card bottom-sheet-card shared-goal-sheet" role="dialog" aria-modal="true" aria-labelledby="shared-goal-sheet-title" onSubmit={handleCreateSharedGoal} onClick={(event) => event.stopPropagation()}><h2 id="shared-goal-sheet-title" className="modal-title">{isKo ? '공동 목표 추가' : 'Add shared goal'}</h2><label className="field-group" htmlFor="shared-goal-title"><span>{isKo ? '목표 이름' : 'Goal title'}</span><input id="shared-goal-title" type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} required /></label><label className="field-group" htmlFor="shared-goal-rule"><span>{isKo ? '규칙' : 'Rule'}</span><textarea id="shared-goal-rule" rows={3} value={ruleText} onChange={(event) => setRuleText(event.target.value)} maxLength={160} /></label><label className="field-group" htmlFor="shared-goal-stake"><span>{isKo ? '내기 또는 보상' : 'Stake or reward'}</span><input id="shared-goal-stake" type="text" value={stakeText} onChange={(event) => setStakeText(event.target.value)} maxLength={80} /></label><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setSharedGoalSheetOpen(false)}>{isKo ? '취소' : 'Cancel'}</button><button className="primary-button" type="submit" disabled={pendingAction === 'shared-create'}>{pendingAction === 'shared-create' ? isKo ? '저장 중...' : 'Saving...' : isKo ? '만들기' : 'Create'}</button></div></form></div> : null}
        <BottomTabBar />
      </div>
    </div>
  );
}
