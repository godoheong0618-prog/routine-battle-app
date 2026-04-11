import { getProfileAppearance, ProfileAppearanceSource } from '../../lib/profileAppearance';

type ProfileAvatarProps = {
  profile?: ProfileAppearanceSource | null;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
  className?: string;
};

export default function ProfileAvatar({ profile, label, size = 'md', ring = false, className = '' }: ProfileAvatarProps) {
  const appearance = getProfileAppearance(profile);
  const classes = [
    'service-avatar-badge',
    `service-avatar-badge-${size}`,
    ring ? 'service-avatar-badge-ring' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{
        backgroundColor: appearance.avatarBg,
        color: appearance.avatarText,
        borderColor: appearance.avatarBorder,
      }}
      aria-label={label}
      role="img"
    >
      <span>{appearance.avatarEmoji}</span>
    </div>
  );
}
