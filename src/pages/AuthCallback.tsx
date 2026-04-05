import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../i18n/LanguageContext';
import { resolvePostAuthPath } from '../lib/appFlow';
import { getAuthCopy, getLocalizedAuthErrorMessage } from '../lib/auth';

export default function AuthCallback() {
  const [error, setError] = useState('');
  const { loading, user } = useAuth();
  const { locale } = useLanguage();
  const navigate = useNavigate();

  const copy = useMemo(() => getAuthCopy(locale), [locale]);

  useEffect(() => {
    let active = true;

    const finishAuth = async () => {
      if (loading) {
        return;
      }

      if (user) {
        const nextPath = await resolvePostAuthPath(user);

        if (active) {
          navigate(nextPath, { replace: true });
        }

        return;
      }

      const params = new URLSearchParams(window.location.search);
      const returnedError = params.get('error_description') ?? params.get('error');

      if (!active) {
        return;
      }

      setError(
        returnedError
          ? getLocalizedAuthErrorMessage(new Error(returnedError), locale)
          : copy.oauthReturnError
      );
    };

    finishAuth();

    return () => {
      active = false;
    };
  }, [copy.oauthReturnError, loading, locale, navigate, user]);

  return (
    <div className="mobile-shell">
      <div className="app-screen auth-screen">
        <div className="container auth-container auth-container-compact">
          {error ? (
            <>
              <div className="auth-copy">
                <p className="section-eyebrow">{copy.loginEyebrow}</p>
                <h1>{copy.oauthReturnError}</h1>
                <p>{error}</p>
              </div>
              <Link className="inline-action-link" to="/login">
                {copy.callbackAction}
              </Link>
            </>
          ) : (
            <div className="loading-screen auth-callback-loading">{copy.callbackLoading}</div>
          )}
        </div>
      </div>
    </div>
  );
}
