"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
};

const tabs: Tab[] = [
  { label: "TODAY", href: "/today" },
  { label: "PLAN", href: "/plan" },
  { label: "PROGRESS", href: "/progress" },
  { label: "BODY", href: "/body" },
  { label: "LOG", href: "/log" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="hairline-top flex flex-none items-center justify-around px-3 pt-3 pb-4">
      {tabs.map((tab) => {
        // startsWith so nested routes like /plan/x keep PLAN active
        const active = pathname?.startsWith(tab.href) ?? false;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            className={`font-mono text-[9px] tracking-[.14em] ${
              active ? "border-b-2 border-sig text-white pb-[6px] -mb-[6px]" : "text-[#5c6168]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
