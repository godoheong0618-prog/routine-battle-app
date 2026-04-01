import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasDisplayName } from '../lib/appFlow';
import { ensureProfile } from '../lib/mvp';
import { supabase } from '../supabaseClient';

export default function DisplayName() {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const checkProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        const profile = await ensureProfile(user);

        if (!active) {
          return;
        }

        if (hasDisplayName(profile.nickname)) {
          navigate('/home', { replace: true });
          return;
        }
      } catch (profileError) {
        if (!active) {
          return;
        }

        setError(profileError instanceof Error ? profileError.message : '표시 이름 준비 중 문제가 생겼어요.');
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    };

    checkProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setError('표시 이름을 입력해 주세요.');
      return;
    }

    setError('');
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || '로그인이 필요해요.');
      setLoading(false);
      navigate('/login', { replace: true });
      return;
    }

    try {
      await ensureProfile(user);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ nickname: trimmedName })
        .eq('id', user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      navigate('/home', { replace: true });
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : '표시 이름 저장에 실패했어요.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">준비 중...</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen display-name-screen">
        <div className="display-name-content">
          <div className="display-name-copy">
            <p className="section-eyebrow">마지막 설정</p>
            <h1 className="onboarding-title">친구에게 보일 이름을 입력해 주세요</h1>
            <p className="onboarding-subtitle">이 이름이 앱 안에서 내 표시 이름으로 사용돼요.</p>
          </div>

          <form className="form-card display-name-card" onSubmit={handleSubmit}>
            <div className="field-group">
              <span>표시 이름</span>
              <input
                autoFocus
                maxLength={20}
                placeholder="예: 민지, 팀루틴왕"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>

            {error && <p className="error onboarding-error">{error}</p>}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? '저장 중...' : '시작하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
