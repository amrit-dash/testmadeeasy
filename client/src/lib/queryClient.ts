import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

const USER_ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** User-scoped React Query keys so cached data cannot leak across sessions. */
export function userQueryKey(
  userId: string | undefined | null,
  apiPath: string,
  ...segments: (string | number | undefined | null)[]
): readonly string[] {
  const tail = segments.filter((s): s is string | number => s != null && s !== "").map(String);
  if (userId) return [apiPath, userId, ...tail];
  return [apiPath, ...tail];
}

export function buildApiUrl(queryKey: readonly unknown[]): string {
  if (typeof queryKey[0] !== "string") {
    throw new Error("Query key must start with a URL string");
  }
  const parts = queryKey.map(String);
  const base = parts[0];
  const rest = parts.length > 1 && USER_ID_SEGMENT.test(parts[1]) ? parts.slice(2) : parts.slice(1);
  if (rest.length === 0) return base;
  return `${base.replace(/\/$/, "")}/${rest.join("/")}`;
}

function readTokenFromLocalStorage(): string | null {
  try {
    const storageKey = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!storageKey) return null;
    const storedAuth = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return storedAuth?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Resolve the current Supabase access token, with brief retries during session hydration. */
export async function getAuthToken(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token ?? readTokenFromLocalStorage();
    if (token) return token;
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  return null;
}

export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit, retryCount = 0): Promise<Response> {
  const token = await getAuthToken();

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (err) {
    if (retryCount < 1) {
      await new Promise(resolve => setTimeout(resolve, 400));
      return fetchWithAuth(input, init, retryCount + 1);
    }
    throw err;
  }

  if (res.status === 401 && retryCount < 2) {
    await supabase.auth.refreshSession().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 300));
    return fetchWithAuth(input, init, retryCount + 1);
  }

  return res;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  const res = await fetchWithAuth(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const res = await fetchWithAuth(buildApiUrl(queryKey));

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: 1000 * 60 * 5,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
