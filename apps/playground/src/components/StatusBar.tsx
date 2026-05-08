import { useAppState } from "../context";

export default function StatusBar() {
  const { status, selectedProviderId, schemaValid } = useAppState();

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
      <div>Provider: {selectedProviderId || "-"}</div>
      <div>
        Schema: {schemaValid ? "valid" : "invalid"} | v0.1.0
      </div>
    </div>
  );
}
