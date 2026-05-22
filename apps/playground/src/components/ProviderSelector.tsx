import { useEffect, useState, useCallback } from "react";
import { useAppState, useDispatch } from "../context";
import ProviderCard from "./ProviderCard";
import Dialog from "./Dialog";
import { createApiClient } from "../lib/api";

interface ProviderSelectorProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ProviderSelector({ collapsed = false, onToggleCollapse }: ProviderSelectorProps) {
  const { providers, selectedProviderId, selectedBaseUrl } = useAppState();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [packSearch, setPackSearch] = useState("");
  const [packResults, setPackResults] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [packSearchLoading, setPackSearchLoading] = useState(false);
  const [packInstallStatus, setPackInstallStatus] = useState<Record<string, "idle" | "installing" | "installed" | "error">>({});

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = createApiClient();
      const data = await api.getProviders();
      dispatch({ type: "SET_PROVIDERS", providers: data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch providers";
      setError(message);
      dispatch({
        type: "ADD_ERROR",
        error: { code: "FETCH_PROVIDERS_ERROR", message },
      });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Debounced pack search (300ms)
  useEffect(() => {
    if (!packDialogOpen || packSearch.trim().length === 0) {
      setPackResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setPackSearchLoading(true);
      try {
        const api = createApiClient();
        const results = await api.searchPacks(packSearch.trim());
        setPackResults(Array.isArray(results) ? results : []);
      } catch {
        // Static placeholder list when API endpoint is not available (D-15-06)
        setPackResults([
          { id: "openai", name: "OpenAI", description: "GPT-4, GPT-4o, DALL-E" },
          { id: "deepseek", name: "DeepSeek", description: "DeepSeek-V3, DeepSeek-R1" },
          { id: "stability", name: "Stability AI", description: "Stable Diffusion, SDXL" },
          { id: "replicate", name: "Replicate", description: "Run open-source models" },
        ]);
      } finally {
        setPackSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [packSearch, packDialogOpen]);

  const handleSelect = (providerId: string) => {
    dispatch({ type: "SELECT_PROVIDER", providerId });
    dispatch({ type: "SET_BASE_URL", baseUrl: null });
  };

  const handleInstallPack = async (packId: string) => {
    setPackInstallStatus((prev) => ({ ...prev, [packId]: "installing" }));
    try {
      const api = createApiClient();
      await api.installPack(packId);
      setPackInstallStatus((prev) => ({ ...prev, [packId]: "installed" }));
      // Refresh provider list and close dialog after short delay
      await fetchProviders();
      setTimeout(() => {
        setPackDialogOpen(false);
        setPackSearch("");
        setPackResults([]);
        setPackInstallStatus({});
      }, 800);
    } catch {
      setPackInstallStatus((prev) => ({ ...prev, [packId]: "error" }));
    }
  };

  return (
    <div className="h-full flex flex-col gap-2">
      {collapsed ? (
        /* Collapsed: 48px-wide vertical bar with dot indicators (D-15-03, D-15-04) */
        <div className="h-full flex flex-col items-center gap-1.5 py-2 playground-sidebar-collapsed">
          {/* Expand toggle */}
          <button
            onClick={onToggleCollapse}
            className="text-zinc-400 hover:text-zinc-200 p-1"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Provider dot indicators (D-15-04: bg-emerald-400 selected, bg-zinc-500 others) */}
          <div className="flex flex-col items-center gap-2 flex-1 overflow-y-auto py-1">
            {providers.map((p) => (
              <button
                key={p.provider.id}
                onClick={() => {
                  dispatch({ type: "SELECT_PROVIDER", providerId: p.provider.id });
                  dispatch({ type: "SET_BASE_URL", baseUrl: null });
                  onToggleCollapse?.();
                }}
                title={p.provider.name}
                className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-150 ${
                  selectedProviderId === p.provider.id ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
            ))}
          </div>

          {/* Add button at the bottom of collapsed bar */}
          <button
            onClick={() => setPackDialogOpen(true)}
            className="text-zinc-400 hover:text-emerald-400 p-1"
            title="Add Provider Pack"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              PROVIDERS
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPackDialogOpen(true)}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                + Add
              </button>
              <button
                onClick={fetchProviders}
                className="text-zinc-400 hover:text-zinc-100"
                title="Refresh providers"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Base URL override -- shown when a provider is selected */}
          {selectedProviderId && (
            <div className="px-0 pb-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-zinc-500 shrink-0">URL:</label>
                <input
                  type="text"
                  value={selectedBaseUrl ?? ""}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    dispatch({ type: "SET_BASE_URL", baseUrl: val || null });
                  }}
                  placeholder={
                    providers.find((p) => p.provider.id === selectedProviderId)?.service?.base_url ??
                    "https://api.example.com/v1"
                  }
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300
                             focus:border-emerald-400 focus:outline-none placeholder-zinc-600"
                />
                {selectedBaseUrl && (
                  <button
                    onClick={() => dispatch({ type: "SET_BASE_URL", baseUrl: null })}
                    className="text-zinc-500 hover:text-zinc-300 shrink-0"
                    title="Reset to default"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-600 mt-1">
                Override the default base URL for this provider
              </p>
            </div>
          )}

          {/* Content */}
          <div className="overflow-y-auto flex-1 space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse bg-zinc-800 rounded-lg h-16" />
              ))
            ) : error ? (
              <div className="text-sm text-red-400 p-2">
                Error: {error}
                <button
                  onClick={fetchProviders}
                  className="block mt-2 text-emerald-400 hover:text-emerald-300"
                >
                  Retry
                </button>
              </div>
            ) : providers.length === 0 ? (
              <div className="text-sm text-zinc-400 p-2">
                No providers found.{" "}
                <a href="#" className="text-emerald-400 hover:text-emerald-300">
                  How to add a pack
                </a>
              </div>
            ) : (
              providers.map((provider) => (
                <ProviderCard
                  key={provider.provider.id}
                  card={provider}
                  isSelected={selectedProviderId === provider.provider.id}
                  isConfigured={provider.configured ?? false}
                  onSelect={() => handleSelect(provider.provider.id)}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Add Pack Dialog (rendered regardless of collapsed state) */}
      <Dialog isOpen={packDialogOpen} onClose={() => { setPackDialogOpen(false); setPackSearch(""); setPackResults([]); }}>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-zinc-100 mb-3">Add Provider Pack</h2>

          <input
            type="text"
            value={packSearch}
            onChange={(e) => setPackSearch(e.target.value)}
            placeholder="Search packs..."
            autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200
                       focus:border-emerald-400 focus:outline-none placeholder-zinc-500 mb-3"
          />

          <div className="max-h-64 overflow-y-auto space-y-2">
            {packSearchLoading ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Searching...</p>
            ) : packResults.length === 0 ? (
              packSearch.trim() ? (
                <p className="text-xs text-zinc-500 py-4 text-center">No packs found</p>
              ) : (
                <p className="text-xs text-zinc-500 py-4 text-center">Type to search for packs</p>
              )
            ) : (
              packResults.map((pack) => {
                const status = packInstallStatus[pack.id] || "idle";
                return (
                  <div key={pack.id} className="flex items-center justify-between bg-zinc-800 rounded-lg p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{pack.name}</p>
                      {pack.description && (
                        <p className="text-xs text-zinc-500 truncate">{pack.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleInstallPack(pack.id)}
                      disabled={status === "installing" || status === "installed"}
                      className={`ml-2 shrink-0 px-3 py-1 rounded text-xs font-medium transition-colors duration-150 ${
                        status === "installed"
                          ? "bg-green-800 text-green-300 cursor-default"
                          : status === "error"
                            ? "bg-red-800 text-red-300 hover:bg-red-700"
                            : "bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50"
                      }`}
                    >
                      {status === "installing" ? "Installing..." : status === "installed" ? "Installed" : status === "error" ? "Retry" : "Install"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
