import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setStatus(user ? 'authenticated' : 'unauthenticated');
    };

    checkUser();

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

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
