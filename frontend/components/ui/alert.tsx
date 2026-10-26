import * as React from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "warning" | "danger" | "success";

const tones: Record<Tone, string> = {
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
};

/** Icon per tone, so status never reads as colour alone. */
const icons: Record<Tone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleX,
  success: CircleCheck,
};

/**
 * - Alert
 * Inline notice for server errors, cold-start hints and system-only warnings.
 * Used instead of a toast wherever the message has to stay on screen.
 */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius)] px-3 py-2.5 text-sm",
        tones[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={title ? "mt-0.5" : ""}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
