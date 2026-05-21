import { useAppState } from "../context";

export default function StatusBar() {
  const { status, selectedProviderId, schemaValid, providers } = useAppState();
  const configuredCount = providers.filter((p) => p.configured).length;
  const totalCount = providers.length;
  const selectedProvider = providers.find((p) => p.provider.id === selectedProviderId);

  const statusDot = () => {
    switch (status) {
      case "idle":
        return { color: "bg-gray-400 text-gray-400", label: "Idle" };
      case "loading":
      case "negotiating":
      case "executing":
      case "mock-testing":
        return { color: "bg-blue-400 text-blue-400", label: status.charAt(0).toUpperCase() + status.slice(1) };
      case "error":
        return { color: "bg-red-400 text-red-400", label: "Error" };
      default:
        return { color: "bg-gray-400 text-gray-400", label: "Idle" };
    }
  };

  const dot = statusDot();
  const isActive = ["negotiating", "executing", "mock-testing", "loading"].includes(status);

  return (
    <div className="h-8 bg-gray-900 border-t border-gray-700/50 flex items-center justify-between px-4 text-xs text-gray-400">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full inline-block ${dot.color} ${isActive ? "animate-pulse" : ""}`}
        />
        <span className={dot.color}>{dot.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>Provider: {selectedProviderId || "-"}</span>
        {totalCount > 0 && (
          <span className="text-gray-500">
            ({configuredCount}/{totalCount} configured)
          </span>
        )}
        {selectedProvider && !selectedProvider.configured && (
          <span title="Selected provider has no API key configured -- add one via CLI or vault" className="text-yellow-400">
            <svg className="w-3.5 h-3.5 inline" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </span>
        )}
      </div>
      <div>
        Schema: {schemaValid ? "valid" : "invalid"} | v0.1.0
      </div>
    </div>
  );
}
