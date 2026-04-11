export type AvatarConfig = {
  avatarBgColor: string;
  avatarEmoji: string;
};

type AvatarBadgeProps = AvatarConfig & {
  ring?: boolean;
  label: string;
};

export default function AvatarBadge({ avatarBgColor, avatarEmoji, ring = false, label }: AvatarBadgeProps) {
  return (
    <div className={ring ? 'battle-clone-avatar-wrap battle-clone-avatar-wrap-ring' : 'battle-clone-avatar-wrap'}>
      <div
        className="battle-clone-avatar"
        style={{ backgroundColor: avatarBgColor }}
        aria-label={label}
        role="img"
      >
        <span>{avatarEmoji}</span>
      </div>
    </div>
  );
}
