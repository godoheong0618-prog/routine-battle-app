import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import {
  formatBattlePairLabel,
  formatUserCompanion,
  formatUserLabel,
} from '../lib/nameDisplay';
import {
  FriendshipRow,
  ProfileRow,
  connectFriendByCode,
  ensureProfile,
  fetchFriendshipByUsers,
  fetchProfile,
  normalizeFriendCode,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

export default function Friends() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [friendProfile, setFriendProfile] = useState<ProfileRow | null>(null);
  const [battleMeta, setBattleMeta] = useState<FriendshipRow | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [battleTitle, setBattleTitle] = useState('');
  const [wagerText, setWagerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingBattle, setSavingBattle] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const { locale, t } = useLanguage();

  useEffect(() => {
    let active = true;

    const syncBattleInputs = (friendship: FriendshipRow | null) => {
      if (!active) {
        return;
      }

      setBattleMeta(friendship);
      setBattleTitle(friendship?.battle_title ?? '');
      setWagerText(friendship?.wager_text ?? '');
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

        const friendship = await fetchFriendshipByUsers(user.id, connectedFriend?.id ?? null);
        syncBattleInputs(friendship);
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

  const friendName = formatUserLabel(friendProfile?.nickname, { locale, fallback: t('common.friend') });
  const friendCompanion = formatUserCompanion(friendProfile?.nickname, { locale, fallback: t('common.friend') });
  const defaultBattleTitle = formatBattlePairLabel({
    locale,
    leftName: profile?.nickname,
    rightName: friendProfile?.nickname,
    leftFallback: t('common.me'),
  });
  const battleActionLabel = battleMeta?.battle_started_at ? t('friends.battleUpdateAction') : t('friends.battleSaveAction');
  const currentWager = battleMeta?.wager_text?.trim() || t('friends.noWager');

  const handleConnectFriend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!profile) {
      setError(t('friends.loadError'));
      return;
    }

    setSubmitting(true);

    try {
      const connection = await connectFriendByCode(profile, inviteCode);
      const friendship = await fetchFriendshipByUsers(profile.id, connection.friendProfile.id);

      setProfile(connection.profile);
      setFriendProfile(connection.friendProfile);
      setInviteCode('');
      setBattleMeta(friendship);
      setBattleTitle(friendship?.battle_title ?? '');
      setWagerText(friendship?.wager_text ?? '');
      setNotice(
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
    setNotice('');

    if (!friendProfile || !battleMeta) {
      setNotice(t('friends.startBattleDisabled'));
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
    setNotice(t('friends.battleSaved'));
    setSavingBattle(false);
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
        <header className="subpage-header">
          <p className="section-eyebrow">{t('friends.eyebrow')}</p>
          <h1>{t('friends.title')}</h1>
          <p>{t('friends.description')}</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}
          {notice && <p className="notice-text">{notice}</p>}

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.myCodeTitle')}</h2>
                <p className="section-description">{t('friends.myCodeDescription')}</p>
              </div>
            </div>

            <article className="empty-state-card friend-code-card">
              <h3>{profile?.friend_code ?? '--------'}</h3>
              <p>{t('friends.myCodeDescription')}</p>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.connectTitle')}</h2>
                <p className="section-description">{t('friends.connectDescription')}</p>
              </div>
            </div>

            <form className="invite-card" onSubmit={handleConnectFriend}>
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
            </form>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('friends.requestTitle')}</h2>
                <p className="section-description">{t('friends.requestDescription')}</p>
              </div>
            </div>

            <article className="empty-state-card">
              <h3>{t('friends.requestCardTitle')}</h3>
              <p>{t('friends.requestCardBody')}</p>
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
              <article className="friend-profile-card">
                <div className="friend-profile-header">
                  <div className="friend-avatar">VS</div>
                  <div className="friend-copy">
                    <span className="battle-label">{t('friends.profileConnectedLabel')}</span>
                    <h3>{friendName}</h3>
                    <p>{t('friends.profileConnectedBody', { name: friendCompanion })}</p>
                  </div>
                </div>

                <div className="friend-profile-meta">
                  <span className="battle-meta-pill">{battleMeta?.battle_title?.trim() || defaultBattleTitle}</span>
                  <span className="battle-meta-pill">{currentWager}</span>
                </div>

                <Link className="inline-action-link" to="/battle">
                  {t('friends.profileBattleLink')}
                </Link>
              </article>
            ) : (
              <article className="empty-state-card">
                <h3>{t('friends.profileEmptyTitle')}</h3>
                <p>{t('friends.profileEmptyBody')}</p>
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

            <form className="invite-card battle-setup-form" onSubmit={handleSaveBattleSetup}>
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

              <button className="primary-button" type="submit" disabled={!friendProfile || !battleMeta || savingBattle}>
                {savingBattle ? t('home.saving') : battleActionLabel}
              </button>
            </form>
          </section>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
