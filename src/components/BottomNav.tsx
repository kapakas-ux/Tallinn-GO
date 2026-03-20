import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Route, Bus, Map as MapIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export const BottomNav = () => {
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/planner', icon: Route, label: 'Planner' },
    { to: '/stops', icon: Bus, label: 'Stops' },
    { to: '/map', icon: MapIcon, label: 'Map' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-4 pt-2 bg-surface dark:bg-slate-950 z-50 rounded-t-xl shadow-[0_-4px_24px_rgba(28,28,26,0.06)]">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center px-5 py-2 transition-all duration-200 active:scale-90",
              isActive 
                ? "bg-primary-fixed dark:bg-blue-900/40 text-primary dark:text-blue-200 rounded-xl" 
                : "text-secondary dark:text-slate-500 hover:text-primary dark:hover:text-blue-300"
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
