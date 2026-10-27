"use client";

import * as React from "react";

/**
 * - Hide balances
 * A per-device preference: people glance at their phone in public and would
 * rather the figures were dots. Stored in localStorage, so it follows the
 * device rather than the account.
 */

const STORAGE_KEY = "banking-ui-hide-balances";

interface HideBalancesValue {
  /** true when figures should be masked */
  hidden: boolean;
  /** flip the preference and persist it */
  toggle: () => void;
}

const HideBalancesContext = React.createContext<HideBalancesValue | null>(null);

/**
 * - Hide-balances provider
 * Wraps the signed-in pages. The stored value is read after mount, so the
 * server and the first client render agree.
 */
export function HideBalancesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = React.useState(false);

  // read after the first paint, so the server and the first client render
  // agree and no state is set inside the effect body itself
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setHidden(localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        // private mode - leave balances visible
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = React.useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // storage unavailable - the choice still holds for this page
      }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ hidden, toggle }), [hidden, toggle]);

  return <HideBalancesContext value={value}>{children}</HideBalancesContext>;
}

/** Read the preference. Safe outside the provider: balances stay visible. */
export function useHideBalances(): HideBalancesValue {
  return (
    React.useContext(HideBalancesContext) ?? {
      hidden: false,
      toggle: () => {},
    }
  );
}
