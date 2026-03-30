import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/home', label: '홈' },
  { to: '/friends', label: '친구' },
  { to: '/feed', label: '피드' },
  { to: '/mypage', label: '마이' },
];

export default function BottomTabBar() {
  return (
    <nav className="tab-bar" aria-label="하단 탭">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => (isActive ? 'tab-item tab-item-active' : 'tab-item')}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
