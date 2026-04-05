import type { User } from '@supabase/supabase-js';
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

async function resolveUser(candidate?: User | null) {
  if (candidate !== undefined) {
    return candidate;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

export async function resolvePostAuthPath(candidate?: User | null) {
  const user = await resolveUser(candidate);

  if (!user) {
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

export async function resolveInitialPath(candidate?: User | null) {
  if (!hasSeenOnboarding()) {
    return '/onboarding';
  }

  return resolvePostAuthPath(candidate);
}
