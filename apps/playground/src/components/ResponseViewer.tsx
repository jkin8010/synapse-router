import { useAppState, useDispatch } from "../context";
import TabFormatted from "./TabFormatted";
import TabRawJson from "./TabRawJson";
import TabLogs from "./TabLogs";
import TabErrors from "./TabErrors";
import TabTypeScript from "./TabTypeScript";
import TabPython from "./TabPython";

interface TabDef {
  id: "formatted" | "raw" | "logs" | "errors" | "typescript" | "python";
  label: string;
}

const ALL_TABS: TabDef[] = [
  { id: "formatted", label: "Formatted" },
  { id: "raw", label: "Raw JSON" },
  { id: "logs", label: "Logs" },
  { id: "errors", label: "Errors" },
  { id: "typescript", label: "TypeScript SDK" },
  { id: "python", label: "Python SDK" },
];

export default function ResponseViewer() {
  const { activeTab, negotiationResult, errors, selectedProviderId, timing } = useAppState();
  const dispatch = useDispatch();

  // Conditionally include errors tab only when errors exist
  const visibleTabs = errors.length === 0
    ? ALL_TABS.filter((t) => t.id !== "errors")
    : ALL_TABS;

  const handleTabClick = (tabId: TabDef["id"]) => {
    dispatch({ type: "SET_ACTIVE_TAB", tab: tabId });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "formatted":
        return <TabFormatted />;
      case "raw":
        return <TabRawJson />;
      case "logs":
        return <TabLogs />;
      case "errors":
        return <TabErrors />;
      case "typescript":
        return <TabTypeScript />;
      case "python":
        return <TabPython />;
      default:
        return <TabFormatted />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider p-4 pb-0">
        RESPONSE
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-zinc-700 px-4 mt-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={
              activeTab === tab.id
                ? "text-emerald-400 border-b-2 border-emerald-400 px-3 py-2 text-xs font-medium cursor-pointer"
                : "text-zinc-400 hover:text-zinc-200 px-3 py-2 text-xs font-medium cursor-pointer"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3 max-h-[calc(100vh-200px)]">
        {renderTabContent()}
      </div>

      {/* Bottom info bar */}
      <div className="text-xs text-zinc-400 border-t border-zinc-700 p-2 flex gap-4">
        <span>Provider: {selectedProviderId || "-"}</span>
        <span>Status: {negotiationResult ? "200" : "-"}</span>
        <span>Duration: {timing.negotiate ? `${timing.negotiate}ms` : "-"}</span>
      </div>
    </div>
  );
}
