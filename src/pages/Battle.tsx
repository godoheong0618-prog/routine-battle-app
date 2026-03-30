import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import {
  CheckinRow,
  DEMO_FRIEND,
  NudgeRow,
  ProfileRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  ensureProfile,
  fetchProfile,
  getDisplayFriendProfile,
  getTodayKey,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

const demoSharedGoals: SharedGoalRow[] = [
  {
    id: 'battle-demo-1',
    owner_id: 'me',
    friend_id: DEMO_FRIEND.id,
    title: '공부 2시간',
    description: '둘 다 오늘 단어장까지 끝내기',
    points: 3,
  },
];

type SharedGoalView = SharedGoalRow & {
  myDoneToday: boolean;
  friendDoneToday: boolean;
};

export default function Battle() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
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
  const todayKey = useMemo(() => getTodayKey(), []);

  useEffect(() => {
    const loadBattle = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      try {
        const ensuredProfile = await ensureProfile(user);
        setProfile(ensuredProfile);

        let connectedFriend: ProfileRow | null = null;
        try {
          connectedFriend = await fetchProfile(ensuredProfile.friend_id);
          setFriendProfile(connectedFriend);
        } catch (friendError) {
          console.warn('Battle optional friend load failed:', friendError);
          setFriendProfile(null);
        }

        const relatedUserIds = connectedFriend ? [user.id, connectedFriend.id] : [user.id];

        const [checkinsResult, sharedGoalsResult] = await Promise.allSettled([
          supabase.from('checkins').select('user_id, routine_id, check_date').in('user_id', relatedUserIds),
          supabase.from('shared_goals').select('*').or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`),
        ]);

        let loadedSharedGoals: SharedGoalRow[] = [];

        if (checkinsResult.status === 'fulfilled' && !checkinsResult.value.error) {
          setCheckins((checkinsResult.value.data as CheckinRow[]) ?? []);
        } else {
          console.warn('Battle optional checkins load failed:', checkinsResult);
        }

        if (sharedGoalsResult.status === 'fulfilled' && !sharedGoalsResult.value.error) {
          loadedSharedGoals = (sharedGoalsResult.value.data as SharedGoalRow[]) ?? [];
          setSharedGoals(loadedSharedGoals);
        } else {
          console.warn('Battle optional shared goals load failed:', sharedGoalsResult);
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

            setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
          } catch (sharedCheckinsError) {
            console.warn('Battle optional shared goal checkins load failed:', sharedCheckinsError);
            setSharedGoalCheckins([]);
          }
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

            setNudges((data as NudgeRow[]) ?? []);
          } catch (nudgeError) {
            console.warn('Battle optional nudges load failed:', nudgeError);
            setNudges([]);
          }
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '배틀 정보를 불러오지 못했어요.');
      } finally {
        setLoading(false);
      }
    };

    loadBattle();
  }, []);

  const displayFriend = useMemo(() => getDisplayFriendProfile(friendProfile), [friendProfile]);
  const usingDemoFriend = !friendProfile;
  const visibleSharedGoals = sharedGoals.length > 0 ? sharedGoals : demoSharedGoals;

  const battleSummary = useMemo(() => {
    return calculateBattleScores({
      currentUserId: userId,
      friendId: friendProfile?.id ?? null,
      checkins,
      sharedGoalCheckins,
      sharedGoals,
    });
  }, [checkins, friendProfile?.id, sharedGoalCheckins, sharedGoals, userId]);

  const displayMyScore = usingDemoFriend ? Math.max(battleSummary.myScore, 6) : battleSummary.myScore;
  const displayFriendScore = usingDemoFriend ? 9 : battleSummary.friendScore;
  const displayStatus = displayMyScore === displayFriendScore
    ? '지금은 동점이야'
    : displayMyScore > displayFriendScore
      ? '내가 앞서고 있어'
      : `${displayFriend.nickname || '친구'}가 앞서고 있어`;

  const sharedGoalViews = useMemo<SharedGoalView[]>(() => {
    return visibleSharedGoals.map((goal, index) => ({
      ...goal,
      myDoneToday: sharedGoalCheckins.some(
        (checkin) => checkin.goal_id === goal.id && checkin.user_id === userId && checkin.check_date === todayKey
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

  const handleCreateSharedGoal = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!friendProfile || !userId) {
      setNotice('실제 친구 연결 전에는 재헌 더미 공동 목표만 보여줘요.');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('shared_goals')
      .insert({
        owner_id: userId,
        friend_id: friendProfile.id,
        title,
        description: description || null,
        points: 3,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSharedGoals((current) => [...current, data as SharedGoalRow]);
    setTitle('');
    setDescription('');
    setNotice('공동 목표를 만들었어요.');
  };

  const handleToggleSharedGoal = async (goalId: string) => {
    if (!userId) {
      return;
    }

    if (usingDemoFriend) {
      setNotice('재헌과의 공동 목표는 데모 표시 상태예요.');
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
        setError(deleteError.message);
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
      setError(insertError.message);
      setPendingAction('');
      return;
    }

    setSharedGoalCheckins((current) => [...current, payload]);
    setPendingAction('');
  };

  const handleSendNudge = async (goalTitle?: string) => {
    if (!userId) {
      return;
    }

    if (usingDemoFriend) {
      setNotice(`재헌에게 "${goalTitle ?? '공동 목표'}" 찌르기를 보냈어요. (MVP 데모)`);
      return;
    }

    const { data, error: nudgeError } = await supabase
      .from('nudges')
      .insert({
        sender_id: userId,
        receiver_id: displayFriend.id,
        message: goalTitle ? `${goalTitle} 아직 안 했지?` : '아직 안 했지? 공동 목표 체크하자!',
      })
      .select('id, sender_id, receiver_id, message, created_at')
      .single();

    if (nudgeError) {
      setError(nudgeError.message);
      return;
    }

    setNudges((current) => [data as NudgeRow, ...current].slice(0, 8));
    setNotice('찌르기를 보냈어요.');
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
      <div className="app-screen subpage-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">Battle</p>
          <h1>1대1 루틴 배틀</h1>
          <p>개인 목표는 2점, 공동 목표는 3점. 이번 주 누가 앞서는지 바로 확인할 수 있어요.</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          <section className="battle-scoreboard">
            <article className="score-panel">
              <span>{profile?.nickname || '나'}</span>
              <strong>{displayMyScore}점</strong>
            </article>
            <article className="score-panel">
              <span>{displayFriend.nickname || '친구'}</span>
              <strong>{displayFriendScore}점</strong>
            </article>
            <article className="score-summary-card">
              <span>이번 주 상태</span>
              <strong>{displayStatus}</strong>
              <p>{Math.abs(displayMyScore - displayFriendScore)}점 차이</p>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>공동 목표 만들기</h2>
              <span>+3점</span>
            </div>
            <form className="invite-card" onSubmit={handleCreateSharedGoal}>
              <input
                type="text"
                placeholder="예: 밤 11시 전 취침"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <textarea
                rows={3}
                placeholder="친구와 같이 지킬 규칙을 적어보세요"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button className="primary-button" type="submit">
                공동 목표 추가
              </button>
            </form>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>공동 목표 진행</h2>
              <span>{sharedGoalViews.length}개</span>
            </div>

            <div className="shared-list">
              {sharedGoalViews.map((goal) => (
                <article key={goal.id} className="shared-card">
                  <div className="shared-header">
                    <div>
                      <h3>{goal.title}</h3>
                      <p>{goal.description || '같이 달성하면 추가 점수를 얻는 공동 목표예요.'}</p>
                      <span className="shared-status-note">
                        {goal.myDoneToday && goal.friendDoneToday
                          ? '오늘 둘 다 완료했어요. 보너스 점수 가능!'
                          : goal.myDoneToday
                            ? '내 완료는 체크됐어요. 친구를 기다리는 중!'
                            : goal.friendDoneToday
                              ? `${displayFriend.nickname || '친구'}가 먼저 완료했어요.`
                              : '아직 둘 다 시작 전이에요.'}
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
                </article>
              ))}
            </div>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>최근 찌르기</h2>
              <span>{nudges.length}개</span>
            </div>
            {nudges.length === 0 ? (
              <article className="empty-state-card">
                <h3>최근 찌르기가 없어요.</h3>
                <p>친구가 늘어질 것 같으면 한 번 눌러보세요.</p>
                {usingDemoFriend && (
                  <Link className="inline-action-link" to="/friends">
                    친구 연결하러 가기
                  </Link>
                )}
              </article>
            ) : (
              <div className="feed-list">
                {nudges.map((nudge) => (
                  <article key={nudge.id} className="feed-card">
                    <div className="feed-avatar">👀</div>
                    <div className="feed-copy">
                      <h3>{nudge.sender_id === userId ? '내가 보낸 찌르기' : '친구가 보낸 찌르기'}</h3>
                      <p>{nudge.message}</p>
                    </div>
                    <span className="feed-time">{new Date(nudge.created_at).toLocaleDateString()}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
