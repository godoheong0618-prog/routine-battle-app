import { FormEvent, useEffect, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import { formatBattlePairLabel, formatUserCompanion, formatUserLabel } from '../lib/nameDisplay';
import {
  FriendshipRow,
  ProfileRow,
  RoutineRow,
  calculateStreak,
  connectFriendByCode,
  disconnectFriendConnection,
  ensureProfile,
  fetchFriendConnection,
  fetchRoutineLogsForUsers,
  getTodayDayKey,
  getTodayKey,
  getWeekDateKeys,
  isFriendshipBattleMetaMissing,
  isPositiveRoutineStatus,
  isRoutineVisibleToday,
  normalizeFriendCode,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type ToastState = { id: number; message: string };
type FriendStats = { todayDone: number; todayTotal: number; streak: number; weekWins: number };

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="service-inline-icon">
      <path d="M9 8.25h7.25c.97 0 1.75.78 1.75 1.75v7.25c0 .97-.78 1.75-1.75 1.75H9A1.75 1.75 0 0 1 7.25 17.25V10c0-.97.78-1.75 1.75-1.75Z" />
      <path d="M6.75 15.5A1.75 1.75 0 0 1 5 13.75V6.75C5 5.78 5.78 5 6.75 5h7" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="service-inline-icon">
      <path d="M9 11.25c1.8 0 3.25-1.46 3.25-3.25S10.8 4.75 9 4.75 5.75 6.2 5.75 8 7.2 11.25 9 11.25Z" />
      <path d="M4.75 18.75c.8-2.1 2.7-3.35 4.9-3.35 1.58 0 3 .52 4 1.45" />
      <path d="M17.5 8v6" />
      <path d="M14.5 11h6" />
    </svg>
  );
}

