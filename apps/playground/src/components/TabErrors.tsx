import { useAppState } from "../context";

export default function TabErrors() {
  const { errors } = useAppState();

  // This component is only rendered when errors.length > 0 (condition in ResponseViewer)
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {errors.map((err, idx) => (
        <div
          key={idx}
          className="bg-red-900/20 border border-red-800/50 rounded-lg p-3"
        >
          <div className="text-xs font-mono text-red-400 mb-1">
            {err.code}
          </div>
          <div className="text-sm text-zinc-200 mb-1">
            {err.message}
          </div>
          {err.details != null && (
            <pre className="text-xs text-zinc-400 mt-1 overflow-auto max-h-[100px]">
              {typeof err.details === "string"
                ? err.details
                : JSON.stringify(err.details, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
