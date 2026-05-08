import { useRef, useCallback } from "react";
import { useAppState, useDispatch } from "../context";
import { createApiClient } from "../lib/api";

export default function useNegotiate() {
  const { selectedBaseUrl } = useAppState();
  const dispatch = useDispatch();
  const apiRef = useRef(createApiClient());

  const negotiate = useCallback(
    async (agentSchema: string, providerId: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const startTime = performance.now();

      dispatch({ type: "SET_STATUS", status: "negotiating" });

      try {
        const parsedSchema = JSON.parse(agentSchema);
        const result = await apiRef.current.negotiate(parsedSchema, providerId, selectedBaseUrl ?? undefined, controller.signal);
        const duration = Math.round(performance.now() - startTime);
        dispatch({ type: "SET_NEGOTIATION_RESULT", result, duration });
        dispatch({ type: "SET_STATUS", status: "idle" });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          dispatch({
            type: "ADD_ERROR",
            error: { code: "NEGOTIATE_TIMEOUT", message: "Negotiation timed out after 30s" },
          });
        } else {
          const message = err instanceof Error ? err.message : "Negotiation failed";
          dispatch({
            type: "ADD_ERROR",
            error: { code: "NEGOTIATE_ERROR", message, details: err },
          });
        }
        dispatch({ type: "SET_STATUS", status: "error" });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [dispatch, selectedBaseUrl],
  );

  return { negotiate };
}
