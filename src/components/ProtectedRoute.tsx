import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { hasDisplayName, hasSeenOnboarding } from '../lib/appFlow';
import { ensureProfile } from '../lib/mvp';
import { useAuth } from './AuthProvider';

type AccessStatus = 'loading' | 'authorized' | 'needs_onboarding' | 'needs_profile' | 'unauthenticated';

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = useState<AccessStatus>('loading');
  const { loading, user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if (loading) {
      setStatus('loading');
      return;
    }

    let active = true;

    const checkAccess = async () => {
      setStatus('loading');

      if (!hasSeenOnboarding()) {
        setStatus('needs_onboarding');
        return;
      }

      if (!user) {
        setStatus('unauthenticated');
        return;
      }

      try {
        const profile = await ensureProfile(user);

        if (!active) {
          return;
        }

        setStatus(hasDisplayName(profile.nickname) ? 'authorized' : 'needs_profile');
      } catch (profileError) {
        console.warn('Protected route profile check failed:', profileError);

        if (active) {
          setStatus('authorized');
        }
      }
    };

    checkAccess();

    return () => {
      active = false;
    };
  }, [loading, user]);

  if (status === 'loading') {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{t('common.loading')}</div>
      </div>
    );
  }

  if (status === 'needs_onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'needs_profile') {
    return <Navigate to="/display-name" replace />;
  }

  return <>{children}</>;
}
