import { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

export type ProfileRow = {
  id: string;
  nickname: string | null;
  friend_code: string | null;
  friend_id: string | null;
};

export type RoutineDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type ScheduleType = 'daily' | 'specific_days';

export type RoutineRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | null;
  target_count: number | null;
  schedule_type: ScheduleType | null;
  days_of_week: RoutineDayKey[] | null;
  reminder_time: string | null;
};

export type CheckinRow = {
  user_id: string;
  routine_id: string;
  check_date: string;
};

export type SharedGoalRow = {
  id: string;
  owner_id: string;
  friend_id: string;
  title: string;
  description: string | null;
  points: number | null;
};

export type SharedGoalCheckinRow = {
  goal_id: string;
  user_id: string;
  check_date: string;
};

export type NudgeRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
};

type FriendshipRow = {
  user_id: string;
  friend_id: string;
};

export const WEEKDAY_OPTIONS: Array<{ key: RoutineDayKey; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
];

export function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayKey() {
  return getDateKey(new Date());
}

export function getTodayDayKey(date = new Date()): RoutineDayKey {
  const day = date.getDay();
  const keys: RoutineDayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[day];
}

export function getWeekStartKey(date = new Date()) {
  const start = new Date(date);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  return getDateKey(start);
}

export function getWeekEndKey(date = new Date()) {
  const end = new Date(date);
  const dayOffset = (end.getDay() + 6) % 7;
  end.setDate(end.getDate() + (6 - dayOffset));
  return getDateKey(end);
}

