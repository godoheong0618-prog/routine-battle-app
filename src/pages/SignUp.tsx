import type { Provider } from '@supabase/supabase-js';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../i18n/LanguageContext';
import { resolvePostAuthPath } from '../lib/appFlow';
import {
  getAuthCopy,
  getAuthRedirectUrl,
  getLocalizedAuthErrorMessage,
  getProviderUnavailableMessage,
  isAppleAuthEnabled,
  isGoogleAuthEnabled,
} from '../lib/auth';
import { supabase } from '../supabaseClient';

type PendingAction = 'email' | Provider | null;

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { locale } = useLanguage();

  const copy = useMemo(() => getAuthCopy(locale), [locale]);
  const appleEnabled = isAppleAuthEnabled();
  const googleEnabled = isGoogleAuthEnabled();

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    let active = true;

    const redirectSignedInUser = async () => {
      const nextPath = await resolvePostAuthPath(user);

      if (active) {
        navigate(nextPath, { replace: true });
      }
    };

    redirectSignedInUser();

    return () => {
      active = false;
    };
  }, [loading, navigate, user]);

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setPendingAction('email');

    const {
      data: { session },
      error: signUpError,
    } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    if (signUpError) {
      setError(getLocalizedAuthErrorMessage(signUpError, locale));
      setPendingAction(null);
      return;
    }

    if (session) {
      const nextPath = await resolvePostAuthPath();
      navigate(nextPath, { replace: true });
      return;
    }

    navigate('/login', {
      replace: true,
      state: { notice: copy.emailVerificationNotice },
    });
  };

  const handleSocialSignUp = async (provider: Provider) => {
    setError('');
    setNotice('');

    if (provider === 'google' && !googleEnabled) {
      setNotice(getProviderUnavailableMessage(provider, locale));
      return;
    }

    if (provider === 'apple' && !appleEnabled) {
      setNotice(getProviderUnavailableMessage(provider, locale));
      return;
    }

    setPendingAction(provider);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined,
      },
    });

    if (oauthError) {
      setError(getLocalizedAuthErrorMessage(oauthError, locale));
      setPendingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{copy.callbackLoading}</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen auth-screen">
        <div className="container auth-container">
          <div className="auth-copy">
            <p className="section-eyebrow">{copy.signUpEyebrow}</p>
            <h1>{copy.signUpTitle}</h1>
            <p>{copy.signUpSubtitle}</p>
          </div>

          <form onSubmit={handleSignUp}>
            <input
              required
              autoComplete="email"
              type="email"
              placeholder={copy.emailPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pendingAction !== null}
            />
            <input
              required
              autoComplete="new-password"
              minLength={6}
              type="password"
              placeholder={copy.passwordPlaceholder}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pendingAction !== null}
            />
            <p className="auth-helper">{copy.passwordHint}</p>
            {error && <p className="error">{error}</p>}
            {notice && <p className="notice-text auth-notice">{notice}</p>}
            <button type="submit" disabled={pendingAction !== null}>
              {pendingAction === 'email' ? copy.signUpLoadingAction : copy.signUpPrimaryAction}
            </button>

            <div className="auth-divider" aria-hidden="true">
              <span>{copy.divider}</span>
            </div>

            <div className="auth-social-list">
              <button
                className="auth-social-button"
                type="button"
                onClick={() => handleSocialSignUp('google')}
                disabled={pendingAction !== null || !googleEnabled}
              >
                <span className="auth-provider-mark">G</span>
                <span className="auth-social-label">
                  {pendingAction === 'google' ? copy.signUpSocialLoading : copy.continueWithGoogle}
                </span>
              </button>

              <button
                className={appleEnabled ? 'auth-social-button' : 'auth-social-button auth-social-button-disabled'}
                type="button"
                onClick={() => handleSocialSignUp('apple')}
                disabled={pendingAction !== null || !appleEnabled}
                aria-disabled={!appleEnabled}
              >
                <span className="auth-provider-mark">A</span>
                <span className="auth-social-label">
                  {pendingAction === 'apple' ? copy.signUpSocialLoading : copy.continueWithApple}
                </span>
                {!appleEnabled && <small className="auth-social-meta">{copy.appleDisabledLabel}</small>}
              </button>
            </div>
          </form>

          <Link className="auth-link" to="/login">
            {copy.switchToLogin}
          </Link>
        </div>
      </div>
    </div>
  );
}
