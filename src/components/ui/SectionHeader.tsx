import { Link } from 'react-router-dom';

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
};

export default function SectionHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}: SectionHeaderProps) {
  const action =
    actionLabel && actionTo ? (
      <Link className="service-section-action" to={actionTo}>
        {actionLabel}
      </Link>
    ) : actionLabel && onAction ? (
      <button className="service-section-action" type="button" onClick={onAction}>
        {actionLabel}
      </button>
    ) : null;

  return (
    <div className="service-section-header">
      <div className="service-section-copy">
        {eyebrow ? <p className="service-section-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className="service-section-description">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
