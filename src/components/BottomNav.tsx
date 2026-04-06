import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map as MapIcon, Route as RouteIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

const StopsIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Bench */}
    <path d="M2 14h11" />
    <path d="M2 11v3" />
    <path d="M13 11v3" />
    <path d="M4 14v4" />
    <path d="M11 14v4" />
    
    {/* Bus Stop Sign */}
    <path d="M19 18V5" />
    <rect x="16" y="5" width="6" height="5" rx="1" />
    <path d="M18 7.5h2" />
  </svg>
);

export const BottomNav = () => {
  const { t } = useTranslation();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/stops', icon: StopsIcon, label: t('nav.stops') },
    { to: '/map', icon: MapIcon, label: t('nav.map') },
    { to: '/plan', icon: RouteIcon, label: t('nav.plan') },
  ];

  return (
    <nav className="absolute bottom-0 left-0 right-0 w-full flex justify-evenly items-center px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-50 rounded-t-[32px] shadow-[0_-4px_24px_rgba(28,28,26,0.06)]">
      <div className="nav-orb-layer">
        <div className="nav-orb nav-orb-1" />
        <div className="nav-orb nav-orb-2" />
        <div className="nav-orb nav-orb-3" />
      </div>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center w-[72px] py-2 transition-all duration-200 active:scale-90 relative z-10",
              isActive 
                ? "bg-primary-fixed text-primary rounded-xl" 
                : "text-secondary hover:text-primary"
            )
          }
        >
          <item.icon className={cn("w-6 h-6", item.to === '/stops' ? "fill-current" : "")} />
          <span className="font-label text-[10px] uppercase tracking-widest font-bold mt-1">
            {item.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
};
