import { NavLink } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

type TabIconProps = {
  active: boolean;
};

function HomeTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'tab-icon tab-icon-active' : 'tab-icon'}>
      <path d="M4.5 10.5 12 4l7.5 6.5" />
      <path d="M6.5 9.8V20h11V9.8" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  );
}

function BattleTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'tab-icon tab-icon-active' : 'tab-icon'}>
      <path d="M7 4.5 12 10l5-5.5" />
      <path d="m8.25 11.25-4 4 4.5 4.25" />
      <path d="m15.75 11.25 4 4-4.5 4.25" />
      <path d="M10 9.75 5.75 14" />
      <path d="M14 9.75 18.25 14" />
    </svg>
  );
}

function StatsTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'tab-icon tab-icon-active' : 'tab-icon'}>
      <path d="M6 19.5V11" />
      <path d="M12 19.5V6.5" />
      <path d="M18 19.5V13.5" />
    </svg>
  );
}

export default function BottomTabBar() {
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  const tabs = [
    { to: '/home', label: isKo ? '홈' : t('tabs.home'), Icon: HomeTabIcon },
    { to: '/battle', label: isKo ? '배틀' : t('tabs.battle'), Icon: BattleTabIcon },
    { to: '/stats', label: isKo ? '기록' : 'Stats', Icon: StatsTabIcon },
  ];

  return (
    <nav className="tab-bar" aria-label={t('tabs.ariaLabel')}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => (isActive ? 'tab-item tab-item-active' : 'tab-item')}
        >
          {({ isActive }) => (
            <>
              <span className="tab-item-icon">
                <tab.Icon active={isActive} />
              </span>
              <span className="tab-item-label">{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
