import { useAppState } from "../context";

interface ActionBarProps {
  onNegotiate: () => void;
  onExecute: () => void;
}

export default function ActionBar({ onNegotiate, onExecute }: ActionBarProps) {
  const { schemaValid, selectedProviderId, status, negotiationResult, timing } = useAppState();

  const isNegotiating = status === "negotiating";
  const isExecuting = status === "executing";

  const negotiateDisabled = !schemaValid || !selectedProviderId || isNegotiating || isExecuting;
  const executeDisabled = !negotiationResult || isExecuting || isNegotiating;
  const mockTestDisabled = !schemaValid;

  // Disabled reason strings for tooltip display (D-15-09)
  const negotiateDisabledReason = !schemaValid
    ? "Schema is invalid -- fix JSON errors first"
    : !selectedProviderId
      ? "No provider selected -- choose a provider from the left panel"
      : isNegotiating
        ? "Negotiation already in progress"
        : isExecuting
          ? "Cannot negotiate while executing"
          : "";

  const executeDisabledReason = !negotiationResult
    ? "No negotiation result -- negotiate first"
    : isExecuting
      ? "Execution already in progress"
      : isNegotiating
        ? "Cannot execute while negotiating"
        : "";

  const mockTestDisabledReason = !schemaValid
    ? "Schema is invalid -- fix JSON errors first"
    : "";

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-700/50">
      {/* Negotiate button */}
      <button
        disabled={negotiateDisabled}
        onClick={onNegotiate}
        title={negotiateDisabled ? negotiateDisabledReason : "Negotiate schema with selected provider"}
        aria-label={negotiateDisabled ? negotiateDisabledReason : "Negotiate schema with selected provider"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !negotiateDisabled
            ? "bg-emerald-500 text-white hover:bg-emerald-400"
            : "bg-zinc-700 text-zinc-500"
        }`}
      >
        {isNegotiating && (
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
        {isNegotiating ? "Negotiating..." : "Negotiate"}
        {!isNegotiating && <kbd className="ml-1">{"⌘↩"}</kbd>}
      </button>

      {/* Execute button */}
      <button
        disabled={executeDisabled}
        onClick={onExecute}
        title={executeDisabled ? executeDisabledReason : "Execute the negotiated request"}
        aria-label={executeDisabled ? executeDisabledReason : "Execute the negotiated request"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !executeDisabled
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            : "opacity-50"
        }`}
      >
        {isExecuting && (
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
        {isExecuting ? "Executing..." : "Execute"}
        {!isExecuting && <kbd className="ml-1">{"⌘⇧⏎"}</kbd>}
      </button>

      {/* Mock Test button */}
      <button
        disabled={mockTestDisabled}
        title={mockTestDisabled ? mockTestDisabledReason : "Run mock test against the schema"}
        aria-label={mockTestDisabled ? mockTestDisabledReason : "Run mock test against the schema"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !mockTestDisabled
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            : "opacity-50"
        }`}
      >
        Mock Test
      </button>

      {/* Timing display */}
      {timing.negotiate !== undefined && (
        <span className="text-xs text-zinc-500 ml-auto">
          {`Negotiate: ${(timing.negotiate / 1000).toFixed(2)}s`}
        </span>
      )}
    </div>
  );
}
