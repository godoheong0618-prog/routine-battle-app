import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveInitialPath } from '../lib/appFlow';

const SPLASH_DELAY_MS = 1200;

export default function Entry() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const start = async () => {
      const nextPathPromise = resolveInitialPath();
      await new Promise((resolve) => window.setTimeout(resolve, SPLASH_DELAY_MS));
      const nextPath = await nextPathPromise;

      if (!active) {
        return;
      }

      navigate(nextPath, { replace: true });
    };

    start();

    return () => {
      active = false;
    };
  }, [navigate]);

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
