import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost";
type Size = "md" | "sm" | "icon";

/** Class map for the three button styles in the design spec. */
const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(8_45_35/0.25)] hover:brightness-110 active:translate-y-px disabled:bg-primary/50 disabled:shadow-none",
  // the hover is a tint, not a fill: a secondary action must never read as
  // the teal primary sitting beside it
  outline:
    "border border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/40 disabled:opacity-50",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
};

const sizes: Record<Size, string> = {
  // 40px tall / 44px on touch, per the component rules
  md: "h-10 min-h-10 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
  icon: "h-10 w-10 justify-center",
};

/** Props for {@link Button}. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** stretch to the container width (auth cards, form submits) */
  fullWidth?: boolean;
}

/**
 * - Button
 * Single component for the primary (teal), outline and ghost actions.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  fullWidth,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius)] font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        fullWidth && "w-full justify-center",
        className,
      )}
      {...props}
    />
  );
}
