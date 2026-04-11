import { NavLink } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

type TabIconProps = {
  active: boolean;
};

function HomeTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'service-tab-icon service-tab-icon-active' : 'service-tab-icon'}>
      <path d="M4.75 10.5 12 4.5l7.25 6" />
      <path d="M6.5 9.75V19h11V9.75" />
      <path d="M10.25 19v-5h3.5v5" />
    </svg>
  );
}

function BattleTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'service-tab-icon service-tab-icon-active' : 'service-tab-icon'}>
      <path d="m7 6 5 5" />
      <path d="m12 11 5-5" />
      <path d="m9.25 13.75-3 3" />
      <path d="m14.75 13.75 3 3" />
      <path d="m6.5 7.5 2-2" />
      <path d="m15.5 5.5 2 2" />
    </svg>
  );
}

function StatsTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'service-tab-icon service-tab-icon-active' : 'service-tab-icon'}>
      <path d="M6 18.5V11" />
      <path d="M12 18.5V6.5" />
      <path d="M18 18.5V13.5" />
    </svg>
  );
}

function FriendsTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'service-tab-icon service-tab-icon-active' : 'service-tab-icon'}>
      <path d="M9 11.25c1.7 0 3.08-1.44 3.08-3.25S10.7 4.75 9 4.75 5.92 6.19 5.92 8 7.3 11.25 9 11.25Z" />
      <path d="M15.38 10.25c1.42 0 2.57-1.18 2.57-2.63S16.8 5 15.38 5s-2.58 1.18-2.58 2.62 1.16 2.63 2.58 2.63Z" />
      <path d="M4.92 18.75c.75-1.92 2.55-3.12 4.58-3.12s3.82 1.2 4.58 3.12" />
      <path d="M13.42 17.75c.47-1.18 1.58-1.92 2.9-1.92 1.27 0 2.28.62 2.68 1.58" />
    </svg>
  );
}

function MyTabIcon({ active }: TabIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={active ? 'service-tab-icon service-tab-icon-active' : 'service-tab-icon'}>
      <path d="M12 11.25c1.8 0 3.25-1.46 3.25-3.25S13.8 4.75 12 4.75 8.75 6.2 8.75 8 10.2 11.25 12 11.25Z" />
      <path d="M6.5 19c.8-2.27 2.98-3.67 5.5-3.67s4.7 1.4 5.5 3.67" />
    </svg>
  );
}

export default function BottomTabBar() {
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  const tabs = [
    { to: '/home', label: isKo ? '홈' : t('tabs.home'), Icon: HomeTabIcon },
    { to: '/battle', label: isKo ? '배틀' : t('tabs.battle'), Icon: BattleTabIcon },
    { to: '/stats', label: isKo ? '기록' : 'Records', Icon: StatsTabIcon },
    { to: '/friends', label: isKo ? '친구' : t('tabs.friends'), Icon: FriendsTabIcon },
    { to: '/mypage', label: isKo ? '마이' : t('tabs.my'), Icon: MyTabIcon },
  ];

  return (
    <nav className="service-tab-bar" aria-label={t('tabs.ariaLabel')}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => (isActive ? 'service-tab-item service-tab-item-active' : 'service-tab-item')}
        >
          {({ isActive }) => (
            <>
              <span className="service-tab-item-icon">
                <tab.Icon active={isActive} />
              </span>
              <span className="service-tab-item-label">{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
