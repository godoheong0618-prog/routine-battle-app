import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import BottomTabBar from '../components/BottomTabBar';
import { useLanguage } from '../i18n/LanguageContext';
import { Locale } from '../i18n/messages';
import { getAuthCopy } from '../lib/auth';
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
  const [loading, setLoading] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);
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

  const totalCompletions = personalCheckins.filter((log) => isPositiveRoutineStatus(log.status)).length + sharedCheckins.length;
  const streak = useMemo(() => calculateStreak(personalCheckins), [personalCheckins]);
  const authCopy = useMemo(() => getAuthCopy(locale), [locale]);
  const profileLabel = formatSelfLabel(profile?.nickname, { locale, fallback: t('my.profileFallback') });
  const currentLanguageLabel = locale === 'ko' ? '한국어' : 'English';
  const email = user?.email ?? '';

  const handleLogout = async () => {
    const { error: signOutError } = await signOut();
    if (signOutError) {
      setError(authCopy.logoutError);
      return;
    }
    navigate('/login', { replace: true });
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

          <section className="service-card service-profile-card">
            <div className="service-profile-top">
              <div className="service-profile-avatar">{profileLabel.slice(0, 1)}</div>
              <div className="service-profile-copy">
                <div className="service-profile-name-row">
                  <h2>{profileLabel}</h2>
                  <span>✎</span>
                </div>
                <p>{email || 'minjun@example.com'}</p>
              </div>
            </div>

            <div className="service-profile-stats">
              <article className="service-profile-stat">
                <strong>{totalCompletions}</strong>
                <span>{locale === 'ko' ? '총 완료' : 'Completed'}</span>
              </article>
              <article className="service-profile-stat">
                <strong>{streak}</strong>
                <span>{locale === 'ko' ? '연속' : 'Streak'}</span>
              </article>
              <article className="service-profile-stat">
                <strong>{routineCount}</strong>
                <span>{locale === 'ko' ? '루틴' : 'Routines'}</span>
              </article>
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
                        <strong>{selected ? '✓' : ''}</strong>
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