export default function Friends() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [battleMeta, setBattleMeta] = useState<FriendshipRow | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [battleTitle, setBattleTitle] = useState('');
  const [wagerText, setWagerText] = useState('');
  const [friendStats, setFriendStats] = useState<FriendStats>({ todayDone: 0, todayTotal: 0, streak: 0, weekWins: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingBattle, setSavingBattle] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingBattle, setEditingBattle] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const { locale } = useLanguage();
  const isKo = locale === 'ko';
  const todayKey = getTodayKey();
  const todayDayKey = getTodayDayKey();
  const weekKeys = getWeekDateKeys();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadFriends = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      return;
    }

    try {
      const ensuredProfile = await ensureProfile(user);
      const connection = await fetchFriendConnection(ensuredProfile);
      setProfile(connection.profile);
      setFriendProfile(connection.friendProfile);
      setBattleMeta(connection.friendship);
      setBattleTitle(connection.friendship?.battle_title ?? '');
      setWagerText(connection.friendship?.wager_text ?? '');
      setEditingBattle(!connection.friendship?.battle_title);

      if (connection.friendProfile) {
        const ids = [user.id, connection.friendProfile.id];
        const [{ data: routinesData, error: routinesError }, logs] = await Promise.all([
          supabase.from('routines').select('*').in('user_id', ids),
          fetchRoutineLogsForUsers(ids),
        ]);

        if (routinesError) {
          throw routinesError;
        }

        const allRoutines = ((routinesData as RoutineRow[]) ?? []).filter((routine) => !routine.is_template);
        const friendRoutines = allRoutines.filter((routine) => routine.user_id === connection.friendProfile?.id);
        const myLogs = logs.filter((log) => log.user_id === user.id);
        const friendLogs = logs.filter((log) => log.user_id === connection.friendProfile?.id);

        const weekWins = weekKeys.filter((dateKey) => {
          const myDay = myLogs.filter((log) => log.log_date === dateKey && isPositiveRoutineStatus(log.status)).length;
          const friendDay = friendLogs.filter((log) => log.log_date === dateKey && isPositiveRoutineStatus(log.status)).length;
          return friendDay > myDay;
        }).length;

        setFriendStats({
          todayDone: friendLogs.filter((log) => log.log_date === todayKey && isPositiveRoutineStatus(log.status)).length,
          todayTotal: friendRoutines.filter((routine) => isRoutineVisibleToday(routine, todayDayKey)).length,
          streak: calculateStreak(friendLogs),
          weekWins,
        });
      } else {
        setFriendStats({ todayDone: 0, todayTotal: 0, streak: 0, weekWins: 0 });
      }
    } catch (loadError) {
      console.warn('Friends load failed:', loadError);
      setError(isKo ? '친구 정보를 불러오지 못했어요.' : 'Could not load friend info.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFriends();
  }, []);

  const showToast = (message: string) => setToast({ id: Date.now(), message });
  const friendName = formatUserLabel(friendProfile?.nickname, { locale, fallback: isKo ? '친구' : 'Friend' });
  const friendCompanion = formatUserCompanion(friendProfile?.nickname, { locale, fallback: isKo ? '친구' : 'Friend' });
  const defaultBattleTitle = formatBattlePairLabel({ locale, leftName: profile?.nickname, rightName: friendProfile?.nickname, leftFallback: isKo ? '나' : 'Me' });

  const handleCopyCode = async () => {
    if (!profile?.friend_code) return;
    try {
      await navigator.clipboard.writeText(profile.friend_code);
      showToast(isKo ? '초대 코드를 복사했어요.' : 'Invite code copied.');
    } catch {
      showToast(isKo ? '복사하지 못했어요.' : 'Could not copy the code.');
    }
  };

  const handleConnectFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    setError('');
    try {
      await connectFriendByCode(profile, inviteCode);
      setInviteCode('');
      showToast(isKo ? '친구를 연결했어요.' : 'Friend connected.');
      await loadFriends();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : isKo ? '친구 연결에 실패했어요.' : 'Could not connect your friend.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveBattleSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!friendProfile || !battleMeta) return;
    setSavingBattle(true);
    setError('');
    const { error: updateError } = await supabase
      .from('friendships')
      .update({
        battle_title: battleTitle.trim() || defaultBattleTitle,
        wager_text: wagerText.trim() || null,
        battle_status: 'active',
        battle_started_at: battleMeta.battle_started_at ?? new Date().toISOString(),
      })
      .eq('id', battleMeta.id);

    if (updateError) {
      console.warn('Battle setup save failed:', updateError);
      setError(
        isFriendshipBattleMetaMissing(updateError)
          ? isKo
            ? 'DB에 배틀 설정 컬럼이 아직 없어요. SQL을 먼저 적용해주세요.'
            : 'Battle setup columns are missing in the database. Apply the SQL first.'
          : isKo
            ? '배틀 설정을 저장하지 못했어요.'
            : 'Could not save battle setup.'
      );
      setSavingBattle(false);
      return;
    }

    setEditingBattle(false);
    showToast(isKo ? '배틀 설정을 저장했어요.' : 'Battle setup saved.');
    await loadFriends();
    setSavingBattle(false);
  };

  const handleDisconnectFriend = async () => {
    if (!profile) return;
    const confirmed = window.confirm(isKo ? '친구 연결을 해제할까요?' : 'Remove this friend connection?');
    if (!confirmed) return;
    setDisconnecting(true);
    setError('');
    try {
      await disconnectFriendConnection(profile, battleMeta?.id ?? null);
      showToast(isKo ? '친구 연결을 해제했어요.' : 'Friend connection removed.');
      await loadFriends();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : isKo ? '친구 연결을 해제하지 못했어요.' : 'Could not remove the friend connection.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{isKo ? '불러오는 중...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen service-screen">
        <header className="service-simple-header service-friends-header">
          <h1>{isKo ? '친구' : 'Friends'}</h1>
          <p>{isKo ? '친구와 연결하고 함께 성장하세요' : 'Connect and grow together'}</p>
        </header>

        <main className="service-page-content service-friends-page">
          {error ? <p className="error home-error">{error}</p> : null}

          <section className="service-card service-invite-card">
            <p className="service-card-label">{isKo ? '내 초대 코드' : 'My invite code'}</p>
            <div className="service-invite-code-row">
              <strong>{profile?.friend_code ?? '--------'}</strong>
              <button className="service-circle-button" type="button" onClick={handleCopyCode} aria-label={isKo ? '초대 코드 복사' : 'Copy invite code'}>
                <CopyIcon />
              </button>
            </div>
            <p>{isKo ? '친구에게 이 코드를 공유하면 바로 연결됩니다' : 'Share this code and your friend can connect instantly.'}</p>
          </section>

          {!friendProfile ? (
            <section className="service-card service-connect-card">
              <form className="service-form-stack" onSubmit={handleConnectFriend}>
                <label className="field-group" htmlFor="friend-code">
                  <span>{isKo ? '친구 코드' : 'Friend code'}</span>
                  <input
                    id="friend-code"
                    type="text"
                    placeholder={isKo ? '친구 코드를 입력하세요' : 'Enter friend code'}
                    value={inviteCode}
                    onChange={(event) => setInviteCode(normalizeFriendCode(event.target.value))}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? (isKo ? '연결 중...' : 'Connecting...') : isKo ? '친구 연결하기' : 'Connect friend'}
                </button>
              </form>
            </section>
          ) : (
            <>
              <section className="service-card service-friend-profile-card">
                <div className="service-friend-profile-top">
                  <div className="service-friend-avatar">{friendName.slice(0, 1)}</div>
                  <div className="service-friend-copy">
                    <h2>{friendName}</h2>
                    <p>{friendProfile.friend_code ?? 'BATTLE-0000'}</p>
                  </div>
                  <button className="service-ghost-icon-button" type="button" onClick={handleDisconnectFriend} disabled={disconnecting} aria-label={isKo ? '친구 연결 해제' : 'Disconnect friend'}>
                    <UserPlusIcon />
                  </button>
                </div>

                <div className="service-friend-stat-grid">
                  <article className="service-friend-stat-card">
                    <strong>{friendStats.todayDone}/{friendStats.todayTotal || 0}</strong>
                    <span>{isKo ? '오늘' : 'Today'}</span>
                  </article>
                  <article className="service-friend-stat-card">
                    <strong>{friendStats.streak}</strong>
                    <span>{isKo ? '연속' : 'Streak'}</span>
                  </article>
                  <article className="service-friend-stat-card">
                    <strong>{friendStats.weekWins}</strong>
                    <span>{isKo ? '주간 승' : 'Weekly wins'}</span>
                  </article>
                </div>
              </section>

              <section className="service-card service-battle-settings-card">
                <div className="service-battle-settings-head">
                  <div>
                    <h2>{isKo ? '배틀 설정' : 'Battle setup'}</h2>
                    <p>{isKo ? `${friendCompanion}과의 배틀 정보를 정리해두세요` : `Keep the battle details with ${friendCompanion} tidy`}</p>
                  </div>
                  <button className="service-text-link" type="button" onClick={() => setEditingBattle((current) => !current)}>
                    {editingBattle ? (isKo ? '닫기' : 'Close') : isKo ? '수정' : 'Edit'}
                  </button>
                </div>

                {editingBattle ? (
                  <form className="service-form-stack" onSubmit={handleSaveBattleSetup}>
                    <label className="field-group" htmlFor="battle-title">
                      <span>{isKo ? '배틀 이름' : 'Battle name'}</span>
                      <input id="battle-title" type="text" value={battleTitle} onChange={(event) => setBattleTitle(event.target.value)} placeholder={defaultBattleTitle} />
                    </label>
                    <label className="field-group" htmlFor="battle-wager">
                      <span>{isKo ? '내기' : 'Wager'}</span>
                      <input id="battle-wager" type="text" value={wagerText} onChange={(event) => setWagerText(event.target.value)} placeholder={isKo ? '예: 진 사람이 커피 사기' : 'e.g. Loser buys coffee'} />
                    </label>
                    <button className="primary-button" type="submit" disabled={savingBattle}>
                      {savingBattle ? (isKo ? '저장 중...' : 'Saving...') : isKo ? '저장' : 'Save'}
                    </button>
                  </form>
                ) : (
                  <div className="service-battle-settings-body">
                    <div className="service-setting-pair">
                      <span>{isKo ? '배틀 이름' : 'Battle name'}</span>
                      <strong>{battleMeta?.battle_title?.trim() || defaultBattleTitle}</strong>
                    </div>
                    <div className="service-setting-pair">
                      <span>{isKo ? '내기' : 'Wager'}</span>
                      <strong>{battleMeta?.wager_text?.trim() || (isKo ? '아직 없음' : 'Not set')}</strong>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        {toast ? (
          <div className="home-toast" role="status" aria-live="polite">
            {toast.message}
          </div>
        ) : null}

        <BottomTabBar />
      </div>
    </div>
  );
}
