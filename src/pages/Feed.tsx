import { useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import {
  CheckinRow,
  DEMO_FRIEND,
  NudgeRow,
  ProfileRow,
  RoutineRow,
  SharedGoalCheckinRow,
  SharedGoalRow,
  ensureProfile,
  fetchProfile,
  getDisplayFriendProfile,
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

const demoFeedItems: FeedItem[] = [
  {
    id: 'demo-feed-1',
    title: '재헌이 개인 목표를 완료했어요',
    description: '운동 10분',
    meta: '오늘',
    emoji: '🔥',
    sortKey: '9999-12-31T10:00:00',
  },
  {
    id: 'demo-feed-2',
    title: '재헌이 찌르기를 보냈어요',
    description: '오늘 공부 30분 아직 안 했지?',
    meta: '오늘',
    emoji: '👀',
    sortKey: '9999-12-31T09:00:00',
  },
];

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
        setProfile(ensuredProfile);

        let connectedFriend: ProfileRow | null = null;

        try {
          connectedFriend = await fetchProfile(ensuredProfile.friend_id);
          setFriendProfile(connectedFriend);
        } catch (friendError) {
          console.warn('Feed optional friend load failed:', friendError);
          setFriendProfile(null);
        }

        if (!connectedFriend) {
          setLoading(false);
          return;
        }

        const [routinesResult, checkinsResult, sharedGoalsResult, nudgesResult] = await Promise.allSettled([
          supabase.from('routines').select('*').eq('user_id', connectedFriend.id),
          supabase.from('checkins').select('user_id, routine_id, check_date').eq('user_id', connectedFriend.id),
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

            setSharedGoalCheckins((data as SharedGoalCheckinRow[]) ?? []);
          } catch (sharedCheckinsError) {
            console.warn('Feed optional shared goal checkins load failed:', sharedCheckinsError);
            setSharedGoalCheckins([]);
          }
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '피드 정보를 불러오지 못했어요.');
      } finally {
        setLoading(false);
      }
    };

    loadFeed();
  }, []);

  const displayFriend = useMemo(() => getDisplayFriendProfile(friendProfile), [friendProfile]);

  const feedItems = useMemo<FeedItem[]>(() => {
    if (!friendProfile) {
      return demoFeedItems;
    }

    const routineMap = new Map(friendRoutines.map((routine) => [routine.id, routine.title]));
    const goalMap = new Map(sharedGoals.map((goal) => [goal.id, goal.title]));

    const personalItems = friendCheckins.map((checkin) => ({
      id: `routine-${checkin.routine_id}-${checkin.check_date}`,
      title: `${displayFriend.nickname || '친구'}가 개인 목표를 완료했어요`,
      description: routineMap.get(checkin.routine_id) || '개인 루틴 완료',
      meta: checkin.check_date,
      emoji: '✅',
      sortKey: `${checkin.check_date}T12:00:00`,
    }));

    const sharedItems = sharedGoalCheckins.map((checkin) => ({
      id: `shared-${checkin.goal_id}-${checkin.user_id}-${checkin.check_date}`,
      title:
        checkin.user_id === profile?.id
          ? '내가 공동 목표를 체크했어요'
          : `${displayFriend.nickname || '친구'}가 공동 목표를 체크했어요`,
      description: goalMap.get(checkin.goal_id) || '공동 목표 진행',
      meta: checkin.check_date,
      emoji: '🤝',
      sortKey: `${checkin.check_date}T13:00:00`,
    }));

    const nudgeItems = nudges.map((nudge) => ({
      id: nudge.id,
      title: nudge.sender_id === profile?.id ? '내가 친구를 찔렀어요' : '친구가 나를 찔렀어요',
      description: nudge.message,
      meta: new Date(nudge.created_at).toLocaleDateString(),
      emoji: '👀',
      sortKey: nudge.created_at,
    }));

    const allItems = [...personalItems, ...sharedItems, ...nudgeItems].sort((a, b) =>
      b.sortKey.localeCompare(a.sortKey)
    );

    return allItems.length > 0 ? allItems : demoFeedItems;
  }, [displayFriend.nickname, friendCheckins, friendProfile, friendRoutines, nudges, profile?.id, sharedGoalCheckins, sharedGoals]);

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
          <p>친구의 완료 기록, 찌르기, 공동 목표 진행 상황을 한 번에 볼 수 있어요.</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}

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
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
