import { ensureProfile } from './mvp';
import { supabase } from '../supabaseClient';

export const SEEN_ONBOARDING_KEY = 'seen_onboarding';

export function hasSeenOnboarding() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SEEN_ONBOARDING_KEY) === 'true';
}

export function markOnboardingSeen() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SEEN_ONBOARDING_KEY, 'true');
}

export function hasDisplayName(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export async function resolvePostAuthPath() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return '/login';
  }

  try {
    const profile = await ensureProfile(user);
    return hasDisplayName(profile.nickname) ? '/home' : '/display-name';
  } catch (profileError) {
    console.warn('Failed to resolve post-auth path:', profileError);
    return '/home';
  }
}

export async function resolveInitialPath() {
  if (!hasSeenOnboarding()) {
    return '/onboarding';
  }

  return resolvePostAuthPath();
}
