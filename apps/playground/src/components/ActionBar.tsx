import { useAppState } from "../context";
import useNegotiate from "../hooks/useNegotiate";
import useExecute from "../hooks/useExecute";

export default function ActionBar() {
  const { schema, schemaValid, selectedProviderId, status, negotiationResult, timing } = useAppState();
  const { negotiate } = useNegotiate();
  const { execute } = useExecute();

  const isNegotiating = status === "negotiating";
  const isExecuting = status === "executing";

  const negotiateDisabled = !schemaValid || !selectedProviderId || isNegotiating || isExecuting;
  const executeDisabled = !negotiationResult || isExecuting || isNegotiating;
  const mockTestDisabled = !schemaValid;

  const handleNegotiate = () => {
    if (negotiateDisabled) return;
    negotiate(schema, selectedProviderId!);
  };

  const handleExecute = () => {
    if (executeDisabled) return;
    execute(selectedProviderId!);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700/50">
      {/* Negotiate button */}
      <button
        disabled={negotiateDisabled}
        onClick={handleNegotiate}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !negotiateDisabled
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "bg-gray-700 text-gray-500"
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
      </button>

      {/* Execute button */}
      <button
        disabled={executeDisabled}
        onClick={handleExecute}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !executeDisabled
            ? "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100"
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
      </button>

      {/* Mock Test button */}
      <button
        disabled={mockTestDisabled}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
          !mockTestDisabled
            ? "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100"
            : "opacity-50"
        }`}
      >
        Mock Test
      </button>

      {/* Timing display */}
      {timing.negotiate !== undefined && (
        <span className="text-xs text-gray-500 ml-auto">
          {`Negotiate: ${(timing.negotiate / 1000).toFixed(2)}s`}
        </span>
      )}
    </div>
  );
}
