import { NavLink } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

export default function BottomTabBar() {
  const { t } = useLanguage();

  const tabs = [
    { to: '/home', label: 'Today' },
    { to: '/battle', label: t('tabs.battle') },
    { to: '/stats', label: 'Stats' },
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
