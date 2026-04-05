import type { AuthError, Provider } from '@supabase/supabase-js';
import type { Locale } from '../i18n/messages';

const AUTH_CALLBACK_PATH = '/auth/callback';

export function isAppleAuthEnabled() {
  return import.meta.env.VITE_SUPABASE_APPLE_AUTH_ENABLED === 'true';
}

export function isGoogleAuthEnabled() {
  return import.meta.env.VITE_SUPABASE_GOOGLE_AUTH_ENABLED !== 'false';
}

export function getAuthCallbackPath() {
  return AUTH_CALLBACK_PATH;
}

export function getAuthRedirectUrl() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export function getAuthCopy(locale: Locale) {
  if (locale === 'ko') {
    return {
      loginEyebrow: '로그인',
      loginTitle: '앱 안에서 바로 루틴 배틀을 시작해 보세요',
      loginSubtitle: '이메일 로그인과 소셜 로그인을 모두 지원합니다. 로그인되면 바로 앱으로 들어갑니다.',
      loginPrimaryAction: '이메일로 로그인',
      loginLoadingAction: '로그인 중...',
      loginSocialLoading: '로그인 화면으로 이동 중...',
      signUpEyebrow: '회원가입',
      signUpTitle: '계정을 만들고 앱 안에서 바로 시작하세요',
      signUpSubtitle: '이메일로 가입하거나 Google로 빠르게 시작할 수 있습니다. Apple은 설정 후 활성화됩니다.',
      signUpPrimaryAction: '이메일로 회원가입',
      signUpLoadingAction: '가입 중...',
      signUpSocialLoading: '가입 화면으로 이동 중...',
      emailPlaceholder: '이메일',
      passwordPlaceholder: '비밀번호',
      passwordHint: '비밀번호는 6자 이상으로 입력해 주세요.',
      divider: '또는',
      continueWithGoogle: 'Google로 계속하기',
      continueWithApple: 'Apple로 계속하기',
      appleUnavailable: 'Apple 로그인은 아직 준비 중입니다. Supabase Dashboard에서 Apple Provider를 켜면 바로 사용할 수 있어요.',
      appleDisabledLabel: '설정 후 사용 가능',
      switchToSignUp: '아직 계정이 없나요? 회원가입',
      switchToLogin: '이미 계정이 있나요? 로그인',
      emailVerificationNotice: '가입을 완료했어요. 받은 편지함에서 인증 메일을 확인한 뒤 로그인해 주세요.',
      oauthReturnError: '소셜 로그인 처리를 완료하지 못했어요. 다시 시도해 주세요.',
      callbackLoading: '로그인 정보를 확인하고 있어요...',
      callbackAction: '로그인 화면으로 돌아가기',
      socialProviderGoogle: 'Google',
      socialProviderApple: 'Apple',
      logoutError: '로그아웃에 실패했어요. 잠시 후 다시 시도해 주세요.',
    };
  }

  return {
    loginEyebrow: 'Login',
    loginTitle: 'Sign in and jump straight back into the app',
    loginSubtitle: 'Use email or social login. After sign-in, we send you right back into the app.',
    loginPrimaryAction: 'Sign in with email',
    loginLoadingAction: 'Signing in...',
    loginSocialLoading: 'Opening sign-in...',
    signUpEyebrow: 'Sign up',
    signUpTitle: 'Create your account and start inside the app',
    signUpSubtitle: 'Use email or Google to get started. Apple stays disabled until it is configured.',
    signUpPrimaryAction: 'Create account with email',
    signUpLoadingAction: 'Creating account...',
    signUpSocialLoading: 'Opening sign-up...',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    passwordHint: 'Use at least 6 characters for your password.',
    divider: 'or',
    continueWithGoogle: 'Continue with Google',
    continueWithApple: 'Continue with Apple',
    appleUnavailable: 'Apple sign-in is not configured yet. Enable the Apple provider in Supabase Dashboard to use it.',
    appleDisabledLabel: 'Available after setup',
    switchToSignUp: 'No account yet? Sign up',
    switchToLogin: 'Already have an account? Sign in',
    emailVerificationNotice: 'Your account was created. Check your inbox, verify your email, then sign in.',
    oauthReturnError: 'We could not finish social sign-in. Please try again.',
    callbackLoading: 'Finishing your sign-in...',
    callbackAction: 'Back to login',
    socialProviderGoogle: 'Google',
    socialProviderApple: 'Apple',
    logoutError: 'Could not sign you out. Please try again in a moment.',
  };
}

export function getProviderUnavailableMessage(provider: Provider, locale: Locale) {
  const copy = getAuthCopy(locale);

  if (provider === 'apple') {
    return copy.appleUnavailable;
  }

  return locale === 'ko'
    ? `${provider} 로그인이 아직 준비되지 않았어요.`
    : `${provider} sign-in is not available yet.`;
}

export function getLocalizedAuthErrorMessage(error: Error | AuthError | null, locale: Locale) {
  if (!error) {
    return '';
  }

  const fallback =
    locale === 'ko'
      ? '로그인을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
      : 'We could not complete authentication. Please try again.';

  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return locale === 'ko'
      ? '이메일 또는 비밀번호가 올바르지 않아요.'
      : 'Your email or password is incorrect.';
  }

  if (message.includes('email not confirmed')) {
    return locale === 'ko'
      ? '이메일 인증이 아직 완료되지 않았어요. 메일함에서 인증을 먼저 진행해 주세요.'
      : 'Please confirm your email address before signing in.';
  }

  if (message.includes('user already registered')) {
    return locale === 'ko'
      ? '이미 가입된 이메일이에요. 바로 로그인해 주세요.'
      : 'That email is already registered. Try signing in instead.';
  }

  if (message.includes('password should be at least')) {
    return locale === 'ko'
      ? '비밀번호는 최소 6자 이상이어야 해요.'
      : 'Your password must be at least 6 characters.';
  }

  if (message.includes('unable to validate email address') || message.includes('invalid email')) {
    return locale === 'ko'
      ? '이메일 형식을 다시 확인해 주세요.'
      : 'Please check your email address format.';
  }

  if (message.includes('signup is disabled')) {
    return locale === 'ko'
      ? '현재 이메일 회원가입이 비활성화되어 있어요. Supabase 설정을 확인해 주세요.'
      : 'Email sign-up is currently disabled. Check your Supabase settings.';
  }

  if (message.includes('oauth') && message.includes('provider')) {
    return locale === 'ko'
      ? '선택한 소셜 로그인이 아직 활성화되지 않았어요. Supabase Provider 설정을 확인해 주세요.'
      : 'That social provider is not enabled yet. Check your Supabase provider settings.';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return locale === 'ko'
      ? '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
      : 'Check your network connection and try again.';
  }

  return locale === 'ko' ? fallback : error.message || fallback;
}
