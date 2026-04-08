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

export default function MyPage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [personalCheckins, setPersonalCheckins] = useState<RoutineLogRow[]>([]);
  const [sharedCheckins, setSharedCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [routineCount, setRoutineCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLanguage();
  const { signOut } = useAuth();

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate('/login');
        return;
      }

      try {
        const ensuredProfile = await ensureProfile(user);
        setProfile(ensuredProfile);

        const [routineResult, checkinsResult, sharedResult] = await Promise.allSettled([
          supabase.from('routines').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          fetchRoutineLogsForUsers([user.id]),
          supabase.from('shared_goal_checkins').select('goal_id, user_id, check_date').eq('user_id', user.id),
        ]);

        if (routineResult.status === 'fulfilled' && !routineResult.value.error) {
          setRoutineCount(routineResult.value.count ?? 0);
        } else {
          console.warn('MyPage optional routine count load failed:', routineResult);
        }

        if (checkinsResult.status === 'fulfilled') {
          setPersonalCheckins(checkinsResult.value);
        } else {
          console.warn('MyPage optional personal checkins load failed:', checkinsResult);
        }

        if (sharedResult.status === 'fulfilled' && !sharedResult.value.error) {
          setSharedCheckins((sharedResult.value.data as SharedGoalCheckinRow[]) ?? []);
        } else {
          console.warn('MyPage optional shared checkins load failed:', sharedResult);
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
      <div className="app-screen subpage-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">{t('my.eyebrow')}</p>
          <h1>{t('my.title')}</h1>
          <p>{t('my.description')}</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}

          <section className="stats-grid">
            <article className="stat-card">
              <span>{t('my.profileLabel')}</span>
              <strong>{profileLabel}</strong>
            </article>
            <article className="stat-card">
              <span>{t('my.totalCompletionsLabel')}</span>
              <strong>{t('my.countTimes', { count: totalCompletions })}</strong>
            </article>
            <article className="stat-card">
              <span>{t('my.streakLabel')}</span>
              <strong>{t('my.countDays', { count: streak })}</strong>
            </article>
            <article className="stat-card">
              <span>{t('my.routinesLabel')}</span>
              <strong>{t('my.countItems', { count: routineCount })}</strong>
            </article>
          </section>

          <section className="section-block">
            <div className="section-header section-header-stack">
              <div>
                <h2>{t('my.languageTitle')}</h2>
                <p className="section-description">{t('my.languageDescription')}</p>
              </div>
            </div>

            <div className="language-option-list">
              {LANGUAGE_OPTIONS.map((option) => {
                const selected = locale === option;
                const label = option === 'ko' ? t('my.languageKo') : t('my.languageEn');

                return (
                  <button
                    key={option}
                    className={selected ? 'language-option language-option-active' : 'language-option'}
                    type="button"
                    onClick={() => setLocale(option)}
                    aria-pressed={selected}
                  >
                    <div className="language-option-copy">
                      <strong>{label}</strong>
                    </div>
                    <span className="language-option-check">{selected ? t('my.selected') : ''}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <button className="secondary-button logout-button" type="button" onClick={handleLogout}>
            {t('my.logout')}
          </button>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
