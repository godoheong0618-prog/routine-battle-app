import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import BottomTabBar from '../components/BottomTabBar';
import ProfileAvatar from '../components/profile/ProfileAvatar';
import { useLanguage } from '../i18n/LanguageContext';
import { Locale } from '../i18n/messages';
import { getAuthCopy } from '../lib/auth';
import {
  DEFAULT_AVATAR_EMOJI,
  DEFAULT_THEME_COLOR,
  PROFILE_EMOJI_OPTIONS,
  PROFILE_THEME_OPTIONS,
  ThemeColorKey,
  getProfileAppearance,
  normalizeThemeColor,
} from '../lib/profileAppearance';
import { formatSelfLabel } from '../lib/nameDisplay';
import {
  ProfileRow,
  RoutineLogRow,
  SharedGoalCheckinRow,
  calculateStreak,
  ensureProfile,
  fetchRoutineLogsForUsers,
  isPositiveRoutineStatus,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

const LANGUAGE_OPTIONS: Locale[] = ['ko', 'en'];
const PROFILE_SELECT = 'id, nickname, friend_code, friend_id, avatar_emoji, theme_color';

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="service-inline-icon">
      <path d="M12 4.75c4 0 7.25 3.25 7.25 7.25S16 19.25 12 19.25 4.75 16 4.75 12 8 4.75 12 4.75Z" />
      <path d="M8.75 12h6.5" />
      <path d="M12 4.9c1.35 1.62 2.1 4.07 2.1 7.1 0 3.03-.75 5.48-2.1 7.1-1.35-1.62-2.1-4.07-2.1-7.1 0-3.03.75-5.48 2.1-7.1Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="service-inline-icon">
      <path d="M10 7H7.75A1.75 1.75 0 0 0 6 8.75v6.5C6 16.22 6.78 17 7.75 17H10" />
      <path d="m13 8 4 4-4 4" />
      <path d="M9.5 12H17" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="service-inline-icon service-inline-icon-small">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default function MyPage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [personalCheckins, setPersonalCheckins] = useState<RoutineLogRow[]>([]);
  const [sharedCheckins, setSharedCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [routineCount, setRoutineCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_AVATAR_EMOJI);
  const [selectedTheme, setSelectedTheme] = useState<ThemeColorKey>(DEFAULT_THEME_COLOR);
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLanguage();
  const { signOut, user } = useAuth();

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        navigate('/login');
        return;
      }

      try {
        const ensuredProfile = await ensureProfile(currentUser);
        setProfile(ensuredProfile);
        setSelectedEmoji(ensuredProfile.avatar_emoji || DEFAULT_AVATAR_EMOJI);
        setSelectedTheme(normalizeThemeColor(ensuredProfile.theme_color));

        const [routineResult, checkinsResult, sharedResult] = await Promise.allSettled([
          supabase.from('routines').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
          fetchRoutineLogsForUsers([currentUser.id]),
          supabase.from('shared_goal_checkins').select('goal_id, user_id, check_date').eq('user_id', currentUser.id),
        ]);

        if (routineResult.status === 'fulfilled' && !routineResult.value.error) {
          setRoutineCount(routineResult.value.count ?? 0);
        }
        if (checkinsResult.status === 'fulfilled') {
          setPersonalCheckins(checkinsResult.value);
        }
        if (sharedResult.status === 'fulfilled' && !sharedResult.value.error) {
          setSharedCheckins((sharedResult.value.data as SharedGoalCheckinRow[]) ?? []);
        }
      } catch (loadError) {
        console.warn('MyPage load failed:', loadError);
        setError(t('my.loadError'));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate, t]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const totalCompletions =
    personalCheckins.filter((log) => isPositiveRoutineStatus(log.status)).length + sharedCheckins.length;
  const streak = useMemo(() => calculateStreak(personalCheckins), [personalCheckins]);
  const authCopy = useMemo(() => getAuthCopy(locale), [locale]);
  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: t('my.profileFallback') });
  const currentLanguageLabel = locale === 'ko' ? '한국어' : 'English';
  const email = user?.email ?? '';
  const previewAppearance = useMemo(
    () => getProfileAppearance({ avatar_emoji: selectedEmoji, theme_color: selectedTheme }),
    [selectedEmoji, selectedTheme],
  );
  const appearanceChanged =
    (profile?.avatar_emoji || DEFAULT_AVATAR_EMOJI) !== selectedEmoji ||
    normalizeThemeColor(profile?.theme_color) !== selectedTheme;

  const handleLogout = async () => {
    const { error: signOutError } = await signOut();
    if (signOutError) {
      setError(authCopy.logoutError);
      return;
    }
    navigate('/login', { replace: true });
  };

  const handleSaveAppearance = async () => {
    if (!profile) {
      return;
    }

    setSavingAppearance(true);
    setError('');
    setNotice('');

    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({
        avatar_emoji: selectedEmoji,
        theme_color: selectedTheme,
      })
      .eq('id', profile.id)
      .select(PROFILE_SELECT)
      .single();

    if (updateError) {
      console.warn('Profile appearance save failed:', updateError);
      setError(locale === 'ko' ? '프로필 꾸미기를 저장하지 못했어요.' : 'Could not save your profile style.');
      setSavingAppearance(false);
      return;
    }

    setProfile(data as ProfileRow);
    setNotice(locale === 'ko' ? '프로필 꾸미기를 저장했어요.' : 'Profile style saved.');
    setSavingAppearance(false);
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
      <div className="app-screen service-screen">
        <header className="service-simple-header">
          <h1>{locale === 'ko' ? '마이페이지' : 'My page'}</h1>
        </header>

        <main className="service-page-content service-profile-page">
          {error ? <p className="error home-error">{error}</p> : null}
          {notice ? <p className="service-inline-notice">{notice}</p> : null}

          <section
            className="service-card service-profile-card"
            style={{ background: previewAppearance.cardBackground, borderColor: previewAppearance.cardBorder }}
          >
            <div className="service-profile-top">
              <ProfileAvatar
                profile={{ avatar_emoji: selectedEmoji, theme_color: selectedTheme }}
                label={profileLabel}
                size="lg"
              />
              <div className="service-profile-copy">
                <div className="service-profile-name-row">
                  <h2>{profileLabel}</h2>
                </div>
                <p>{email || 'minjun@example.com'}</p>
              </div>
            </div>

            <div className="service-profile-stats">
              <article
                className="service-profile-stat"
                style={{ background: previewAppearance.softSurface, border: `1px solid ${previewAppearance.softBorder}` }}
              >
                <strong>{totalCompletions}</strong>
                <span>{locale === 'ko' ? '총 완료' : 'Completed'}</span>
              </article>
              <article
                className="service-profile-stat"
                style={{ background: previewAppearance.softSurface, border: `1px solid ${previewAppearance.softBorder}` }}
              >
                <strong>{streak}</strong>
                <span>{locale === 'ko' ? '연속' : 'Streak'}</span>
              </article>
              <article
                className="service-profile-stat"
                style={{ background: previewAppearance.softSurface, border: `1px solid ${previewAppearance.softBorder}` }}
              >
                <strong>{routineCount}</strong>
                <span>{locale === 'ko' ? '루틴' : 'Routines'}</span>
              </article>
            </div>
          </section>

          <section className="service-card service-profile-customize-card">
            <div className="service-section-copy">
              <h2>{locale === 'ko' ? '프로필 꾸미기' : 'Customize profile'}</h2>
              <p>
                {locale === 'ko'
                  ? '이모티콘과 테마 색을 고르면 배틀, 친구, 마이페이지에 함께 반영돼요.'
                  : 'Pick an emoji and theme color for battle, friends, and your profile.'}
              </p>
            </div>

            <div
              className="service-profile-customize-preview"
              style={{ background: previewAppearance.softSurface, borderColor: previewAppearance.softBorder }}
            >
              <ProfileAvatar
                profile={{ avatar_emoji: selectedEmoji, theme_color: selectedTheme }}
                label={profileLabel}
                size="md"
              />
              <div className="service-profile-customize-copy">
                <strong>{profileLabel}</strong>
                <p>
                  {locale === 'ko'
                    ? `${previewAppearance.label.ko} 테마 · ${selectedEmoji}`
                    : `${previewAppearance.label.en} theme · ${selectedEmoji}`}
                </p>
              </div>
            </div>

            <div className="service-profile-picker-block">
              <div className="service-picker-label-row">
                <strong>{locale === 'ko' ? '이모티콘' : 'Emoji'}</strong>
                <span>{locale === 'ko' ? '하나를 선택하세요' : 'Choose one'}</span>
              </div>
              <div className="service-emoji-grid">
                {PROFILE_EMOJI_OPTIONS.map((emoji) => {
                  const active = selectedEmoji === emoji;

                  return (
                    <button
                      key={emoji}
                      className={active ? 'service-emoji-option service-emoji-option-active' : 'service-emoji-option'}
                      type="button"
                      onClick={() => setSelectedEmoji(emoji)}
                    >
                      <span>{emoji}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="service-profile-picker-block">
              <div className="service-picker-label-row">
                <strong>{locale === 'ko' ? '테마 색' : 'Theme color'}</strong>
                <span>{locale === 'ko' ? '미리 정해진 색상만 사용할 수 있어요' : 'Preset colors only'}</span>
              </div>
              <div className="service-theme-grid">
                {PROFILE_THEME_OPTIONS.map((theme) => {
                  const active = selectedTheme === theme.key;

                  return (
                    <button
                      key={theme.key}
                      className={active ? 'service-theme-option service-theme-option-active' : 'service-theme-option'}
                      type="button"
                      onClick={() => setSelectedTheme(theme.key)}
                    >
                      <span className="service-theme-swatch" style={{ backgroundColor: theme.swatch }} />
                      <strong>{locale === 'ko' ? theme.label.ko : theme.label.en}</strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="service-customize-actions">
              <button className="primary-button" type="button" onClick={handleSaveAppearance} disabled={!appearanceChanged || savingAppearance}>
                {savingAppearance
                  ? locale === 'ko'
                    ? '저장 중...'
                    : 'Saving...'
                  : locale === 'ko'
                    ? '저장'
                    : 'Save'}
              </button>
            </div>
          </section>

          <section className="service-settings-section">
            <p className="service-settings-title">{locale === 'ko' ? '설정' : 'Settings'}</p>

            <div className="service-card service-settings-card">
              <button className="service-settings-row" type="button" onClick={() => setLanguageOpen((current) => !current)}>
                <span className="service-settings-row-copy">
                  <GlobeIcon />
                  <strong>{locale === 'ko' ? '언어' : 'Language'}</strong>
                </span>
                <span className="service-settings-row-value">
                  {currentLanguageLabel}
                  <ChevronIcon />
                </span>
              </button>

              {languageOpen ? (
                <div className="service-language-picker">
                  {LANGUAGE_OPTIONS.map((option) => {
                    const selected = locale === option;
                    const label = option === 'ko' ? '한국어' : 'English';

                    return (
                      <button
                        key={option}
                        className={selected ? 'service-language-option service-language-option-active' : 'service-language-option'}
                        type="button"
                        onClick={() => setLocale(option)}
                      >
                        <span>{label}</span>
                        <strong>{selected ? '선택됨' : ''}</strong>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <button className="service-settings-row" type="button" onClick={handleLogout}>
                <span className="service-settings-row-copy">
                  <LogoutIcon />
                  <strong>{locale === 'ko' ? '로그아웃' : 'Log out'}</strong>
                </span>
                <span className="service-settings-row-value">
                  <ChevronIcon />
                </span>
              </button>
            </div>
          </section>

          <p className="service-version-text">{locale === 'ko' ? '루틴 배틀' : 'Routine Battle'} v1.0.0</p>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
