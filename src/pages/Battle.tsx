import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import {
  CheckinRow,
  NudgeRow,
  ProfileRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  calculateBattleScores,
  ensureProfile,
  fetchProfile,
  getTodayKey,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

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
    let active = true;

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

        if (!active) {
          return;
        }

        setProfile(ensuredProfile);

        const connectedFriend = await fetchProfile(ensuredProfile.friend_id);

        if (!active) {
          return;
        }

        setFriendProfile(connectedFriend);

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

            if (active) {
              setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
            }
          } catch (sharedCheckinsError) {
            console.warn('Battle optional shared goal checkins load failed:', sharedCheckinsError);
            if (active) {
              setSharedGoalCheckins([]);
            }
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

            if (active) {
              setNudges((data as NudgeRow[]) ?? []);
            }
          } catch (nudgeError) {
            console.warn('Battle optional nudges load failed:', nudgeError);
            if (active) {
              setNudges([]);
            }
          }
        } else if (active) {
          setNudges([]);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : '배틀 정보를 불러오지 못했어요.');
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
  }, []);

  const friendName = friendProfile?.nickname || '친구';

  const battleSummary = useMemo(() => {
    return calculateBattleScores({
      currentUserId: userId,
      friendId: friendProfile?.id ?? null,
      checkins,
      sharedGoalCheckins,
      sharedGoals,
    });
  }, [checkins, friendProfile?.id, sharedGoalCheckins, sharedGoals, userId]);

  const displayStatus = friendProfile
    ? battleSummary.status
    : '친구를 연결하면 실제 배틀 점수가 표시돼요';

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

  const handleCreateSharedGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!friendProfile || !userId) {
      setNotice('친구를 먼저 연결해 주세요.');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('shared_goals')
      .insert({
        owner_id: userId,
        friend_id: friendProfile.id,
        title: title.trim(),
        description: description.trim() || null,
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
    if (!userId || !friendProfile) {
      setNotice('친구를 연결한 뒤 공동 목표를 체크할 수 있어요.');
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
    if (!userId || !friendProfile) {
      setNotice('친구를 먼저 연결해 주세요.');
      return;
    }

    const { data, error: nudgeError } = await supabase
      .from('nudges')
      .insert({
        sender_id: userId,
        receiver_id: friendProfile.id,
        message: goalTitle ? `${goalTitle} 아직 안 했지?` : '아직 안 했지? 공동 목표 체크하자!',
      })
      .select('id, sender_id, receiver_id, message, created_at')
      .single();

    if (nudgeError) {
      setError(nudgeError.message);
      return;
    }

    setNudges((current) => [data as NudgeRow, ...current].slice(0, 8));
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
      <div className="app-screen subpage-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">Battle</p>
          <h1>1:1 루틴 배틀</h1>
          <p>개인 목표와 공동 목표 점수를 실제 친구 데이터 기준으로만 보여줘요.</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          <section className="battle-scoreboard">
            <article className="score-panel">
              <span>{profile?.nickname || '나'}</span>
              <strong>{battleSummary.myScore}점</strong>
            </article>
            <article className="score-panel">
              <span>{friendName}</span>
              <strong>{friendProfile ? battleSummary.friendScore : 0}점</strong>
            </article>
            <article className="score-summary-card">
              <span>이번 주 상태</span>
              <strong>{displayStatus}</strong>
              <p>{friendProfile ? `${Math.abs(battleSummary.difference)}점 차이` : '친구 연결 후 점수 비교가 시작돼요.'}</p>
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
                placeholder="예: 밤 11시 전에 취침"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={!friendProfile}
              />
              <textarea
                rows={3}
                placeholder="친구와 같이 지킬 규칙을 적어 보세요"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!friendProfile}
              />
              <button className="primary-button" type="submit" disabled={!friendProfile}>
                공동 목표 추가
              </button>
            </form>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>공동 목표 진행</h2>
              <span>{sharedGoalViews.length}개</span>
            </div>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>친구 연결 후 공동 목표를 시작할 수 있어요</h3>
                <p>더미 목표 없이 실제 친구와 만든 공동 목표만 표시돼요.</p>
                <Link className="inline-action-link" to="/friends">
                  친구 연결하러 가기
                </Link>
              </article>
            ) : sharedGoalViews.length === 0 ? (
              <article className="empty-state-card">
                <h3>아직 공동 목표가 없어요</h3>
                <p>{friendName}와 함께할 공동 목표를 만들어 보세요.</p>
              </article>
            ) : (
              <div className="shared-list">
                {sharedGoalViews.map((goal) => (
                  <article key={goal.id} className="shared-card">
                    <div className="shared-header">
                      <div>
                        <h3>{goal.title}</h3>
                        <p>{goal.description || '같이 달성하면 추가 점수를 얻는 공동 목표예요.'}</p>
                        <span className="shared-status-note">
                          {goal.myDoneToday && goal.friendDoneToday
                            ? '오늘 둘 다 완료했어요.'
                            : goal.myDoneToday
                              ? '나는 완료했고 친구를 기다리는 중이에요.'
                              : goal.friendDoneToday
                                ? `${friendName}가 먼저 완료했어요.`
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
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>최근 찌르기</h2>
              <span>{nudges.length}개</span>
            </div>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>친구를 연결하면 찌르기를 확인할 수 있어요</h3>
                <p>실제 친구와 주고받은 기록만 여기에 보여요.</p>
              </article>
            ) : nudges.length === 0 ? (
              <article className="empty-state-card">
                <h3>최근 찌르기가 없어요</h3>
                <p>{friendName}에게 먼저 한 번 보내 보세요.</p>
              </article>
            ) : (
              <div className="feed-list">
                {nudges.map((nudge) => (
                  <article key={nudge.id} className="feed-card">
                    <div className="feed-avatar">!</div>
                    <div className="feed-copy">
                      <h3>{nudge.sender_id === userId ? '내가 보낸 찌르기' : `${friendName}가 보낸 찌르기`}</h3>
                      <p>{nudge.message}</p>
                    </div>
                    <span className="feed-time">{new Date(nudge.created_at).toLocaleDateString('ko-KR')}</span>
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
