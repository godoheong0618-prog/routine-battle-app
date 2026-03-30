import { FormEvent, useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import {
  DEMO_FRIEND,
  NudgeRow,
  ProfileRow,
  connectFriendByCode,
  ensureProfile,
  fetchProfile,
  getDisplayFriendProfile,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

const demoNudges: NudgeRow[] = [
  {
    id: 'demo-nudge-1',
    sender_id: DEMO_FRIEND.id,
    receiver_id: 'me',
    message: '오늘 루틴 체크했어?',
    created_at: new Date().toISOString(),
  },
];

export default function Friends() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const loadFriends = async () => {
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
          console.warn('Friends optional friend load failed:', friendError);
          setFriendProfile(null);
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
              .limit(6);

            if (nudgeError) {
              throw nudgeError;
            }

            setNudges((data as NudgeRow[]) ?? []);
          } catch (nudgeError) {
            console.warn('Friends optional nudges load failed:', nudgeError);
            setNudges([]);
          }
        } else {
          setNudges([]);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '친구 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadFriends();
  }, []);

  const displayFriend = useMemo(() => getDisplayFriendProfile(friendProfile), [friendProfile]);
  const usingDemoFriend = !friendProfile;
  const displayNudges = usingDemoFriend ? demoNudges : nudges;

  const handleConnectFriend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!profile) {
      setError('내 프로필을 먼저 불러와 주세요.');
      return;
    }

    try {
      const connection = await connectFriendByCode(profile, inviteCode);
      setProfile(connection.profile);
      setFriendProfile(connection.friendProfile);
      setInviteCode('');
      setNotice('친구 연결이 완료됐어요. 이제 실제 친구 데이터가 반영됩니다.');
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : '친구 연결에 실패했습니다.');
    }
  };

  const handleSendNudge = async () => {
    setError('');
    setNotice('');

    if (!userId) {
      setError('로그인 상태를 확인해 주세요.');
      return;
    }

    if (usingDemoFriend) {
      setNotice('데모 친구에게 찌르기를 보냈어요. 실제 연결 후에는 진짜 친구에게 전송됩니다.');
      return;
    }

    const { data, error: nudgeError } = await supabase
      .from('nudges')
      .insert({
        sender_id: userId,
        receiver_id: displayFriend.id,
        message: '오늘 루틴 아직 안 했어?',
      })
      .select('id, sender_id, receiver_id, message, created_at')
      .single();

    if (nudgeError) {
      setError(nudgeError.message);
      return;
    }

    setNudges((current) => [data as NudgeRow, ...current].slice(0, 6));
    setNotice(`${displayFriend.nickname || '친구'}에게 찌르기를 보냈어요.`);
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
          <p className="section-eyebrow">Friends</p>
          <h1>친구 연결</h1>
          <p>초대 코드로 1:1 친구를 연결하고, 루틴 배틀과 찌르기를 시작해 보세요.</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          <section className="section-block">
            <div className="section-header">
              <h2>내 초대 코드</h2>
              <span>공유하기</span>
            </div>
            <article className="empty-state-card">
              <h3>{profile?.friend_code ?? '생성 중...'}</h3>
              <p>친구가 이 코드를 입력하면 바로 1:1 루틴 배틀 상대가 됩니다.</p>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>친구 코드 입력</h2>
              <span>실제 연결</span>
            </div>
            <form className="invite-card" onSubmit={handleConnectFriend}>
              <input
                type="text"
                placeholder="친구 코드를 입력하세요"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={!!friendProfile}
              />
              <button className="primary-button" type="submit" disabled={!!friendProfile}>
                친구 연결하기
              </button>
            </form>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>연결 상태</h2>
              <span>{usingDemoFriend ? '데모 친구' : '실제 친구 연결됨'}</span>
            </div>
            <article className="friend-card">
              <div className="friend-avatar">VS</div>
              <div className="friend-copy">
                <h3>{displayFriend.nickname || '친구'}</h3>
                <p>
                  {usingDemoFriend
                    ? '아직 실제 연결 전이라 데모 친구가 대신 보이고 있어요.'
                    : '지금 이 친구와 1:1 루틴 배틀 중입니다.'}
                </p>
              </div>
              <button className="secondary-button friend-action" type="button" onClick={handleSendNudge}>
                찌르기 보내기
              </button>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>최근 찌르기</h2>
              <span>최대 6개</span>
            </div>
            <div className="feed-list">
              {displayNudges.map((nudge) => (
                <article key={nudge.id} className="feed-card">
                  <div className="feed-avatar">!</div>
                  <div className="feed-copy">
                    <h3>
                      {nudge.sender_id === userId
                        ? '내가 보낸 찌르기'
                        : `${displayFriend.nickname || '친구'}가 보낸 찌르기`}
                    </h3>
                    <p>{nudge.message}</p>
                  </div>
                  <span className="feed-time">{new Date(nudge.created_at).toLocaleDateString()}</span>
                </article>
              ))}
            </div>
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
