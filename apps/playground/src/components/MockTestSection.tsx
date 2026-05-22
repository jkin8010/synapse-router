import { useState, useCallback } from "react";
import { useAppState } from "../context";
import { useCodeMirror } from "../hooks/useCodeMirror";
import useMockTest from "../hooks/useMockTest";
import { useI18n } from "../i18n/context";

const DEFAULT_MOCK_TEMPLATE = JSON.stringify(
  {
    choices: [{ message: { content: "" } }],
  },
  null,
  2,
);

export default function MockTestSection() {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const [mockValue, setMockValue] = useState(DEFAULT_MOCK_TEMPLATE);
  const [editorContainer, setEditorContainer] = useState<HTMLDivElement | null>(null);

  const { schema, mockTestResult, status } = useAppState();
  const { runMockTest } = useMockTest();

  // Use a callback ref to capture the editor container after it mounts
  const editorRef = useCallback((node: HTMLDivElement | null) => {
    setEditorContainer(node);
  }, []);

  // Initialize CodeMirror editor for mock response
  useCodeMirror({
    container: editorContainer,
    value: mockValue,
    onChange: (val) => setMockValue(val),
    editable: status !== "mock-testing",
  });

  const isTesting = status === "mock-testing";
  const mockDisabled = !schema || isTesting;

  const handleRunMockTest = async () => {
    if (mockDisabled) return;
    await runMockTest(mockValue);
  };

  const result = mockTestResult;

  return (
    <div className="border-t border-zinc-700/50">
      {/* Header row - clickable to toggle */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-800/50 transition-colors duration-150"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          {t("mockTest.title")}
        </span>
        <span className="text-xs text-zinc-500 select-none">
          {isExpanded ? "[-]" : "[+]"}
        </span>
      </div>

      {/* Content (when expanded) */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Mock Response Editor */}
          <div
            ref={editorRef}
            className="min-h-[150px] border border-zinc-700 rounded-lg overflow-hidden"
          />

          {/* Run Mock Test button */}
          <button
            disabled={mockDisabled}
            onClick={handleRunMockTest}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
              !mockDisabled
                ? "bg-emerald-500 text-white hover:bg-emerald-400"
                : "bg-zinc-700 text-zinc-500"
            }`}
          >
            {isTesting && (
              <svg
                className="animate-spin h-4 w-4 text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isTesting ? t("action.testing") : t("action.runMock")}
          </button>

          {/* Results area */}
          {result && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-1">
              {/* Pass/Fail */}
              {result.passed ? (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {t("mockTest.result.passed")}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  {t("mockTest.result.failed")}
                </div>
              )}

              {/* Expected fields */}
              <div className="text-zinc-400 text-xs">
                {t("mockTest.expected")}: {result.expected.length > 0
                  ? result.expected.join(", ")
                  : "-"}
              </div>

              {/* Got fields */}
              <div className="text-zinc-300 text-xs">
                {t("mockTest.got")}: {result.got.length > 0
                  ? result.got.join(", ")
                  : "-"}
              </div>

              {/* Field coverage */}
              <div className="text-zinc-400 text-xs">
                {t("mockTest.fieldsMapped")}: {result.fieldCoverage}
              </div>

              {/* Missing fields */}
              {result.missingFields.length > 0 && (
                <div className="text-red-400 text-xs">
                  {t("mockTest.missing")}: {result.missingFields.join(", ")}
                </div>
              )}

              {/* Extra fields */}
              {result.extraFields.length > 0 && (
                <div className="text-yellow-400 text-xs">
                  {t("mockTest.extra")}: {result.extraFields.join(", ")}
                </div>
              )}

              {/* Type mismatches */}
              {result.typeMismatches.length > 0 && (
                <div className="text-red-400 text-xs">
                  {t("mockTest.typeMismatches")}: {result.typeMismatches.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
