import { TabBar } from "@/components/shell/TabBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[414px] flex-col">
      <div className="flex-1 overflow-y-auto">{children}</div>
      <TabBar />
    </div>
  );
}
