import { useEffect, useState, useCallback } from "react";
import { useAppState, useDispatch } from "../context";
import ProviderCard from "./ProviderCard";
import { createApiClient } from "../lib/api";

export default function ProviderSelector() {
  const { providers, selectedProviderId, selectedBaseUrl } = useAppState();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleSelect = (providerId: string) => {
    dispatch({ type: "SELECT_PROVIDER", providerId });
    dispatch({ type: "SET_BASE_URL", baseUrl: null });
  };

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          PROVIDERS
        </span>
        <div className="flex items-center gap-2">
          <button className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
          <button
            onClick={fetchProviders}
            className="text-gray-400 hover:text-gray-100"
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
            <label className="text-xs text-gray-500 shrink-0">URL:</label>
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
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300
                         focus:border-blue-500 focus:outline-none placeholder-gray-600"
            />
            {selectedBaseUrl && (
              <button
                onClick={() => dispatch({ type: "SET_BASE_URL", baseUrl: null })}
                className="text-gray-500 hover:text-gray-300 shrink-0"
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
          <p className="text-xs text-gray-600 mt-1">
            Override the default base URL for this provider
          </p>
        </div>
      )}

      {/* Content */}
      <div className="overflow-y-auto flex-1 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-800 rounded-lg h-16" />
          ))
        ) : error ? (
          <div className="text-sm text-red-400 p-2">
            Error: {error}
            <button
              onClick={fetchProviders}
              className="block mt-2 text-blue-400 hover:text-blue-300"
            >
              Retry
            </button>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-sm text-gray-400 p-2">
            No providers found.{" "}
            <a href="#" className="text-blue-400 hover:text-blue-300">
              How to add a pack
            </a>
          </div>
        ) : (
          providers.map((provider) => (
            <ProviderCard
              key={provider.provider.id}
              card={provider}
              isSelected={selectedProviderId === provider.provider.id}
              isConfigured={true}
              onSelect={() => handleSelect(provider.provider.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
