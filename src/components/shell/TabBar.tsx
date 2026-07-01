"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  size: number;
  icon: React.ReactNode;
};

const tabs: Tab[] = [
  {
    label: "TODAY",
    href: "/today",
    size: 22,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.1"></circle>
        <path d="M12 5v1.4M12 17.6v1.4M5 12h1.4M17.6 12h1.4M7 7l1 1M16 16l1 1M17 7l-1 1M8 16l-1 1"></path>
      </svg>
    ),
  },
  {
    label: "PLAN",
    href: "/plan",
    size: 22,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="5.5" y="6.5" width="13" height="12" rx="2"></rect>
        <path d="M5.5 10.2h13M9.5 4.8v3.4M14.5 4.8v3.4"></path>
      </svg>
    ),
  },
  {
    label: "COACH",
    href: "/coach",
    size: 23,
    icon: (
      <svg width={23} height={23} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="13.8" r="6.8" stroke="currentColor" strokeWidth={1.9}></circle>
        <path d="M12 13.8V9.8M9.8 3.6h4.4M12 3.6v2.8M18 7.4l1.4-1.4" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"></path>
      </svg>
    ),
  },
  {
    label: "BODY",
    href: "/body",
    size: 22,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="6" r="2.5" fill="currentColor"></circle>
        <path d="M12 9.5c-2.2 0-3.5 1.6-3.5 3.6v2.2h1.4l.4 4.7h1.4l.3-3.4.3 3.4h1.4l.4-4.7h1.4v-2.2c0-2-1.3-3.6-3.5-3.6z" fill="currentColor"></path>
      </svg>
    ),
  },
  {
    label: "PROGRESS",
    href: "/progress",
    size: 22,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18l5-6 3.5 3.5L20 7"></path>
        <path d="M15 7h5v5"></path>
      </svg>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-none items-center justify-around px-3 pt-3 pb-1.5"
      style={{ borderTop: "1px solid rgba(255,255,255,.05)", background: "rgba(0,0,0,.22)" }}
    >
      {tabs.map((tab) => {
        // startsWith so nested routes like /plan/x keep PLAN active
        const active = pathname?.startsWith(tab.href) ?? false;
        const activeColor = tab.label === "COACH" ? "text-accent" : "text-white";
        const color = active ? activeColor : "text-[#aab0b8]";

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            className={`flex flex-col items-center gap-[5px] ${color}`}
          >
            {tab.icon}
            <span className="text-[9px] font-bold tracking-[.04em]">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
