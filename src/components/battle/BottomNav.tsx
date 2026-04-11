import { NavLink } from 'react-router-dom';

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-nav-icon">
      <path d="M5 10.25 12 4.5l7 5.75" />
      <path d="M6.5 9.75V19h11V9.75" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

function BattleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-nav-icon">
      <path d="m7 6 5 5" />
      <path d="m12 11 5-5" />
      <path d="m9.25 13.75-3 3" />
      <path d="m14.75 13.75 3 3" />
      <path d="m6.5 7.5 2-2" />
      <path d="m15.5 5.5 2 2" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-nav-icon">
      <path d="M6 18.5V11" />
      <path d="M12 18.5V6.5" />
      <path d="M18 18.5V13.5" />
    </svg>
  );
}

function FriendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-nav-icon">
      <path d="M9 11.5c1.66 0 3-1.46 3-3.25S10.66 5 9 5 6 6.46 6 8.25s1.34 3.25 3 3.25Z" />
      <path d="M15.5 10.5c1.38 0 2.5-1.23 2.5-2.75S16.88 5 15.5 5 13 6.23 13 7.75s1.12 2.75 2.5 2.75Z" />
      <path d="M4.5 18.75c.72-2.07 2.55-3.25 4.5-3.25 1.96 0 3.79 1.18 4.5 3.25" />
      <path d="M13.75 17.75c.45-1.23 1.56-2 2.83-2 1.26 0 2.27.63 2.67 1.62" />
    </svg>
  );
}

function MyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="battle-clone-nav-icon">
      <path d="M12 11.25c1.8 0 3.25-1.46 3.25-3.25S13.8 4.75 12 4.75 8.75 6.21 8.75 8 10.2 11.25 12 11.25Z" />
      <path d="M6.25 19c.8-2.33 2.98-3.75 5.75-3.75S16.95 16.67 17.75 19" />
    </svg>
  );
}

const items = [
  { to: '/home', label: '\uD648', Icon: HomeIcon },
  { to: '/battle', label: '\uBC30\uD2C0', Icon: BattleIcon },
  { to: '/stats', label: '\uAE30\uB85D', Icon: RecordIcon },
  { to: '/friends', label: '\uCE5C\uAD6C', Icon: FriendIcon },
  { to: '/mypage', label: '\uB9C8\uC774', Icon: MyIcon },
];

export default function BottomNav() {
  return (
    <nav className="battle-clone-bottom-nav" aria-label={'\uD558\uB2E8 \uD0ED'}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'battle-clone-nav-item battle-clone-nav-item-active' : 'battle-clone-nav-item')}
        >
          {({ isActive }) => (
            <>
              <span className="battle-clone-nav-icon-wrap">
                <item.Icon />
              </span>
              <span className={isActive ? 'battle-clone-nav-label battle-clone-nav-label-active' : 'battle-clone-nav-label'}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
