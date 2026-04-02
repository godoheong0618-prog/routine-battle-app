import { useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import {
  CheckinRow,
  NudgeRow,
  ProfileRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  ensureProfile,
  fetchProfile,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type FeedItem = {
  id: string;
  title: string;
  description: string;
  meta: string;
  emoji: string;
  sortKey: string;
};

export default function Feed() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [friendRoutines, setFriendRoutines] = useState<RoutineRow[]>([]);
  const [friendCheckins, setFriendCheckins] = useState<CheckinRow[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoalRow[]>([]);
  const [sharedGoalCheckins, setSharedGoalCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadFeed = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

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

        if (!connectedFriend) {
          setLoading(false);
          return;
        }

        const [routinesResult, checkinsResult, sharedGoalsResult, nudgesResult] = await Promise.allSettled([
          supabase.from('routines').select('*').eq('user_id', connectedFriend.id),
          supabase.from('checkins').select('user_id, routine_id, check_in_date').eq('user_id', connectedFriend.id),
          supabase.from('shared_goals').select('*').or(`owner_id.eq.${user.id},friend_id.eq.${user.id}`),
          supabase
            .from('nudges')
            .select('id, sender_id, receiver_id, message, created_at')
            .or(
              `and(sender_id.eq.${user.id},receiver_id.eq.${connectedFriend.id}),and(sender_id.eq.${connectedFriend.id},receiver_id.eq.${user.id})`
            )
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        if (routinesResult.status === 'fulfilled' && !routinesResult.value.error) {
          setFriendRoutines((routinesResult.value.data as RoutineRow[]) ?? []);
        } else {
          console.warn('Feed optional routines load failed:', routinesResult);
        }

        if (checkinsResult.status === 'fulfilled' && !checkinsResult.value.error) {
          setFriendCheckins((checkinsResult.value.data as CheckinRow[]) ?? []);
        } else {
          console.warn('Feed optional checkins load failed:', checkinsResult);
        }

        let loadedSharedGoals: SharedGoalRow[] = [];

        if (sharedGoalsResult.status === 'fulfilled' && !sharedGoalsResult.value.error) {
          loadedSharedGoals = (sharedGoalsResult.value.data as SharedGoalRow[]) ?? [];
          setSharedGoals(loadedSharedGoals);
        } else {
          console.warn('Feed optional shared goals load failed:', sharedGoalsResult);
        }

        if (nudgesResult.status === 'fulfilled' && !nudgesResult.value.error) {
          setNudges((nudgesResult.value.data as NudgeRow[]) ?? []);
        } else {
          console.warn('Feed optional nudges load failed:', nudgesResult);
        }

        if (loadedSharedGoals.length > 0) {
          try {
            const goalIds = loadedSharedGoals.map((goal) => goal.id);
            const { data, error: sharedCheckinsError } = await supabase
              .from('shared_goal_checkins')
              .select('goal_id, user_id, check_date')
              .in('goal_id', goalIds)
              .in('user_id', [user.id, connectedFriend.id]);

            if (sharedCheckinsError) {
              throw sharedCheckinsError;
            }

            if (active) {
              setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
            }
          } catch (sharedCheckinsError) {
            console.warn('Feed optional shared goal checkins load failed:', sharedCheckinsError);
            if (active) {
              setSharedGoalCheckins([]);
            }
          }
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : '피드 정보를 불러오지 못했어요.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadFeed();

    return () => {
      active = false;
    };
  }, []);

  const friendName = friendProfile?.nickname || '친구';

  const feedItems = useMemo<FeedItem[]>(() => {
    if (!friendProfile) {
      return [];
    }

    const routineMap = new Map(friendRoutines.map((routine) => [routine.id, routine.title]));
    const goalMap = new Map(sharedGoals.map((goal) => [goal.id, goal.title]));

    const personalItems = friendCheckins.map((checkin) => ({
      id: `routine-${checkin.routine_id}-${checkin.check_in_date}`,
      title: `${friendName}가 개인 목표를 완료했어요`,
      description: routineMap.get(checkin.routine_id) || '개인 루틴 완료',
      meta: checkin.check_in_date,
      emoji: '✓',
      sortKey: `${checkin.check_in_date}T12:00:00`,
    }));

    const sharedItems = sharedGoalCheckins.map((checkin) => ({
      id: `shared-${checkin.goal_id}-${checkin.user_id}-${checkin.check_date}`,
      title:
        checkin.user_id === profile?.id
          ? '내가 공동 목표를 체크했어요'
          : `${friendName}가 공동 목표를 체크했어요`,
      description: goalMap.get(checkin.goal_id) || '공동 목표 진행',
      meta: checkin.check_date,
      emoji: '🏁',
      sortKey: `${checkin.check_date}T13:00:00`,
    }));

    const nudgeItems = nudges.map((nudge) => ({
      id: nudge.id,
      title: nudge.sender_id === profile?.id ? '내가 친구를 찔렀어요' : `${friendName}가 나를 찔렀어요`,
      description: nudge.message,
      meta: new Date(nudge.created_at).toLocaleDateString('ko-KR'),
      emoji: '!',
      sortKey: nudge.created_at,
    }));

    return [...personalItems, ...sharedItems, ...nudgeItems].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [friendCheckins, friendName, friendProfile, friendRoutines, nudges, profile?.id, sharedGoalCheckins, sharedGoals]);

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
          <p className="section-eyebrow">Feed</p>
          <h1>최근 활동 피드</h1>
          <p>데모 데이터 없이 실제 친구와 주고받은 활동만 보여줘요.</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}

          {!friendProfile ? (
            <article className="empty-state-card">
              <h3>연결된 친구가 아직 없어요</h3>
              <p>친구를 연결하면 완료 기록, 찌르기, 공동 목표 진행 상황이 여기에 표시돼요.</p>
            </article>
          ) : feedItems.length === 0 ? (
            <article className="empty-state-card">
              <h3>아직 표시할 활동이 없어요</h3>
              <p>{friendName}와 활동을 시작하면 실제 기록이 피드에 쌓여요.</p>
            </article>
          ) : (
            <div className="feed-list">
              {feedItems.map((item) => (
                <article key={item.id} className="feed-card">
                  <div className="feed-avatar">{item.emoji}</div>
                  <div className="feed-copy">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span className="feed-time">{item.meta}</span>
                </article>
              ))}
            </div>
          )}
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
