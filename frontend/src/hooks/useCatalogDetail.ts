import { useEffect, useState } from "react";
import { api, ApiError, type ApiResponse } from "@/src/lib/api-client";

/**
 * Loads one catalog record by id. When `initialData` (e.g. the row already
 * shown in the list) is given, it renders immediately and the fresh record
 * replaces it once loaded, so opening details never flashes a spinner.
 */
export function useCatalogDetail<T>(id: string, path: string, initialData?: T) {
  const [retry, setRetry] = useState(0);
  const key = `${path}/${id}:${retry}`;
  const invalidId =
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) > 2_147_483_647;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
    notFound?: boolean;
  }>();

  useEffect(() => {
    if (invalidId) return;
    const controller = new AbortController();
    api.get<ApiResponse<T>>(`${path}/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(({ data: { data } }) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load this record.",
            notFound: cause instanceof ApiError && cause.status === 404,
          });
      });
    return () => controller.abort();
  }, [id, path, key, invalidId]);

  const fetched = result?.key === key ? result : undefined;
  const notFound = invalidId || !!fetched?.notFound;
  const data = notFound ? undefined : (fetched?.data ?? initialData);

  return {
    data,
    loading: !invalidId && !fetched && !initialData,
    error: data ? undefined : fetched?.error,
    notFound,
    reload: () => setRetry((value) => value + 1),
  };
}
