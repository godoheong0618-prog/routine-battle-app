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
export type RoutineStatus = 'pending' | 'done' | 'partial' | 'rest';
export type RoutineDayStatus = RoutineStatus | 'missed' | 'off';

export type RoutineRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | null;
  target_count: number | null;
  schedule_type: ScheduleType | null;
  days_of_week: RoutineDayKey[] | null;
  repeat_days?: RoutineDayKey[] | null;
  reminder_time: string | null;
  is_template?: boolean | null;
};

export type RoutineLogRow = {
  id?: string;
  user_id: string;
  routine_id: string;
  log_date: string;
  status: RoutineStatus;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CheckinRow = RoutineLogRow;

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

export type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string;
  battle_title: string | null;
  wager_text: string | null;
  battle_status: string | null;
  battle_started_at: string | null;
};

export type BattleLeader = 'me' | 'friend' | 'tied' | 'waiting';

const FRIENDSHIP_BASE_SELECT = 'id,user_id,friend_id,created_at';
const FRIENDSHIP_CORE_SELECT =
  'id,user_id,friend_id,created_at,battle_title,wager_text,battle_status,battle_started_at';

type DatedCheckin = {
  log_date?: string | null;
  check_in_date?: string | null;
  check_date?: string | null;
  status?: RoutineStatus | string | null;
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

export const WEEKDAY_KEYS: RoutineDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const EVERYDAY_KEYS: RoutineDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const ROUTINE_STATUS_LABELS: Record<RoutineStatus, { ko: string; en: string }> = {
  pending: { ko: '대기', en: 'Pending' },
  done: { ko: '완료', en: 'Done' },
  partial: { ko: '조금 함', en: 'Partial' },
  rest: { ko: '오늘 쉼', en: 'Rest' },
};

export const ROUTINE_STATUS_WEIGHT: Record<RoutineStatus, number> = {
  pending: 0,
  done: 1,
  partial: 0.5,
  rest: 0,
};

export type RoutineTemplate = {
  id: string;
  title: string;
  description: string;
  repeat_days: RoutineDayKey[];
  reminder_time: string | null;
  target_count: number;
};

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'study-30',
    title: '공부 30분',
    description: '타이머를 켜고 30분만 집중하기',
    repeat_days: WEEKDAY_KEYS,
    reminder_time: '20:00',
    target_count: 1,
  },
  {
    id: 'water-1l',
    title: '물 1L 마시기',
    description: '하루 동안 물 1L를 나누어 마시기',
    repeat_days: EVERYDAY_KEYS,
    reminder_time: '13:00',
    target_count: 1,
  },
  {
    id: 'sleep-before-11',
    title: '11시 전 취침',
    description: '밤 11시 전에 눕기',
    repeat_days: EVERYDAY_KEYS,
    reminder_time: '22:30',
    target_count: 1,
  },
  {
    id: 'workout-10',
    title: '운동 10분',
    description: '스트레칭이나 맨몸 운동 10분',
    repeat_days: ['mon', 'wed', 'fri'],
    reminder_time: '18:30',
    target_count: 1,
  },
  {
    id: 'english-20',
    title: '영어 단어 20개',
    description: '새 단어 20개 외우고 소리 내어 읽기',
    repeat_days: WEEKDAY_KEYS,
    reminder_time: '21:00',
    target_count: 1,
  },
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

export function getCheckinDateValue(checkin: DatedCheckin) {
  return checkin.log_date ?? checkin.check_in_date ?? checkin.check_date ?? '';
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

export function getTodayDayKey(date = new Date()): RoutineDayKey {
  const day = date.getDay();
  const keys: RoutineDayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[day];
}

export function getDayKeyForDateKey(dateKey: string) {
  return getTodayDayKey(parseDateKey(dateKey));
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

export function getLastDateKeys(count: number, endDate = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const cursor = new Date(endDate);
    cursor.setDate(cursor.getDate() - (count - 1 - index));
    return getDateKey(cursor);
  });
}

