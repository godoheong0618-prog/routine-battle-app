import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomTabBar from '../components/BottomTabBar';
import { ProfileRow, SharedGoalCheckinRow, calculateStreak, ensureProfile } from '../lib/mvp';
import { supabase } from '../supabaseClient';

type CheckinSummary = {
  check_in_date: string;
};

export default function MyPage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [personalCheckins, setPersonalCheckins] = useState<CheckinSummary[]>([]);
  const [sharedCheckins, setSharedCheckins] = useState<SharedGoalCheckinRow[]>([]);
  const [routineCount, setRoutineCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
          supabase.from('checkins').select('check_in_date').eq('user_id', user.id),
          supabase.from('shared_goal_checkins').select('goal_id, user_id, check_date').eq('user_id', user.id),
        ]);

        if (routineResult.status === 'fulfilled' && !routineResult.value.error) {
          setRoutineCount(routineResult.value.count ?? 0);
        } else {
          console.warn('MyPage optional routine count load failed:', routineResult);
        }

        if (checkinsResult.status === 'fulfilled' && !checkinsResult.value.error) {
          setPersonalCheckins((checkinsResult.value.data as CheckinSummary[]) ?? []);
        } else {
          console.warn('MyPage optional personal checkins load failed:', checkinsResult);
        }

        if (sharedResult.status === 'fulfilled' && !sharedResult.value.error) {
          setSharedCheckins((sharedResult.value.data as SharedGoalCheckinRow[]) ?? []);
        } else {
          console.warn('MyPage optional shared checkins load failed:', sharedResult);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '내 정보를 불러오지 못했어요.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const totalCompletions = personalCheckins.length + sharedCheckins.length;
  const streak = useMemo(() => calculateStreak(personalCheckins), [personalCheckins]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen subpage-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">My</p>
          <h1>내 기록</h1>
          <p>닉네임, 총 완료 수, 스트릭을 가볍게 확인하고 로그아웃할 수 있어요.</p>
        </header>

        <main className="subpage-content">
          {error && <p className="error home-error">{error}</p>}

          <section className="stats-grid">
            <article className="stat-card">
              <span>닉네임</span>
              <strong>{profile?.nickname || '루틴러'}</strong>
            </article>
            <article className="stat-card">
              <span>총 완료 수</span>
              <strong>{totalCompletions}회</strong>
            </article>
            <article className="stat-card">
              <span>연속 성공일</span>
              <strong>{streak}일</strong>
            </article>
            <article className="stat-card">
              <span>내 루틴 개수</span>
              <strong>{routineCount}개</strong>
            </article>
          </section>

          <button className="secondary-button logout-button" type="button" onClick={handleLogout}>
            로그아웃
          </button>
        </main>

        <BottomTabBar />
      </div>
    </div>
  );
}
