import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * Instrument ruled-section building block: optional header row, content,
 * closed by a hairline bottom rule. Design ref: design-v2/README.md
 * §Signature patterns "Section header row"; every #7x screen composes
 * sections this way (e.g. #7a THIS WEEK, #7c VITALS).
 */
export function Section({
  header,
  children,
  className,
}: {
  header?: { label: string; context?: string; contextHref?: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `hairline ${className}` : "hairline"}>
      {header ? (
        <SectionHeader
          label={header.label}
          accent=""
          context={header.context}
          contextHref={header.contextHref}
        />
      ) : null}
      {children}
    </div>
  );
}