export function getWeekDateKeys(date = new Date()) {
  const start = new Date(date);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);

  return Array.from({ length: dayOffset + 1 }, (_, index) => {
    const cursor = new Date(start);
    cursor.setDate(start.getDate() + index);
    return getDateKey(cursor);
  });
}

export function normalizeRoutineStatus(status: string | null | undefined): RoutineStatus {
  if (status === 'done' || status === 'partial' || status === 'rest' || status === 'pending') {
    return status;
  }

  return 'done';
}

export function isPositiveRoutineStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeRoutineStatus(status);
  return normalizedStatus === 'done' || normalizedStatus === 'partial';
}

export function calculateStreak(checkins: DatedCheckin[]) {
  const uniqueDates = new Set(
    checkins
      .filter((checkin) => isPositiveRoutineStatus(checkin.status ?? 'done'))
      .map((checkin) => getCheckinDateValue(checkin))
      .filter(Boolean)
  );
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
  if (routine.is_template) {
    return false;
  }

  const repeatDays = getRoutineRepeatDays(routine);

  if (routine.schedule_type === 'specific_days' && repeatDays.length > 0) {
    return repeatDays.includes(today);
  }

  if (routine.schedule_type === 'daily') {
    return true;
  }

  if (routine.frequency === 'daily') {
    return true;
  }

  if (routine.frequency === 'weekly' && repeatDays.length > 0) {
    return repeatDays.includes(today);
  }

  return true;
}

export function isRoutineVisibleOnDate(routine: RoutineRow, dateKey: string) {
  return isRoutineVisibleToday(routine, getDayKeyForDateKey(dateKey));
}

export function getRoutineRepeatDays(routine: Pick<RoutineRow, 'days_of_week' | 'repeat_days'>) {
  const repeatDays = routine.repeat_days ?? routine.days_of_week;
  return Array.isArray(repeatDays) ? repeatDays : [];
}

export function formatDaysOfWeek(days: RoutineDayKey[] | null | undefined) {
  if (!days || days.length === 0) {
    return '요일 미선택';
  }

  return WEEKDAY_OPTIONS.filter((option) => days.includes(option.key))
    .map((option) => option.label)
    .join(' · ');
}

export function formatRoutineSchedule(routine: RoutineRow) {
  if (routine.schedule_type === 'specific_days') {
    return formatDaysOfWeek(getRoutineRepeatDays(routine));
  }

  return '매일';
}

export type RoutineDailyStat = {
  dateKey: string;
  dayKey: RoutineDayKey;
  total: number;
  score: number;
  percent: number;
  status: RoutineDayStatus;
};

export type RoutineStats = {
  daily: RoutineDailyStat[];
  totalSlots: number;
  score: number;
  percent: number;
  doneCount: number;
  partialCount: number;
  restCount: number;
  pendingCount: number;
  missedCount: number;
};

