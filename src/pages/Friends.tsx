import { FormEvent, MouseEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import { formatBattlePairLabel, formatUserCompanion, formatUserLabel } from '../lib/nameDisplay';
import {
  FriendshipRow,
  ProfileRow,
  connectFriendByCode,
  disconnectFriendConnection,
  ensureProfile,
  fetchFriendConnection,
  normalizeFriendCode,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type ToastState = {
  id: number;
  message: string;
};

export default function Friends() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [battleMeta, setBattleMeta] = useState<FriendshipRow | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [battleTitle, setBattleTitle] = useState('');
  const [wagerText, setWagerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingBattle, setSavingBattle] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const navigate = useNavigate();
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    let active = true;

    const syncConnectionState = (
      nextProfile: ProfileRow | null,
      nextFriendProfile: ProfileRow | null,
      nextFriendship: FriendshipRow | null
    ) => {
      if (!active) {
        return;
      }

      setProfile(nextProfile);
      setFriendProfile(nextFriendProfile);
      setBattleMeta(nextFriendship);
      setBattleTitle(nextFriendship?.battle_title ?? '');
      setWagerText(nextFriendship?.wager_text ?? '');
    };

    const loadFriends = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate('/login');
        return;
      }

      try {
        const ensuredProfile = await ensureProfile(user);
        const connection = await fetchFriendConnection(ensuredProfile);
        syncConnectionState(connection.profile, connection.friendProfile, connection.friendship);
      } catch (loadError) {
        console.warn('Friends load failed:', loadError);

        if (active) {
          setError(t('friends.loadError'));
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
  }, [navigate, t]);

  const showToast = (message: string) => {
    setToast({ id: Date.now(), message });
  };

  const syncConnectionState = (
    nextProfile: ProfileRow | null,
    nextFriendProfile: ProfileRow | null,
    nextFriendship: FriendshipRow | null
  ) => {
    setProfile(nextProfile);
    setFriendProfile(nextFriendProfile);
    setBattleMeta(nextFriendship);
    setBattleTitle(nextFriendship?.battle_title ?? '');
    setWagerText(nextFriendship?.wager_text ?? '');
  };

  const friendName = formatUserLabel(friendProfile?.nickname, { locale, fallback: t('common.friend') });
  const friendCompanion = formatUserCompanion(friendProfile?.nickname, { locale, fallback: t('common.friend') });
  const defaultBattleTitle = formatBattlePairLabel({
    locale,
    leftName: profile?.nickname,
    rightName: friendProfile?.nickname,
    leftFallback: t('common.me'),
  });
  const hasBattleStarted = Boolean(friendProfile && battleMeta?.battle_started_at);
  const battleActionLabel = hasBattleStarted ? t('friends.battleUpdateAction') : t('friends.battleSaveAction');
  const currentWager = battleMeta?.wager_text?.trim() || t('friends.noWager');
  const friendMenuLabel = isKo ? `${friendName} 메뉴` : `${friendName} menu`;
  const battleStateLabel = hasBattleStarted ? (isKo ? '배틀 진행 중' : 'Battle live') : isKo ? '배틀 준비 중' : 'Battle draft';
  const disconnectTitle = isKo ? '친구 연결을 해제할까요?' : 'Remove this friend connection?';
  const disconnectDescription = isKo
    ? '진행 중인 배틀과 공동 목표가 더 이상 표시되지 않을 수 있어요.'
    : 'Current battle summaries and shared goals may stop appearing.';
  const disconnectActionLabel = isKo ? '친구 끊기' : 'Remove friend';
  const disconnectSuccessMessage = isKo ? '친구 연결이 해제되었어요.' : 'Friend connection removed.';
  const disconnectErrorMessage = isKo
    ? '친구 연결을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.'
    : 'Could not remove the friend connection. Please try again.';
  const setupActionLabel = isKo ? '배틀 준비하기' : 'Set up battle';

  const handleConnectFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!profile) {
      setError(t('friends.loadError'));
      return;
    }

    setSubmitting(true);

    try {
      const connection = await connectFriendByCode(profile, inviteCode);
      const nextConnection = await fetchFriendConnection(connection.profile);

      syncConnectionState(nextConnection.profile, nextConnection.friendProfile, nextConnection.friendship);
      setInviteCode('');
      showToast(
        t('friends.connectSuccess', {
          name: formatUserCompanion(connection.friendProfile.nickname, { locale, fallback: t('common.friend') }),
        })
      );
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : t('friends.loadError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveBattleSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!friendProfile || !battleMeta) {
      showToast(t('friends.startBattleDisabled'));
      return;
    }

    setSavingBattle(true);

    const nextBattleTitle = battleTitle.trim();
    const nextWagerText = wagerText.trim();

    const { data, error: updateError } = await supabase
      .from('friendships')
      .update({
        battle_title: nextBattleTitle || defaultBattleTitle,
        wager_text: nextWagerText || null,
        battle_status: 'active',
        battle_started_at: battleMeta.battle_started_at ?? new Date().toISOString(),
      })
      .eq('id', battleMeta.id)
      .select('id, user_id, friend_id, created_at, battle_title, wager_text, battle_status, battle_started_at')
      .single();

    if (updateError) {
      console.warn('Battle setup save failed:', updateError);
      setError(t('friends.loadError'));
      setSavingBattle(false);
      return;
    }

    const nextBattleMeta = data as FriendshipRow;
    setBattleMeta(nextBattleMeta);
    setBattleTitle(nextBattleMeta.battle_title ?? '');
    setWagerText(nextBattleMeta.wager_text ?? '');
    showToast(t('friends.battleSaved'));
    setSavingBattle(false);
  };

  const handleOpenDisconnect = (event: MouseEvent<HTMLButtonElement>) => {
    setError('');
    setDisconnectOpen(true);
    event.currentTarget.closest('details')?.removeAttribute('open');
  };

  const handleDisconnectFriend = async () => {
    if (!profile) {
      setError(t('friends.loadError'));
      return;
    }

    setDisconnecting(true);
    setError('');

    try {
      const result = await disconnectFriendConnection(profile, battleMeta?.id ?? null);
      syncConnectionState(result.profile, null, null);
      setInviteCode('');
      setDisconnectOpen(false);
      showToast(disconnectSuccessMessage);
    } catch (disconnectError) {
      console.warn('Friend disconnect failed:', disconnectError);
      setError(disconnectError instanceof Error ? disconnectError.message : disconnectErrorMessage);
    } finally {
      setDisconnecting(false);
    }
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
      <div className="app-screen subpage-screen friends-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">{t('friends.eyebrow')}</p>
          <h1>{t('friends.title')}</h1>
          <p>{t('friends.description')}</p>
        </header>

        <main className="subpage-content friends-content">
          {error && <p className="error home-error">{error}</p>}

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.myCodeTitle')}</h2>
                <p className="section-description">{t('friends.myCodeDescription')}</p>
              </div>
            </div>

            <article className="empty-state-card friend-code-card friend-management-card friend-management-card-outer">
              <div className="friend-card-inner friend-code-panel">
                <h3>{profile?.friend_code ?? '--------'}</h3>
              </div>
              <p className="friend-card-supporting-copy">{t('friends.myCodeDescription')}</p>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.connectTitle')}</h2>
                <p className="section-description">{t('friends.connectDescription')}</p>
              </div>
            </div>

            <form className="invite-card friend-management-card friend-management-card-outer" onSubmit={handleConnectFriend}>
              <div className="friend-card-inner friend-form-stack">
                <input
                  type="text"
                  placeholder={t('friends.connectPlaceholder')}
                  value={inviteCode}
                  onChange={(event) => setInviteCode(normalizeFriendCode(event.target.value))}
                  disabled={Boolean(friendProfile) || submitting}
                />
                <button className="primary-button" type="submit" disabled={Boolean(friendProfile) || submitting}>
                  {submitting ? t('friends.connecting') : t('friends.connectAction')}
                </button>
              </div>
            </form>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.requestTitle')}</h2>
                <p className="section-description">{t('friends.requestDescription')}</p>
              </div>
            </div>

            <article className="empty-state-card friend-management-card friend-management-card-outer">
              <div className="friend-card-inner friend-note-panel">
                <h3>{t('friends.requestCardTitle')}</h3>
                <p>{t('friends.requestCardBody')}</p>
              </div>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.profileTitle')}</h2>
                <p className="section-description">
                  {friendProfile ? t('friends.profileConnectedBody', { name: friendCompanion }) : t('friends.profileEmptyBody')}
                </p>
              </div>
            </div>

            {friendProfile ? (
              <article className="friend-profile-card friend-management-card friend-management-card-outer">
                <div className="friend-card-inner friend-profile-panel">
                  <div className="friend-profile-card-top">
                    <div className="friend-profile-header">
                      <div className="friend-avatar">VS</div>
                      <div className="friend-copy">
                        <span className="battle-label">{t('friends.profileConnectedLabel')}</span>
                        <h3>{friendName}</h3>
                        <p>{t('friends.profileConnectedBody', { name: friendCompanion })}</p>
                      </div>
                    </div>

                    <details className="task-menu friend-card-menu">
                      <summary className="task-menu-trigger" aria-label={friendMenuLabel}>
                        <span />
                        <span />
                        <span />
                      </summary>

                      <div className="task-menu-popover">
                        <button className="task-menu-item task-menu-item-danger" type="button" onClick={handleOpenDisconnect}>
                          {disconnectActionLabel}
                        </button>
                      </div>
                    </details>
                  </div>

                  <div className="friend-profile-meta">
                    <span className="battle-meta-pill">{battleStateLabel}</span>
                    <span className="battle-meta-pill">{battleMeta?.battle_title?.trim() || defaultBattleTitle}</span>
                    <span className="battle-meta-pill">{currentWager}</span>
                  </div>
                </div>

                <div className="friend-profile-actions">
                  {hasBattleStarted ? (
                    <Link className="inline-action-link" to="/battle">
                      {t('friends.profileBattleLink')}
                    </Link>
                  ) : (
                    <a className="inline-action-link" href="#battle-setup-card">
                      {setupActionLabel}
                    </a>
                  )}
                </div>
              </article>
            ) : (
              <article className="empty-state-card friend-management-card friend-management-card-outer">
                <div className="friend-card-inner friend-note-panel">
                  <h3>{t('friends.profileEmptyTitle')}</h3>
                  <p>{t('friends.profileEmptyBody')}</p>
                </div>
              </article>
            )}
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.startBattleTitle')}</h2>
                <p className="section-description">
                  {friendProfile ? t('friends.startBattleDescription') : t('friends.startBattleDisabled')}
                </p>
              </div>
            </div>

            <form
              id="battle-setup-card"
              className="invite-card battle-setup-form friend-management-card friend-management-card-outer"
              onSubmit={handleSaveBattleSetup}
            >
              <div className="friend-card-inner friend-battle-form-panel">
                <label className="field-group" htmlFor="battle-title">
                  <span>{t('friends.battleTitleLabel')}</span>
                  <input
                    id="battle-title"
                    type="text"
                    placeholder={t('friends.battleTitlePlaceholder')}
                    value={battleTitle}
                    onChange={(event) => setBattleTitle(event.target.value)}
                    maxLength={50}
                    disabled={!friendProfile || savingBattle}
                  />
                </label>

                <label className="field-group" htmlFor="battle-wager">
                  <span>{t('friends.wagerLabel')}</span>
                  <input
                    id="battle-wager"
                    type="text"
                    placeholder={t('friends.wagerPlaceholder')}
                    value={wagerText}
                    onChange={(event) => setWagerText(event.target.value)}
                    maxLength={60}
                    disabled={!friendProfile || savingBattle}
                  />
                </label>
              </div>

              <button className="primary-button" type="submit" disabled={!friendProfile || !battleMeta || savingBattle}>
                {savingBattle ? t('home.saving') : battleActionLabel}
              </button>
            </form>
          </section>
        </main>

        {toast && (
          <div className="home-toast" role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        {disconnectOpen && (
          <div className="modal-backdrop" role="presentation" onClick={() => !disconnecting && setDisconnectOpen(false)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="disconnect-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="disconnect-title" className="modal-title">
                {disconnectTitle}
              </h2>
              <p className="modal-copy">{disconnectDescription}</p>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setDisconnectOpen(false)} disabled={disconnecting}>
                  {isKo ? '취소' : 'Cancel'}
                </button>
                <button className="danger-button" type="button" onClick={handleDisconnectFriend} disabled={disconnecting}>
                  {disconnecting ? t('home.saving') : disconnectActionLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomTabBar />
      </div>
    </div>
  );
}
