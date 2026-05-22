import { useAppState } from "../context";
import { useI18n } from "../i18n/context";

interface ActionBarProps {
  onNegotiate: () => void;
  onExecute: () => void;
}

export default function ActionBar({ onNegotiate, onExecute }: ActionBarProps) {
  const { t } = useI18n();
  const { schemaValid, selectedProviderId, status, negotiationResult, timing } = useAppState();

  const isNegotiating = status === "negotiating";
  const isExecuting = status === "executing";

  const negotiateDisabled = !schemaValid || !selectedProviderId || isNegotiating || isExecuting;
  const executeDisabled = !negotiationResult || isExecuting || isNegotiating;
  const mockTestDisabled = !schemaValid;

  // Disabled reason strings for tooltip display (D-15-09)
  const negotiateDisabledReason = !schemaValid
    ? t("negotiateDisabled.noSchema")
    : !selectedProviderId
      ? t("negotiateDisabled.noProvider")
      : isNegotiating
        ? t("negotiateDisabled.negotiating")
        : isExecuting
          ? t("negotiateDisabled.executing")
          : "";

  const executeDisabledReason = !negotiationResult
    ? t("executeDisabled.noResult")
    : isExecuting
      ? t("executeDisabled.executing")
      : isNegotiating
        ? t("executeDisabled.negotiating")
        : "";

  const mockTestDisabledReason = !schemaValid
    ? t("mockTestDisabled.noSchema")
    : "";

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-700/50">
      {/* Negotiate button */}
      <button
        disabled={negotiateDisabled}
        onClick={onNegotiate}
        title={negotiateDisabled ? negotiateDisabledReason : t("tooltip.negotiate")}
        aria-label={negotiateDisabled ? negotiateDisabledReason : t("tooltip.negotiate")}
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
        {isNegotiating ? t("action.negotiating") : t("action.negotiate")}
        {!isNegotiating && <kbd className="ml-1">{"⌘↩"}</kbd>}
      </button>

      {/* Execute button */}
      <button
        disabled={executeDisabled}
        onClick={onExecute}
        title={executeDisabled ? executeDisabledReason : t("tooltip.execute")}
        aria-label={executeDisabled ? executeDisabledReason : t("tooltip.execute")}
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
        {isExecuting ? t("action.executing") : t("action.execute")}
        {!isExecuting && <kbd className="ml-1">{"⌘⇧⏎"}</kbd>}
      </button>

      {/* Mock Test button */}
      <button
        disabled={mockTestDisabled}
        title={mockTestDisabled ? mockTestDisabledReason : t("tooltip.mockTest")}
        aria-label={mockTestDisabled ? mockTestDisabledReason : t("tooltip.mockTest")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !mockTestDisabled
            ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            : "opacity-50"
        }`}
      >
        {t("action.mockTest")}
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
