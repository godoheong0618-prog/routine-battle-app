import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { hasDisplayName, hasSeenOnboarding } from '../lib/appFlow';
import { ensureProfile } from '../lib/mvp';
import { supabase } from '../supabaseClient';

type AccessStatus = 'loading' | 'authorized' | 'needs_onboarding' | 'needs_profile' | 'unauthenticated';

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = useState<AccessStatus>('loading');

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      if (!hasSeenOnboarding()) {
        setStatus('needs_onboarding');
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
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
  }, []);

  if (status === 'loading') {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">불러오는 중...</div>
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
