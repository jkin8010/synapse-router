import { useAppState } from "../context";

export default function TabLogs() {
  const { logs } = useAppState();

  if (!logs || logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No logs generated yet.
      </div>
    );
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false });
  };

  const levelClass = (level: string) => {
    switch (level) {
      case "info":
        return "text-blue-400";
      case "warn":
        return "text-yellow-400";
      case "error":
        return "text-red-400";
      default:
        return "text-zinc-400";
    }
  };

  return (
    <div className="space-y-1 font-mono text-sm">
      {logs.map((entry, idx) => (
        <div key={idx} className="flex gap-2">
          <span className="text-xs text-zinc-500 shrink-0">
            {formatTime(entry.timestamp)}
          </span>
          <span className={`${levelClass(entry.level)} shrink-0`}>
            [{entry.level.toUpperCase()}]
          </span>
          <span className="text-zinc-300 break-words">
            {entry.message}
          </span>
        </div>
      ))}
    </div>
  );
}
