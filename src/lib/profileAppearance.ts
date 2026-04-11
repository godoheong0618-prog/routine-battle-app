export type ThemeColorKey = 'yellow' | 'navy' | 'mint' | 'pink' | 'purple' | 'gray';

export type ProfileAppearanceSource = {
  avatar_emoji?: string | null;
  theme_color?: string | null;
};

export type ThemePalette = {
  key: ThemeColorKey;
  label: { ko: string; en: string };
  swatch: string;
  avatarBg: string;
  avatarText: string;
  avatarBorder: string;
  cardBackground: string;
  cardBorder: string;
  softSurface: string;
  softBorder: string;
};

export const DEFAULT_AVATAR_EMOJI = '😀';
export const DEFAULT_THEME_COLOR: ThemeColorKey = 'yellow';

export const PROFILE_EMOJI_OPTIONS = ['😀', '😊', '😎', '🤓', '🦊', '🐻', '🐱', '🐼', '🐰', '🐯', '🌟', '🔥'] as const;

export const PROFILE_THEME_MAP: Record<ThemeColorKey, ThemePalette> = {
  yellow: {
    key: 'yellow',
    label: { ko: '옐로우', en: 'Yellow' },
    swatch: '#ffd348',
    avatarBg: '#ffd348',
    avatarText: '#2f2600',
    avatarBorder: '#e5c24a',
    cardBackground: 'linear-gradient(135deg, rgba(255, 211, 72, 0.22), rgba(255, 255, 255, 0.96) 58%)',
    cardBorder: '#e8d6a5',
    softSurface: '#f7edd0',
    softBorder: '#ecd8a0',
  },
  navy: {
    key: 'navy',
    label: { ko: '네이비', en: 'Navy' },
    swatch: '#253a67',
    avatarBg: '#253a67',
    avatarText: '#ffffff',
    avatarBorder: '#1f3157',
    cardBackground: 'linear-gradient(135deg, rgba(37, 58, 103, 0.16), rgba(255, 255, 255, 0.97) 60%)',
    cardBorder: '#cfd7e8',
    softSurface: '#eef2f8',
    softBorder: '#d7dfef',
  },
  mint: {
    key: 'mint',
    label: { ko: '민트', en: 'Mint' },
    swatch: '#91d6c4',
    avatarBg: '#91d6c4',
    avatarText: '#16362e',
    avatarBorder: '#79c4b1',
    cardBackground: 'linear-gradient(135deg, rgba(145, 214, 196, 0.2), rgba(255, 255, 255, 0.96) 62%)',
    cardBorder: '#cce6dd',
    softSurface: '#edf7f4',
    softBorder: '#d8ece6',
  },
  pink: {
    key: 'pink',
    label: { ko: '핑크', en: 'Pink' },
    swatch: '#f3b8c8',
    avatarBg: '#f3b8c8',
    avatarText: '#4d2433',
    avatarBorder: '#e6a3b6',
    cardBackground: 'linear-gradient(135deg, rgba(243, 184, 200, 0.18), rgba(255, 255, 255, 0.97) 60%)',
    cardBorder: '#ecd4db',
    softSurface: '#fbf0f4',
    softBorder: '#f0d8df',
  },
  purple: {
    key: 'purple',
    label: { ko: '퍼플', en: 'Purple' },
    swatch: '#8e84c8',
    avatarBg: '#8e84c8',
    avatarText: '#ffffff',
    avatarBorder: '#7d73b9',
    cardBackground: 'linear-gradient(135deg, rgba(142, 132, 200, 0.18), rgba(255, 255, 255, 0.97) 60%)',
    cardBorder: '#dad5ec',
    softSurface: '#f2f0fa',
    softBorder: '#e0dbf1',
  },
  gray: {
    key: 'gray',
    label: { ko: '그레이', en: 'Gray' },
    swatch: '#8f959f',
    avatarBg: '#8f959f',
    avatarText: '#ffffff',
    avatarBorder: '#7d838c',
    cardBackground: 'linear-gradient(135deg, rgba(143, 149, 159, 0.16), rgba(255, 255, 255, 0.97) 60%)',
    cardBorder: '#dadcdf',
    softSurface: '#f1f3f5',
    softBorder: '#e1e4e7',
  },
};

export const PROFILE_THEME_OPTIONS = Object.values(PROFILE_THEME_MAP);

export function normalizeThemeColor(value: string | null | undefined): ThemeColorKey {
  if (!value) {
    return DEFAULT_THEME_COLOR;
  }

  return value in PROFILE_THEME_MAP ? (value as ThemeColorKey) : DEFAULT_THEME_COLOR;
}

export function normalizeAvatarEmoji(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : DEFAULT_AVATAR_EMOJI;
}

export function getProfileAppearance(source?: ProfileAppearanceSource | null) {
  const themeColor = normalizeThemeColor(source?.theme_color);
  const palette = PROFILE_THEME_MAP[themeColor];

  return {
    ...palette,
    themeColor,
    avatarEmoji: normalizeAvatarEmoji(source?.avatar_emoji),
  };
}