export function calculateRoutineStats(
  routines: RoutineRow[],
  routineLogs: RoutineLogRow[],
  userId: string,
  dateKeys = getWeekDateKeys()
): RoutineStats {
  const userRoutines = routines.filter((routine) => routine.user_id === userId && !routine.is_template);
  const userLogs = routineLogs.filter((log) => log.user_id === userId);
  const logMap = new Map(userLogs.map((log) => [`${log.routine_id}-${log.log_date}`, log]));

  let totalSlots = 0;
  let score = 0;
  let doneCount = 0;
  let partialCount = 0;
  let restCount = 0;
  let pendingCount = 0;
  let missedCount = 0;

  const daily = dateKeys.map((dateKey) => {
    const scheduledRoutines = userRoutines.filter((routine) => isRoutineVisibleOnDate(routine, dateKey));
    let dayScore = 0;
    let dayDone = 0;
    let dayPartial = 0;
    let dayRest = 0;
    let dayPending = 0;
    let dayMissed = 0;

    scheduledRoutines.forEach((routine) => {
      const log = logMap.get(`${routine.id}-${dateKey}`);

      if (!log) {
        dayMissed += 1;
        missedCount += 1;
        return;
      }

      const status = normalizeRoutineStatus(log.status);
      const statusScore = ROUTINE_STATUS_WEIGHT[status];
      dayScore += statusScore;
      score += statusScore;

      if (status === 'done') {
        dayDone += 1;
        doneCount += 1;
      } else if (status === 'partial') {
        dayPartial += 1;
        partialCount += 1;
      } else if (status === 'rest') {
        dayRest += 1;
        restCount += 1;
      } else {
        dayPending += 1;
        pendingCount += 1;
      }
    });

    totalSlots += scheduledRoutines.length;

    let status: RoutineDayStatus = 'off';

    if (scheduledRoutines.length > 0) {
      if (dayMissed > 0 || dayPending > 0) {
        status = 'missed';
      } else if (dayDone === scheduledRoutines.length) {
        status = 'done';
      } else if (dayPartial > 0) {
        status = 'partial';
      } else if (dayRest > 0) {
        status = 'rest';
      } else {
        status = 'missed';
      }
    }

    return {
      dateKey,
      dayKey: getDayKeyForDateKey(dateKey),
      total: scheduledRoutines.length,
      score: dayScore,
      percent: scheduledRoutines.length === 0 ? 0 : Math.round((dayScore / scheduledRoutines.length) * 100),
      status,
    };
  });

  return {
    daily,
    totalSlots,
    score,
    percent: totalSlots === 0 ? 0 : Math.round((score / totalSlots) * 100),
    doneCount,
    partialCount,
    restCount,
    pendingCount,
    missedCount,
  };
}

