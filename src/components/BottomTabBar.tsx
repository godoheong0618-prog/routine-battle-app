import { NavLink } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

export default function BottomTabBar() {
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  const tabs = [
    { to: '/home', label: isKo ? '홈' : 'Home' },
    { to: '/battle', label: isKo ? '배틀' : t('tabs.battle') },
    { to: '/stats', label: isKo ? '기록' : 'Stats' },
  ];

  return (
    <nav className="tab-bar" aria-label={t('tabs.ariaLabel')}>
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
