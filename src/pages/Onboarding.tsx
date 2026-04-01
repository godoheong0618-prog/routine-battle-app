import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasSeenOnboarding, markOnboardingSeen, resolvePostAuthPath } from '../lib/appFlow';

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
    title: '혼자 하는 루틴도 배틀처럼',
    subtitle: '친구와 함께하면 하루 루틴이 더 오래 이어져요.',
    hero: (
      <div className="onboarding-fire">
        <span>🔥</span>
      </div>
    ),
    focusTitle: '오늘 해야 할 일을 한눈에 확인',
    focusSubtitle: '작은 체크가 쌓일수록 루틴이 더 단단해져요.',
    buttonText: '다음',
  },
  {
    stepLabel: 'Step 2 / 3',
    title: '같이 하면 경쟁이 생겨요',
    subtitle: '내 진행률과 친구 진행률을 바로 비교할 수 있어요.',
    hero: (
      <div className="onboarding-vs">
        <div className="onboarding-vs-card onboarding-vs-card-active">나</div>
        <div className="onboarding-vs-card">친구</div>
      </div>
    ),
    focusTitle: '배틀처럼 보이는 일상 루틴',
    focusSubtitle: '누가 먼저 끝냈는지, 얼마나 앞서는지 바로 보여줘요.',
    buttonText: '다음',
  },
  {
    stepLabel: 'Step 3 / 3',
    title: '보상과 긴장감으로 끝까지',
    subtitle: '벌칙, 점수, 공동 목표로 루틴을 더 재미있게 만들어요.',
    hero: (
      <div className="onboarding-penalty">
        <p>이번 주 배틀</p>
        <strong>진 사람은 커피 사기</strong>
      </div>
    ),
    focusTitle: '루틴 앱이 아니라 같이 하는 게임처럼',
    focusSubtitle: '친구와 주고받는 긴장감이 꾸준함을 만들어줘요.',
    buttonText: '시작하기',
  },
];

export default function Onboarding() {
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const redirectIfCompleted = async () => {
      if (!hasSeenOnboarding()) {
        return;
      }

      const nextPath = await resolvePostAuthPath();

      if (!active) {
        return;
      }

      navigate(nextPath, { replace: true });
    };

    redirectIfCompleted();

    return () => {
      active = false;
    };
  }, [navigate]);

  const currentStep = useMemo(() => steps[stepIndex], [stepIndex]);

  const handleNext = async () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    setLoading(true);
    markOnboardingSeen();
    const nextPath = await resolvePostAuthPath();
    navigate(nextPath, { replace: true });
  };

  return (
    <div className="mobile-shell">
      <div className="app-screen onboarding-screen">
        <div className="onboarding-card">
          <div className="onboarding-content">
            <p className="onboarding-step">{currentStep.stepLabel}</p>
            <h1 className="onboarding-title">{currentStep.title}</h1>
            <p className="onboarding-subtitle">{currentStep.subtitle}</p>

            <div className="onboarding-hero">{currentStep.hero}</div>

            <div className="onboarding-message">
              <h2>{currentStep.focusTitle}</h2>
              <p>{currentStep.focusSubtitle}</p>
            </div>
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
            <button className="primary-button onboarding-button" type="button" disabled={loading} onClick={handleNext}>
              {loading ? '이동 중...' : currentStep.buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
