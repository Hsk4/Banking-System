/**
 * - Class name joiner
 * Tiny local `cn` so the UI primitives do not need `clsx`/`tailwind-merge`.
 * Later values win for conflicting utilities only when they share a prefix;
 * components keep their overrides to colour/size classes.
 *
 * @param classes - class strings, falsy values are dropped
 * @returns the joined class string
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
