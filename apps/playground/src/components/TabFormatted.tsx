import { useAppState } from "../context";

export default function TabFormatted() {
  const { negotiationResult } = useAppState();

  if (!negotiationResult) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No response yet. Run Negotiate or Execute to see results.
      </div>
    );
  }

  const accepted = negotiationResult.accepted ?? [];
  const rejected = negotiationResult.rejected ?? [];

  return (
    <div className="space-y-4">
      {/* Accepted matches */}
      {accepted.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">
            Accepted ({accepted.length})
          </h4>
          <div className="space-y-2">
            {accepted.map((match: unknown, idx: number) => {
              const m = match as Record<string, unknown>;
              return (
                <div
                  key={idx}
                  className="bg-gray-850 border border-green-800/50 rounded-lg p-3"
                >
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-sm min-w-[120px]">Feature</span>
                    <span className="text-gray-100 text-sm">
                      {String(m.feature_name ?? m.feature_id ?? "-")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-sm min-w-[120px]">Intent</span>
                    <span className="text-gray-100 text-sm">
                      {String(m.intent ?? "-")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-sm min-w-[120px]">Status</span>
                    <span className="text-green-400 text-sm">accepted</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rejected matches */}
      {rejected.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
            Rejected ({rejected.length})
          </h4>
          <div className="space-y-2">
            {rejected.map((match: unknown, idx: number) => {
              const m = match as Record<string, unknown>;
              return (
                <div
                  key={idx}
                  className="bg-gray-850 border border-red-800/50 rounded-lg p-3"
                >
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-sm min-w-[120px]">Feature</span>
                    <span className="text-gray-100 text-sm">
                      {String(m.feature_name ?? m.feature_id ?? "-")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-sm min-w-[120px]">Intent</span>
                    <span className="text-gray-100 text-sm">
                      {String(m.intent ?? "-")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-400 text-sm min-w-[120px]">Reason</span>
                    <span className="text-red-400 text-sm">
                      {String(m.reason ?? m.error ?? "-")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {accepted.length === 0 && rejected.length === 0 && (
        <div className="text-gray-500 text-sm">
          No matches found in negotiation result.
        </div>
      )}
    </div>
  );
}
