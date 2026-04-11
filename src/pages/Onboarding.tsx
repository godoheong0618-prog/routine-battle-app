import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { hasSeenOnboarding, markOnboardingSeen, resolvePostAuthPath } from '../lib/appFlow';

type OnboardingStep = {
  icon: ReactNode;
  title: {
    ko: string;
    en: string;
  };
  description: {
    ko: string;
    en: string;
  };
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="onboarding-stage-glyph">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.75 12.25 2.1 2.1 4.5-4.8" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="onboarding-stage-glyph">
      <path d="M9 12.5c1.66 0 3-1.57 3-3.5s-1.34-3.5-3-3.5S6 7.07 6 9s1.34 3.5 3 3.5Z" />
      <path d="M15.5 11c1.38 0 2.5-1.34 2.5-3s-1.12-3-2.5-3S13 6.34 13 8s1.12 3 2.5 3Z" />
      <path d="M4.5 18.5c.68-2.13 2.52-3.5 4.5-3.5s3.82 1.37 4.5 3.5" />
      <path d="M13.75 17.25c.45-1.37 1.62-2.25 3-2.25 1.25 0 2.3.72 2.75 1.85" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="onboarding-stage-glyph">
      <circle cx="12" cy="12" r="7.25" />
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.5v2.25" />
      <path d="M21.5 12h-2.25" />
      <path d="M12 21.5v-2.25" />
      <path d="M2.5 12h2.25" />
    </svg>
  );
}

const steps: OnboardingStep[] = [
  {
    icon: <CheckIcon />,
    title: {
      ko: '매일 루틴을 기록하세요',
      en: 'Track your routines every day',
    },
    description: {
      ko: '하루의 습관을 체크하고 꾸준히 쌓이는 흐름을 한눈에 확인해보세요.',
      en: 'Check your daily habits and keep your progress easy to read at a glance.',
    },
  },
  {
    icon: <UsersIcon />,
    title: {
      ko: '친구와 함께 배틀하세요',
      en: 'Battle with a friend',
    },
    description: {
      ko: '서로의 진행 상황을 비교하면서 과하지 않은 경쟁으로 동기부여를 받을 수 있어요.',
      en: 'Compare progress with your friend and stay motivated through calm, healthy competition.',
    },
  },
  {
    icon: <TargetIcon />,
    title: {
      ko: '공동 목표로 더 꾸준하게',
      en: 'Stay consistent with shared goals',
    },
    description: {
      ko: '같은 목표를 함께 체크하고 작은 내기나 규칙으로 루틴을 더 오래 이어가보세요.',
      en: 'Check shared goals together and keep routines going with small rules or wagers.',
    },
  },
];

export default function Onboarding() {
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { locale } = useLanguage();
  const isKo = locale === 'ko';

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

  const handleComplete = async () => {
    setLoading(true);
    markOnboardingSeen();
    const nextPath = await resolvePostAuthPath();
    navigate(nextPath, { replace: true });
  };

  const handleNext = async () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    await handleComplete();
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      return;
    }

    setStepIndex((current) => current - 1);
  };

  return (
    <div className="mobile-shell">
      <div className="app-screen onboarding-screen onboarding-screen-modern">
        <div className="onboarding-flow-card">
          <div className="onboarding-progress" aria-label={isKo ? '온보딩 진행 상태' : 'Onboarding progress'}>
            {steps.map((_, index) => (
              <span
                key={`onboarding-step-${index + 1}`}
                className={index <= stepIndex ? 'onboarding-progress-segment onboarding-progress-segment-active' : 'onboarding-progress-segment'}
              />
            ))}
          </div>

          <div className="onboarding-stage">
            <div className="onboarding-stage-icon">{currentStep.icon}</div>

            <div className="onboarding-stage-copy">
              <h1 className="onboarding-stage-title">{isKo ? currentStep.title.ko : currentStep.title.en}</h1>
              <p className="onboarding-stage-description">
                {isKo ? currentStep.description.ko : currentStep.description.en}
              </p>
            </div>
          </div>

          <div className="onboarding-nav">
            <div className="onboarding-nav-row">
              {stepIndex > 0 && (
                <button
                  className="secondary-button onboarding-back-button"
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                >
                  {isKo ? '이전' : 'Back'}
                </button>
              )}

              <button
                className="primary-button onboarding-next-button"
                type="button"
                onClick={handleNext}
                disabled={loading}
              >
                {loading ? (isKo ? '이동 중...' : 'Loading...') : stepIndex === steps.length - 1 ? (isKo ? '시작하기' : 'Get started') : isKo ? '다음' : 'Next'}
              </button>
            </div>

            {stepIndex === 0 && (
              <button
                className="onboarding-skip-button"
                type="button"
                onClick={handleComplete}
                disabled={loading}
              >
                {isKo ? '건너뛰기' : 'Skip'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
