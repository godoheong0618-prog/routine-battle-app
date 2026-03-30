import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureProfile } from '../lib/mvp';
import { supabase } from '../supabaseClient';

type OnboardingStep = {
  stepLabel: string;
  title: string;
  subtitle: string;
  hero: ReactNode;
  focusTitle: string;
  focusSubtitle: string;
  buttonText: string;
};

const steps: OnboardingStep[] = [
  {
    stepLabel: 'Step 1 / 3',
    title: '혼자 하는 루틴은 끝',
    subtitle: '친구랑 같이 해야 오래 간다',
    hero: (
      <div className="onboarding-fire">
        <span>🔥</span>
      </div>
    ),
    focusTitle: '혼자 하면 금방 포기',
    focusSubtitle: '같이 하면 경쟁이 생김',
    buttonText: '다음',
  },
  {
    stepLabel: 'Step 2 / 3',
    title: '같이 하면 경쟁된다',
    subtitle: '누가 더 했는지 바로 보인다',
    hero: (
      <div className="onboarding-vs">
        <div className="onboarding-vs-card onboarding-vs-card-active">나</div>
        <div className="onboarding-vs-card">친구</div>
      </div>
    ),
    focusTitle: '실시간으로 바로 비교',
    focusSubtitle: '누가 더 했는지 바로 보임',
    buttonText: '다음',
  },
  {
    stepLabel: 'Step 3 / 3',
    title: '지고 싶지 않게 만든다',
    subtitle: '벌칙 + 랭킹 + 압박',
    hero: (
      <div className="onboarding-penalty">
        <p>이번 주 벌칙</p>
        <strong>진 사람은 음료 사기 ☕</strong>
      </div>
    ),
    focusTitle: '게임처럼 계속 하게 됨',
    focusSubtitle: '랭킹이랑 벌칙으로 동기 부여',
    buttonText: '시작하기',
  },
];

export default function Onboarding() {
  const [stepIndex, setStepIndex] = useState(0);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate('/login');
      }
    };

    checkUser();
  }, [navigate]);

  const currentStep = useMemo(() => steps[stepIndex], [stepIndex]);

  const handleNext = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || '로그인이 필요합니다.');
      setLoading(false);
      navigate('/login');
      return;
    }

    try {
      await ensureProfile(user);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ nickname: nickname.trim() })
        .eq('id', user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      navigate('/home');
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : '프로필 저장에 실패했어요.');
      setLoading(false);
    }
  };

  return (
    <div className="mobile-shell">
      <div className="app-screen onboarding-screen">
        <form className="onboarding-card" onSubmit={handleNext}>
          <div className="onboarding-content">
            <p className="onboarding-step">{currentStep.stepLabel}</p>
            <h1 className="onboarding-title">{currentStep.title}</h1>
            <p className="onboarding-subtitle">{currentStep.subtitle}</p>

            <div className="onboarding-hero">{currentStep.hero}</div>

            <div className="onboarding-message">
              <h2>{currentStep.focusTitle}</h2>
              <p>{currentStep.focusSubtitle}</p>
            </div>

            {stepIndex === steps.length - 1 && (
              <div className="onboarding-nickname-wrap">
                <label className="onboarding-label" htmlFor="nickname">
                  닉네임
                </label>
                <input
                  id="nickname"
                  className="onboarding-nickname-input"
                  type="text"
                  placeholder="배틀에서 사용할 닉네임"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
            )}

            {error && <p className="error onboarding-error">{error}</p>}
          </div>

          <div className="onboarding-footer">
            <div className="progress-segments" aria-hidden="true">
              {steps.map((step, index) => (
                <span
                  key={step.stepLabel}
                  className={index === stepIndex ? 'progress-segment progress-segment-active' : 'progress-segment'}
                />
              ))}
            </div>
            <button className="primary-button onboarding-button" type="submit" disabled={loading}>
              {loading ? '저장 중...' : currentStep.buttonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