export function calculateStreak(checkins: Array<{ check_date: string }>) {
  const uniqueDates = new Set(checkins.map((checkin) => checkin.check_date));
  const cursor = new Date();
  let streak = 0;

  while (uniqueDates.has(getDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function generateFriendCode(userId: string) {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function normalizeFriendCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isRoutineVisibleToday(routine: RoutineRow, today = getTodayDayKey()) {
  if (routine.schedule_type === 'specific_days' && Array.isArray(routine.days_of_week)) {
    return routine.days_of_week.includes(today);
  }

  if (routine.schedule_type === 'daily') {
    return true;
  }

  if (routine.frequency === 'daily') {
    return true;
  }

  if (routine.frequency === 'weekly' && Array.isArray(routine.days_of_week) && routine.days_of_week.length > 0) {
    return routine.days_of_week.includes(today);
  }

  return true;
}

export function formatDaysOfWeek(days: RoutineDayKey[] | null | undefined) {
  if (!days || days.length === 0) {
    return '요일 미설정';
  }

  return WEEKDAY_OPTIONS.filter((option) => days.includes(option.key))
    .map((option) => option.label)
    .join(' · ');
}

export function formatRoutineSchedule(routine: RoutineRow) {
  if (routine.schedule_type === 'specific_days') {
    return formatDaysOfWeek(routine.days_of_week);
  }

  return '매일';
}

async function resolveFriendshipFriendId(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .limit(10);

  if (error) {
    console.warn('Friendships lookup failed:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const friendships = data as FriendshipRow[];
  const candidates = Array.from(
    new Set(
      friendships.flatMap((friendship) => {
        if (friendship.user_id === userId && friendship.friend_id !== userId) {
          return [friendship.friend_id];
        }

        if (friendship.friend_id === userId && friendship.user_id !== userId) {
          return [friendship.user_id];
        }

        return [];
      })
    )
  );

  if (candidates.length > 1) {
    console.warn('Multiple friendship rows found for user:', { userId, candidates });
  }

  return candidates[0] ?? null;
}

export async function resolveConnectedFriendId(userId: string, fallbackFriendId: string | null = null) {
  const friendshipFriendId = await resolveFriendshipFriendId(userId);
  return friendshipFriendId ?? fallbackFriendId;
}

async function withResolvedFriend(profile: ProfileRow) {
  const resolvedFriendId = await resolveConnectedFriendId(profile.id, profile.friend_id);

  if (resolvedFriendId === profile.friend_id) {
    return profile;
  }

  return {
    ...profile,
    friend_id: resolvedFriendId,
  };
}

export async function ensureProfile(user: Pick<User, 'id' | 'email'>) {
  const { data: existing, error } = await supabase
    .from('profiles')
    .select('id, nickname, friend_code, friend_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existing) {
    if (existing.friend_code) {
      return withResolvedFriend(existing as ProfileRow);
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ friend_code: generateFriendCode(user.id) })
      .eq('id', user.id)
      .select('id, nickname, friend_code, friend_id')
      .single();

    if (updateError) {
      throw updateError;
    }

    return withResolvedFriend(updated as ProfileRow);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      nickname: null,
      friend_code: generateFriendCode(user.id),
      friend_id: null,
    })
    .select('id, nickname, friend_code, friend_id')
    .single();

  if (insertError) {
    throw insertError;
  }

  return withResolvedFriend(inserted as ProfileRow);
}

export async function fetchProfile(profileId: string | null) {
  if (!profileId) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, friend_code, friend_id')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProfileRow | null) ?? null;
}

export async function connectFriendByCode(currentProfile: ProfileRow, inviteCode: string) {
  const normalizedCode = normalizeFriendCode(inviteCode);

  if (!normalizedCode) {
    throw new Error('친구 코드를 입력해 주세요.');
  }

  if (currentProfile.friend_code === normalizedCode) {
    throw new Error('내 코드는 입력할 수 없어요.');
  }

  const currentFriendId = await resolveConnectedFriendId(currentProfile.id, currentProfile.friend_id);

  if (currentFriendId) {
    throw new Error('이미 연결된 친구가 있어요.');
  }

  const { data: targetData, error: targetError } = await supabase
    .from('profiles')
    .select('id, nickname, friend_code, friend_id')
    .eq('friend_code', normalizedCode)
    .limit(1)
    .maybeSingle();

  if (targetError) {
    throw targetError;
  }

  if (!targetData) {
    throw new Error('해당 코드를 가진 친구를 찾을 수 없어요.');
  }

  const targetProfile = targetData as ProfileRow;

  if (targetProfile.id === currentProfile.id) {
    throw new Error('내 코드는 입력할 수 없어요.');
  }

  const targetFriendId = await resolveConnectedFriendId(targetProfile.id, targetProfile.friend_id);

  if (targetFriendId) {
    throw new Error('상대방은 이미 다른 친구와 연결되어 있어요.');
  }

  const { error: friendshipInsertError } = await supabase.from('friendships').insert({
    user_id: currentProfile.id,
    friend_id: targetProfile.id,
  });

  if (friendshipInsertError) {
    if (friendshipInsertError.code === '23505') {
      throw new Error('이미 연결된 친구가 있어요.');
    }

    throw friendshipInsertError;
  }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ friend_id: targetProfile.id })
    .eq('id', currentProfile.id);

  if (profileUpdateError) {
    console.warn('Profile friend sync failed:', profileUpdateError);
  }

  const { error: reverseProfileUpdateError } = await supabase
    .from('profiles')
    .update({ friend_id: currentProfile.id })
    .eq('id', targetProfile.id);

  if (reverseProfileUpdateError) {
    console.warn('Reverse profile friend sync failed:', reverseProfileUpdateError);
  }

  return {
    profile: {
      ...currentProfile,
      friend_id: targetProfile.id,
    },
    friendProfile: {
      ...targetProfile,
      friend_id: currentProfile.id,
    },
  };
}

type BattleScoreInput = {
  currentUserId: string;
  friendId: string | null;
  checkins: CheckinRow[];
  sharedGoalCheckins: SharedGoalCheckinRow[];
  sharedGoals: SharedGoalRow[];
};

export function calculateBattleScores({
  currentUserId,
  friendId,
  checkins,
  sharedGoalCheckins,
  sharedGoals,
}: BattleScoreInput) {
  const weekStart = getWeekStartKey();
  const weekEnd = getWeekEndKey();
  const pointsByGoal = new Map(sharedGoals.map((goal) => [goal.id, goal.points ?? 3]));

  const weekPersonal = checkins.filter(
    (checkin) => checkin.check_date >= weekStart && checkin.check_date <= weekEnd
  );
  const weekShared = sharedGoalCheckins.filter(
    (checkin) => checkin.check_date >= weekStart && checkin.check_date <= weekEnd
  );

  const myPersonalScore = weekPersonal.filter((checkin) => checkin.user_id === currentUserId).length * 2;
  const friendPersonalScore = friendId
    ? weekPersonal.filter((checkin) => checkin.user_id === friendId).length * 2
    : 0;

  const mySharedScore = weekShared
    .filter((checkin) => checkin.user_id === currentUserId)
    .reduce((sum, checkin) => sum + (pointsByGoal.get(checkin.goal_id) ?? 3), 0);

  const friendSharedScore = friendId
    ? weekShared
        .filter((checkin) => checkin.user_id === friendId)
        .reduce((sum, checkin) => sum + (pointsByGoal.get(checkin.goal_id) ?? 3), 0)
    : 0;

  let myBonus = 0;
  let friendBonus = 0;
  const sharedCompletionMap = new Map<string, Set<string>>();

  weekShared.forEach((checkin) => {
    const key = `${checkin.goal_id}-${checkin.check_date}`;
    const users = sharedCompletionMap.get(key) ?? new Set<string>();
    users.add(checkin.user_id);
    sharedCompletionMap.set(key, users);
  });

  if (friendId) {
    sharedCompletionMap.forEach((users) => {
      if (users.has(currentUserId) && users.has(friendId)) {
        myBonus += 1;
        friendBonus += 1;
      }
    });
  }

  const myScore = myPersonalScore + mySharedScore + myBonus;
  const friendScore = friendPersonalScore + friendSharedScore + friendBonus;
  const difference = myScore - friendScore;

  return {
    myScore,
    friendScore,
    difference,
    status: difference > 0 ? '내가 앞서고 있어요' : difference < 0 ? '친구가 앞서고 있어요' : '지금은 동점이에요',
  };
}
