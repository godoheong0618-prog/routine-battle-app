import { Locale } from '../i18n/messages';

type NameKind = 'user' | 'opponent' | 'self';

type NameDisplayOptions = {
  fallback?: string;
  locale: Locale;
};

const DEFAULT_LABELS: Record<Locale, Record<NameKind, string>> = {
  ko: {
    user: '\uCE5C\uAD6C',
    opponent: '\uC0C1\uB300',
    self: '\uB098',
  },
  en: {
    user: 'Friend',
    opponent: 'Opponent',
    self: 'Me',
  },
};

const DEFAULT_SUBJECT_LABELS: Record<Locale, Record<NameKind, string>> = {
  ko: {
    user: '\uCE5C\uAD6C\uAC00',
    opponent: '\uC0C1\uB300\uAC00',
    self: '\uB0B4\uAC00',
  },
  en: {
    user: 'Friend',
    opponent: 'Opponent',
    self: 'You',
  },
};

function resolveFallback(kind: NameKind, locale: Locale, fallback?: string) {
  const trimmedFallback = fallback?.trim();
  return trimmedFallback || DEFAULT_LABELS[locale][kind];
}

function resolveSubjectFallback(kind: NameKind, locale: Locale, fallback?: string) {
  const trimmedFallback = fallback?.trim();

  if (trimmedFallback) {
    if (kind === 'self' && trimmedFallback === DEFAULT_LABELS[locale].self) {
      return DEFAULT_SUBJECT_LABELS[locale].self;
    }

    return locale === 'ko' ? withSubjectParticle(trimmedFallback) : trimmedFallback;
  }

  return DEFAULT_SUBJECT_LABELS[locale][kind];
}

function getLastRelevantChar(value: string) {
  const characters = Array.from(value.trim());

  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const current = characters[index];

    if (/[0-9A-Za-z\uAC00-\uD7A3]/u.test(current)) {
      return current;
    }
  }

  return '';
}

function hasBatchim(value: string) {
  const lastChar = getLastRelevantChar(value);

  if (!lastChar) {
    return false;
  }

  const code = lastChar.codePointAt(0);

  if (!code || code < 0xac00 || code > 0xd7a3) {
    return false;
  }

  return (code - 0xac00) % 28 !== 0;
}

function addParticle(label: string, consonantParticle: string, vowelParticle: string) {
  return `${label}${hasBatchim(label) ? consonantParticle : vowelParticle}`;
}

export function normalizeDisplayName(name?: string | null) {
  const condensed = name?.trim().replace(/\s+/g, ' ') ?? '';

  if (!condensed) {
    return '';
  }

  const withoutHonorific = condensed.replace(/\s*\uB2D8+$/u, '').trim();
  return withoutHonorific || condensed;
}

export function formatUserLabel(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  return normalizeDisplayName(name) || resolveFallback('user', locale, options?.fallback);
}

export function formatOpponentLabel(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  return normalizeDisplayName(name) || resolveFallback('opponent', locale, options?.fallback);
}

export function formatSelfLabel(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  return normalizeDisplayName(name) || resolveFallback('self', locale, options?.fallback);
}

export function withSubjectParticle(label: string, locale: Locale = 'ko') {
  if (locale !== 'ko') {
    return label;
  }

  return addParticle(label, '\uC774', '\uAC00');
}

export function withCompanionParticle(label: string, locale: Locale = 'ko') {
  if (locale !== 'ko') {
    return label;
  }

  return addParticle(label, '\uACFC', '\uC640');
}

export function formatUserSubject(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  const normalized = normalizeDisplayName(name);

  if (normalized) {
    return withSubjectParticle(normalized, locale);
  }

  return resolveSubjectFallback('user', locale, options?.fallback);
}

export function formatOpponentSubject(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  const normalized = normalizeDisplayName(name);

  if (normalized) {
    return withSubjectParticle(normalized, locale);
  }

  return resolveSubjectFallback('opponent', locale, options?.fallback);
}

export function formatSelfSubject(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  const normalized = normalizeDisplayName(name);

  if (normalized) {
    return withSubjectParticle(normalized, locale);
  }

  return resolveSubjectFallback('self', locale, options?.fallback);
}

export function formatUserCompanion(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  const label = formatUserLabel(name, options);
  return withCompanionParticle(label, locale);
}

export function formatOpponentCompanion(name?: string | null, options?: NameDisplayOptions) {
  const locale = options?.locale ?? 'ko';
  const label = formatOpponentLabel(name, options);
  return withCompanionParticle(label, locale);
}

export function formatBattlePairLabel({
  locale,
  leftName,
  rightName,
  leftFallback,
  rightFallback,
}: {
  leftFallback?: string;
  leftName?: string | null;
  locale: Locale;
  rightFallback?: string;
  rightName?: string | null;
}) {
  const leftLabel = formatSelfLabel(leftName, { locale, fallback: leftFallback });
  const rightLabel = formatOpponentLabel(rightName, { locale, fallback: rightFallback });
  return `${leftLabel} vs ${rightLabel}`;
}
