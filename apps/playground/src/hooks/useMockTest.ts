import { useRef, useCallback } from "react";
import { useDispatch, useAppState } from "../context";
import { createApiClient } from "../lib/api";

export default function useMockTest() {
  const dispatch = useDispatch();
  const { schema, selectedProviderId } = useAppState();
  const apiRef = useRef(createApiClient());

  const runMockTest = useCallback(
    async (mockResponse: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      dispatch({ type: "SET_STATUS", status: "mock-testing" });

      try {
        const parsedMock = JSON.parse(mockResponse);
        const result = await apiRef.current.execute(
          {
            provider_id: selectedProviderId ?? undefined,
            input: parsedMock,
          },
          controller.signal,
        );

        dispatch({
          type: "SET_MOCK_TEST_RESULT",
          result: {
            passed: true,
            expected: result.expected ?? [],
            got: result.got ?? [],
            fieldCoverage: result.fieldCoverage ?? "-",
            missingFields: result.missingFields ?? [],
            extraFields: result.extraFields ?? [],
            typeMismatches: result.typeMismatches ?? [],
          },
        });
        dispatch({ type: "SET_STATUS", status: "idle" });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          dispatch({
            type: "ADD_ERROR",
            error: { code: "MOCK_TEST_TIMEOUT", message: "Mock test timed out after 30s" },
          });
        } else if (err instanceof SyntaxError) {
          dispatch({
            type: "ADD_ERROR",
            error: { code: "MOCK_JSON_INVALID", message: "Invalid mock response JSON" },
          });
        } else {
          const message = err instanceof Error ? err.message : "Mock test failed";
          dispatch({
            type: "ADD_ERROR",
            error: { code: "MOCK_TEST_ERROR", message, details: err },
          });
        }
        dispatch({ type: "SET_STATUS", status: "error" });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [dispatch, schema, selectedProviderId],
  );

  return { runMockTest };
}
