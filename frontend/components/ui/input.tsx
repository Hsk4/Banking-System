import * as React from "react";
import { cn } from "@/lib/cn";

/** Props for {@link Input}. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** swap the border to the destructive colour, per the spec's error state */
  invalid?: boolean;
}

/**
 * - Input
 * 40px tall text field with the `--input` border and a 2px teal focus ring.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 w-full rounded-[var(--radius)] border bg-card px-3 text-sm text-foreground",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted",
          "transition-colors duration-150",
          invalid ? "border-destructive" : "border-input",
          className,
        )}
        {...props}
      />
    );
  },
);

/** Props for {@link Label}. */
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/**
 * - Label
 * Small muted caption used above every field.
 */
export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * - Field error
 * 12px destructive message rendered under an input. A `<div>` rather than a
 * `<p>` so it can also live inside an id-bearing wrapper without nesting
 * paragraphs (which is invalid HTML and breaks hydration).
 *
 * @param id - wiring for the input's `aria-describedby`, set only when shown
 * @param visible - keep the slot mounted while empty, so showing the message
 *   does not shift the rest of the form
 */
export function FieldError({
  id,
  visible = false,
  children,
}: {
  id?: string;
  visible?: boolean;
  children?: React.ReactNode;
}) {
  if (!children && !visible) return null;
  return (
    <div id={id} className="mt-1.5 text-xs text-destructive">
      {children}
    </div>
  );
}
