import { useRef, useCallback } from "react";
import { useAppState, useDispatch } from "../context";
import { createApiClient } from "../lib/api";

export default function useExecute() {
  const { selectedBaseUrl } = useAppState();
  const dispatch = useDispatch();
  const apiRef = useRef(createApiClient());

  const execute = useCallback(
    async (providerId: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const startTime = performance.now();

      dispatch({ type: "SET_STATUS", status: "executing" });

      try {
        const result = await apiRef.current.execute(
          { provider_id: providerId, baseUrl: selectedBaseUrl ?? undefined },
          controller.signal,
        );
        const duration = Math.round(performance.now() - startTime);
        dispatch({ type: "SET_EXECUTION_RESULT", result, duration });
        dispatch({ type: "SET_STATUS", status: "idle" });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          dispatch({
            type: "ADD_ERROR",
            error: { code: "EXECUTE_TIMEOUT", message: "Execution timed out after 30s" },
          });
        } else {
          const message = err instanceof Error ? err.message : "Execution failed";
          dispatch({
            type: "ADD_ERROR",
            error: { code: "EXECUTE_ERROR", message, details: err },
          });
        }
        dispatch({ type: "SET_STATUS", status: "error" });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [dispatch, selectedBaseUrl],
  );

  return { execute };
}
