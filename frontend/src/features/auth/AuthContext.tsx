"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { onUnauthorized } from "@/src/lib/api-client";
import {
  getSession,
  signOut as apiSignOut,
  type AuthSession,
  type AuthUser,
  type SessionData,
} from "./auth.api";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unknown";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSession | null;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  refreshSession: (options?: { silent?: boolean }) => Promise<SessionData | null>;
  setAuthenticatedUser: (user: AuthUser) => void;
  updateDisplayName: (fullName: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Module-level deduplication prevents duplicate /api/auth/get-session calls
// when React StrictMode mounts/unmounts/remounts in development.
let inflightSessionRequest: Promise<SessionData | null> | null = null;
let lastFetchedAt = 0;

export function resetAuthSessionCacheForTests() {
  inflightSessionRequest = null;
  lastFetchedAt = 0;
}

function fetchSessionDeduped(force = false): Promise<SessionData | null> {
  if (!force && inflightSessionRequest) {
    return inflightSessionRequest;
  }
  const request = getSession()
    .then((result) => {
      lastFetchedAt = Date.now();
      return result;
    })
    .finally(() => {
      if (inflightSessionRequest === request) {
        inflightSessionRequest = null;
      }
    });
  inflightSessionRequest = request;
  return request;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const statusRef = useRef<AuthStatus>("loading");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const applySessionResult = useCallback((data: SessionData | null) => {
    if (data) {
      setUser(data.user);
      setSession(data.session);
      setStatus("authenticated");
      setSessionNotice(null);
    } else {
      setUser(null);
      setSession(null);
      setStatus("unauthenticated");
    }
  }, []);

  const refreshSession = useCallback(
    async (options?: { silent?: boolean }): Promise<SessionData | null> => {
      if (!options?.silent && statusRef.current === "unknown") {
        setStatus("loading");
      }
      try {
        const data = await fetchSessionDeduped(true);
        applySessionResult(data);
        return data;
      } catch (cause) {
        if (axios.isCancel(cause)) return null;
        // Preserve signed-out vs unreachable ("unknown") state explicitly
        if (statusRef.current !== "authenticated") {
          setUser(null);
          setSession(null);
          setStatus("unknown");
        }
        return null;
      }
    },
    [applySessionResult],
  );

  // Initial session hydration — deduplicated across StrictMode double-mount
  useEffect(() => {
    let active = true;
    fetchSessionDeduped(false)
      .then((data) => {
        if (active) applySessionResult(data);
      })
      .catch((cause) => {
        if (!active || axios.isCancel(cause)) return;
        setUser(null);
        setSession(null);
        setStatus("unknown");
      });
    return () => {
      active = false;
    };
  }, [applySessionResult]);

  // Revalidate when the browser tab regains focus (reflects cross-tab sign-out/sign-in)
  useEffect(() => {
    const handleFocus = () => {
      if (Date.now() - lastFetchedAt < 2_000) return;
      void refreshSession({ silent: true });
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshSession]);

  // Single centralized 401 handler: clears session once without loops or duplicate popups
  useEffect(() => {
    return onUnauthorized(() => {
      if (statusRef.current === "authenticated") {
        setUser(null);
        setSession(null);
        setStatus("unauthenticated");
        setSessionNotice("Your session expired. Please sign in again.");
      }
    });
  }, []);

  const setAuthenticatedUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setStatus("authenticated");
    setSessionNotice(null);
  }, []);

  const updateDisplayName = useCallback((fullName: string) => {
    const trimmed = fullName.trim();
    if (!trimmed) return;
    setUser((prev) => (prev ? { ...prev, name: trimmed } : prev));
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
    setSession(null);
    setStatus("unauthenticated");
    setSessionNotice(null);
    lastFetchedAt = Date.now();
  }, []);

  const clearSessionNotice = useCallback(() => {
    setSessionNotice(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        session,
        sessionNotice,
        clearSessionNotice,
        refreshSession,
        setAuthenticatedUser,
        updateDisplayName,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