function normalizeRoutineLogRow(row: Partial<RoutineLogRow> & { check_in_date?: string | null }) {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    routine_id: row.routine_id ?? '',
    log_date: row.log_date ?? row.check_in_date ?? '',
    status: normalizeRoutineStatus(row.status),
    note: row.note ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchRoutineLogsForUsers(userIds: string[]) {
  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('routine_logs')
    .select('id, user_id, routine_id, log_date, status, note, created_at, updated_at')
    .in('user_id', userIds);

  if (!error) {
    return ((data as RoutineLogRow[] | null) ?? []).map(normalizeRoutineLogRow).filter((log) => log.log_date);
  }

  if (error.code !== '42P01' && error.code !== '42703') {
    throw error;
  }

  const fallback = await supabase
    .from('checkins')
    .select('user_id, routine_id, check_in_date')
    .in('user_id', userIds);

  if (fallback.error) {
    throw fallback.error;
  }

  return ((fallback.data as Array<{ user_id: string; routine_id: string; check_in_date: string }> | null) ?? []).map(
    (row) => ({
      user_id: row.user_id,
      routine_id: row.routine_id,
      log_date: row.check_in_date,
      status: 'done' as RoutineStatus,
      note: null,
    })
  );
}

function buildFriendshipPairFilter(firstUserId: string, secondUserId: string) {
  return `and(user_id.eq.${firstUserId},friend_id.eq.${secondUserId}),and(user_id.eq.${secondUserId},friend_id.eq.${firstUserId})`;
}

function toFriendshipRow(data: Partial<FriendshipRow> | null | undefined): FriendshipRow | null {
  if (!data?.id || !data.user_id || !data.friend_id || !data.created_at) {
    return null;
  }

  return {
    id: data.id,
    user_id: data.user_id,
    friend_id: data.friend_id,
    created_at: data.created_at,
    battle_title: data.battle_title ?? null,
    wager_text: data.wager_text ?? null,
    battle_status: data.battle_status ?? null,
    battle_started_at: data.battle_started_at ?? null,
  };
}

export function isFriendshipBattleMetaMissing(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42703' && error.message?.includes('friendships.') === true;
}

async function resolveFriendshipFriendId(userId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_BASE_SELECT)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .limit(10);

  if (error) {
    console.warn('Friendships lookup failed:', error);
    return undefined;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const friendships = ((data as Partial<FriendshipRow>[] | null) ?? [])
    .map((row) => toFriendshipRow(row))
    .filter((row): row is FriendshipRow => Boolean(row));
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

  if (friendshipFriendId === undefined) {
    return fallbackFriendId;
  }

  return friendshipFriendId;
}

async function withResolvedFriend(profile: ProfileRow) {
  const resolvedFriendId = await resolveConnectedFriendId(profile.id, profile.friend_id);

  if (resolvedFriendId === profile.friend_id) {
    return profile;
  }

  const { error } = await supabase.from('profiles').update({ friend_id: resolvedFriendId }).eq('id', profile.id);

  if (error) {
    console.warn('Profile friend sync failed:', error);
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

export async function fetchFriendshipByUsers(firstUserId: string, secondUserId: string | null) {
  if (!secondUserId) {
    return null;
  }

  const primaryResult = await supabase
    .from('friendships')
    .select(FRIENDSHIP_CORE_SELECT)
    .or(buildFriendshipPairFilter(firstUserId, secondUserId))
    .maybeSingle();
  let data = primaryResult.data as Partial<FriendshipRow> | null;
  let error = primaryResult.error;

  if (isFriendshipBattleMetaMissing(error)) {
    const fallback = await supabase
      .from('friendships')
      .select(FRIENDSHIP_BASE_SELECT)
      .or(buildFriendshipPairFilter(firstUserId, secondUserId))
      .maybeSingle();
    data = fallback.data as Partial<FriendshipRow> | null;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return toFriendshipRow((data as Partial<FriendshipRow> | null) ?? null);
}

export async function fetchFriendConnection(profile: ProfileRow) {
  const nextProfile = await withResolvedFriend(profile);
  const friendProfile = await fetchProfile(nextProfile.friend_id);
  const friendship = await fetchFriendshipByUsers(nextProfile.id, friendProfile?.id ?? null);

  return {
    profile: nextProfile,
    friendProfile,
    friendship,
  };
}

export async function connectFriendByCode(currentProfile: ProfileRow, inviteCode: string) {
  const normalizedCode = normalizeFriendCode(inviteCode);

  if (!normalizedCode) {
    throw new Error('친구 코드를 입력해 주세요.');
  }

  if (currentProfile.friend_code === normalizedCode) {
    throw new Error('내 코드는 사용할 수 없어요.');
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
    throw new Error('내 코드는 사용할 수 없어요.');
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

export async function disconnectFriendConnection(currentProfile: ProfileRow, friendshipId: string | null = null) {
  const resolvedProfile = await withResolvedFriend(currentProfile);
  const connectedFriendId = resolvedProfile.friend_id;
  const friendship =
    friendshipId != null
      ? { id: friendshipId }
      : await fetchFriendshipByUsers(resolvedProfile.id, connectedFriendId);

  if (friendship?.id) {
    const { error: deleteError } = await supabase.from('friendships').delete().eq('id', friendship.id);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({ friend_id: null })
    .eq('id', resolvedProfile.id);

  if (profileUpdateError) {
    console.warn('Profile disconnect sync failed:', profileUpdateError);
  }

  return {
    profile: {
      ...resolvedProfile,
      friend_id: null,
    },
    disconnectedFriendId: connectedFriendId,
  };
}

function isSharedGoalPairMatch(goal: SharedGoalRow, currentUserId: string, friendId: string) {
  return (
    (goal.owner_id === currentUserId && goal.friend_id === friendId) ||
    (goal.owner_id === friendId && goal.friend_id === currentUserId)
  );
}

export function filterSharedGoalsForPair(sharedGoals: SharedGoalRow[], currentUserId: string, friendId: string | null) {
  if (!friendId) {
    return [];
  }

  return sharedGoals.filter((goal) => isSharedGoalPairMatch(goal, currentUserId, friendId));
}

type BattleScoreInput = {
  currentUserId: string;
  friendId: string | null;
  checkins: CheckinRow[];
  sharedGoalCheckins: SharedGoalCheckinRow[];
  sharedGoals: SharedGoalRow[];
  routines?: RoutineRow[];
};

export function calculateBattleScores({
  currentUserId,
  friendId,
  checkins,
  sharedGoalCheckins,
  sharedGoals,
  routines = [],
}: BattleScoreInput) {
  const weekKeys = getWeekDateKeys();
  const weekStart = weekKeys[0] ?? getWeekStartKey();
  const weekEnd = weekKeys[weekKeys.length - 1] ?? getWeekEndKey();
  const pointsByGoal = new Map(sharedGoals.map((goal) => [goal.id, goal.points ?? 3]));

  const weekPersonal = checkins.filter((checkin) => {
    const checkinDate = getCheckinDateValue(checkin);
    return checkinDate >= weekStart && checkinDate <= weekEnd;
  });

  const weekShared = sharedGoalCheckins.filter(
    (checkin) => checkin.check_date >= weekStart && checkin.check_date <= weekEnd
  );

  const myPersonalActions = weekPersonal.filter(
    (checkin) => checkin.user_id === currentUserId && isPositiveRoutineStatus(checkin.status)
  ).length;
  const friendPersonalActions = friendId
    ? weekPersonal.filter((checkin) => checkin.user_id === friendId && isPositiveRoutineStatus(checkin.status)).length
    : 0;

  const mySharedCompletions = weekShared.filter((checkin) => checkin.user_id === currentUserId).length;
  const friendSharedCompletions = friendId
    ? weekShared.filter((checkin) => checkin.user_id === friendId).length
    : 0;

  const myPersonalScore = weekPersonal
    .filter((checkin) => checkin.user_id === currentUserId)
    .reduce((sum, checkin) => sum + ROUTINE_STATUS_WEIGHT[normalizeRoutineStatus(checkin.status)] * 2, 0);
  const friendPersonalScore = friendId
    ? weekPersonal
        .filter((checkin) => checkin.user_id === friendId)
        .reduce((sum, checkin) => sum + ROUTINE_STATUS_WEIGHT[normalizeRoutineStatus(checkin.status)] * 2, 0)
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
  let sharedBonusCount = 0;
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
        sharedBonusCount += 1;
        myBonus += 1;
        friendBonus += 1;
      }
    });
  }

  const myScore = myPersonalScore + mySharedScore + myBonus;
  const friendScore = friendPersonalScore + friendSharedScore + friendBonus;
  const difference = myScore - friendScore;
  const leader: BattleLeader = !friendId ? 'waiting' : difference > 0 ? 'me' : difference < 0 ? 'friend' : 'tied';
  const myWeeklyStats = calculateRoutineStats(routines, checkins, currentUserId, weekKeys);
  const friendWeeklyStats = friendId
    ? calculateRoutineStats(routines, checkins, friendId, weekKeys)
    : calculateRoutineStats([], [], '', weekKeys);
  const weeklyPercentDifference = myWeeklyStats.percent - friendWeeklyStats.percent;
  const weeklyPercentLeader: BattleLeader = !friendId
    ? 'waiting'
    : weeklyPercentDifference > 0
      ? 'me'
      : weeklyPercentDifference < 0
        ? 'friend'
        : 'tied';

  return {
    myScore,
    friendScore,
    difference,
    leader,
    myPersonalActions,
    friendPersonalActions,
    mySharedCompletions,
    friendSharedCompletions,
    sharedBonusCount,
    myWeeklyPercent: myWeeklyStats.percent,
    friendWeeklyPercent: friendWeeklyStats.percent,
    weeklyPercentDifference,
    weeklyPercentLeader,
  };
}
