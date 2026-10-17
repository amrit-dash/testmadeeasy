import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";
import { supabase } from "../lib/supabase";
import { fetchWithAuth, getAuthToken } from "../lib/queryClient";

const USER_SCOPED_PREFIXES = ["/api/questions", "/api/test-papers", "/api/profile", "/api/jobs"];
const AUTH_QUERY_KEY = ["/api/auth/user"] as const;

async function fetchUser(): Promise<User | null> {
  const token = await getAuthToken();
  if (!token) {
    return null;
  }

  const response = await fetchWithAuth("/api/auth/user");

  if (response.status === 401) {
    await supabase.auth.signOut();
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

function clearUserScopedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" &&
      USER_SCOPED_PREFIXES.includes(query.queryKey[0]),
  });
}

type AuthContextValue = {
  user: User | null | undefined;
  isLoading: boolean;
  authReady: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().finally(() => {
      if (mounted) setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setAuthReady(true);

      if (event === "SIGNED_OUT" || !session) {
        queryClient.setQueryData(AUTH_QUERY_KEY, null);
        clearUserScopedQueries(queryClient);
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        }, 150);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(invalidateTimerRef.current);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchUser,
    enabled: authReady,
    retry: false,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousUserIdRef.current !== null && previousUserIdRef.current !== currentUserId) {
      clearUserScopedQueries(queryClient);
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id, queryClient]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      clearUserScopedQueries(queryClient);
    },
  });

  const value: AuthContextValue = {
    user,
    isLoading: !authReady || isLoading,
    authReady,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
