import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { resolveInitialPath } from '../lib/appFlow';

const SPLASH_DELAY_MS = 1200;

export default function Entry() {
  const navigate = useNavigate();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    let active = true;
    let timerId = 0;

    const start = async () => {
      const nextPath = await resolveInitialPath(user);
      await new Promise<void>((resolve) => {
        timerId = window.setTimeout(resolve, SPLASH_DELAY_MS);
      });

      if (!active) {
        return;
      }

      navigate(nextPath, { replace: true });
    };

    start();

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [loading, navigate, user]);

  return (
    <div className="mobile-shell">
      <div className="app-screen splash-screen">
        <div className="splash-card">
          <p className="splash-kicker">ROUTINE BATTLE</p>
          <h1>루틴을 같이 끝까지 가게 만드는 앱</h1>
          <p>매일의 체크와 친구 배틀을 한 화면에서 바로 시작해요.</p>
        </div>
      </div>
    </div>
  );
}
