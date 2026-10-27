"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, logout as logoutRequest, setAuthToken } from "./api";
import type { User } from "./types";

/**
 * The API has no "who am I" route, so the user object from login/register is
 * cached in localStorage and treated as the source of truth for the shell.
 * A 401 from any request still means "logged out".
 */
const USER_KEY = "banking-ui-user";

/** Shape of the auth context. */
interface AuthContextValue {
  /** the signed-in user, or `null` before hydration / when logged out */
  user: User | null;
  /** store the user returned by login or register, with its token */
  signIn: (user: User, token?: string) => void;
  /** revoke the token, clear local state and land on /login */
  signOut: () => Promise<void>;
  /** handle a 401 from anywhere: clear state, toast, redirect */
  handleUnauthorized: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * - Auth provider
 * Holds the current user in memory after hydration and exposes sign-in /
 * sign-out to the rest of the app.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // localStorage is read after mount so the server and client markup match
  useEffect(() => {
    // one frame later, outside the effect body: the stored user arrives after
    // hydration instead of cascading a render inside the effect
    const id = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) setUser(JSON.parse(raw) as User);
      } catch {
        // corrupted entry - treat as signed out
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * Store the user from login/register.
   * @param nextUser - the authenticated user
   * @param token - the API token, kept for builds that cannot use cookies
   */
  const signIn = useCallback((nextUser: User, token?: string) => {
    setUser(nextUser);
    setAuthToken(token ?? null);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } catch {
      // storage can be unavailable (private mode) - in-memory state still works
    }
  }, []);

  const clearUser = useCallback(() => {
    setUser(null);
    setAuthToken(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearUser();
    toast.error("Your session ended. Please sign in again.");
    router.replace("/login");
  }, [clearUser, router]);

  const signOut = useCallback(async () => {
    // clear locally first: the request below carries the bearer token in its
    // Authorization header, and clearing afterwards would race that copy
    clearUser();
    try {
      await logoutRequest();
    } catch (error) {
      // a blacklist failure must not trap the user in the app
      if (error instanceof ApiError && error.status === 401) {
        // token was already invalid - nothing to revoke
      }
    }
    toast.success("You are signed out.");
    router.replace("/login");
  }, [clearUser, router]);

  const value = useMemo(
    () => ({ user, signIn, signOut, handleUnauthorized }),
    [user, signIn, signOut, handleUnauthorized],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Access the auth context. Must be used inside {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
