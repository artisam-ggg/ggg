"use client";

import { useState, useCallback } from "react";

export type AdminActionStatus = "idle" | "loading" | "success" | "error";

interface UseAdminActionResult<T> {
  status: AdminActionStatus;
  error: string | null;
  data: T | null;
  execute: (action: () => Promise<T>) => Promise<void>;
  reset: () => void;
}

/**
 * Shared state handler for admin dashboard mutations.
 * The caller supplies an async action that either resolves with the payload
 * or throws an error message; the hook tracks loading/success/error states.
 */
export function useAdminAction<T = void>(): UseAdminActionResult<T> {
  const [status, setStatus] = useState<AdminActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(async (action: () => Promise<T>) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await action();
      setData(result);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setData(null);
  }, []);

  return { status, error, data, execute, reset };
}

/** Small helper to parse the app's ok/error JSON envelope. */
export async function parseAdminResponse<T>(res: Response): Promise<T> {
  let json: { ok: boolean; data?: T; error?: { message?: string } };
  try {
    json = await res.json();
  } catch {
    throw new Error("Invalid response from server");
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data as T;
}
