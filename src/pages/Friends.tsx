import { FormEvent, useEffect, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import { NudgeRow, ProfileRow, connectFriendByCode, ensureProfile, fetchProfile, normalizeFriendCode } from '../lib/mvp';
import { supabase } from '../supabaseClient';

export default function Friends() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;

    const loadNudges = async (currentUserId: string, currentFriendId: string) => {
      const { data, error: nudgeError } = await supabase
        .from('nudges')
        .select('id, sender_id, receiver_id, message, created_at')
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${currentFriendId}),and(sender_id.eq.${currentFriendId},receiver_id.eq.${currentUserId})`
        )
        .order('created_at', { ascending: false })
        .limit(6);

      if (nudgeError) {
        throw nudgeError;
      }

      if (active) {
        setNudges((data as NudgeRow[]) ?? []);
      }
    };

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

        if (!active) {
          return;
        }

        setProfile(ensuredProfile);

        const connectedFriend = await fetchProfile(ensuredProfile.friend_id);

        if (!active) {
          return;
        }

        setFriendProfile(connectedFriend);

        if (connectedFriend) {
          await loadNudges(user.id, connectedFriend.id);
        } else {
          setNudges([]);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : '친구 정보를 불러오지 못했어요.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadFriends();

    return () => {
      active = false;
    };
  }, []);

  const friendName = friendProfile?.nickname || '친구';

  const handleConnectFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!profile) {
      setError('내 프로필을 불러온 뒤 다시 시도해 주세요.');
      return;
    }

    setSubmitting(true);

    try {
      const connection = await connectFriendByCode(profile, inviteCode);
      setProfile(connection.profile);
      setFriendProfile(connection.friendProfile);
      setInviteCode('');
      setNudges([]);
      setNotice(`${connection.friendProfile.nickname || '친구'}와 연결됐어요.`);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : '친구 연결에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNudge = async () => {
    setError('');
    setNotice('');

    if (!userId || !friendProfile) {
      setError('먼저 친구를 연결해 주세요.');
      return;
    }

    const { data, error: nudgeError } = await supabase
      .from('nudges')
      .insert({
        sender_id: userId,
        receiver_id: friendProfile.id,
        message: '오늘 루틴 아직 안 했지?',
      })
      .select('id, sender_id, receiver_id, message, created_at')
      .single();

    if (nudgeError) {
      setError(nudgeError.message);
      return;
    }

    setNudges((current) => [data as NudgeRow, ...current].slice(0, 6));
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
          <p className="section-eyebrow">Friends</p>
          <h1>친구 연결</h1>
          <p>초대 코드로 친구를 연결하고 실제 친구 데이터만 확인할 수 있어요.</p>
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
              <p>친구가 이 코드를 입력하면 바로 1:1 루틴 연결이 시작돼요.</p>
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
                placeholder="친구 코드를 입력해 주세요"
                value={inviteCode}
                onChange={(event) => setInviteCode(normalizeFriendCode(event.target.value))}
                disabled={Boolean(friendProfile) || submitting}
              />
              <button className="primary-button" type="submit" disabled={Boolean(friendProfile) || submitting}>
                {submitting ? '연결 중...' : '친구 연결하기'}
              </button>
            </form>
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>연결된 친구</h2>
              <span>{friendProfile ? '1명 연결됨' : '아직 없음'}</span>
            </div>

            {friendProfile ? (
              <article className="friend-card">
                <div className="friend-avatar">VS</div>
                <div className="friend-copy">
                  <h3>{friendName}</h3>
                  <p>지금 이 친구와 실제 데이터로 루틴 배틀을 진행 중이에요.</p>
                </div>
                <button className="secondary-button friend-action" type="button" onClick={handleSendNudge}>
                  찌르기 보내기
                </button>
              </article>
            ) : (
              <article className="empty-state-card">
                <h3>연결된 친구가 아직 없어요</h3>
                <p>위 초대 코드 입력으로 실제 친구를 연결하면 이곳에 표시돼요.</p>
              </article>
            )}
          </section>

          <section className="section-block">
            <div className="section-header">
              <h2>최근 찌르기</h2>
              <span>{nudges.length}개</span>
            </div>

            {!friendProfile ? (
              <article className="empty-state-card">
                <h3>친구를 연결하면 찌르기를 볼 수 있어요</h3>
                <p>데모 메시지 없이 실제 친구와 주고받은 기록만 표시돼요.</p>
              </article>
            ) : nudges.length === 0 ? (
              <article className="empty-state-card">
                <h3>아직 찌르기가 없어요</h3>
                <p>먼저 한 번 보내서 실제 기록을 만들어 보세요.</p>
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
