import { useState, useCallback, useRef } from "react";
import { AppProvider, useAppState, useDispatch } from "./context";
import useKeyboardShortcut from "./hooks/useKeyboardShortcut";
import useNegotiate from "./hooks/useNegotiate";
import useExecute from "./hooks/useExecute";
import ProviderSelector from "./components/ProviderSelector";
import SchemaEditor from "./components/SchemaEditor";
import ActionBar from "./components/ActionBar";
import MockTestSection from "./components/MockTestSection";
import ResponseViewer from "./components/ResponseViewer";
import StatusBar from "./components/StatusBar";

/**
 * Inner component consuming AppState context (must be rendered inside AppProvider).
 */
function AppContent() {
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDragging = useRef<"left" | "right" | null>(null);

  // State for keyboard shortcut handlers
  const { schema, schemaValid, selectedProviderId, status, negotiationResult, activePanel } = useAppState();
  const { negotiate } = useNegotiate();
  const { execute } = useExecute();
  const dispatch = useDispatch();

  const isNegotiating = status === "negotiating";
  const isExecuting = status === "executing";
  const negotiateDisabled = !schemaValid || !selectedProviderId || isNegotiating || isExecuting;
  const executeDisabled = !negotiationResult || isExecuting || isNegotiating;

  const handleNegotiate = useCallback(() => {
    if (negotiateDisabled) return;
    negotiate(schema, selectedProviderId!);
  }, [negotiateDisabled, negotiate, schema, selectedProviderId]);

  const handleExecute = useCallback(() => {
    if (executeDisabled) return;
    execute(selectedProviderId!);
  }, [executeDisabled, execute, selectedProviderId]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current === "left") {
      setLeftWidth(Math.max(200, Math.min(400, e.clientX)));
    } else if (isDragging.current === "right") {
      setRightWidth(Math.max(280, Math.min(500, window.innerWidth - e.clientX)));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "";
  }, [handleMouseMove]);

  const handleDividerMouseDown = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = side;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Keyboard shortcuts
  useKeyboardShortcut({
    key: "Enter",
    metaKey: true,
    handler: handleNegotiate,
    enabled: !negotiateDisabled,
  });

  useKeyboardShortcut({
    key: "Enter",
    metaKey: true,
    shiftKey: true,
    handler: handleExecute,
    enabled: !executeDisabled,
  });

  return (
    <div className="h-screen flex flex-col">
      {/* Mobile Tab Bar -- visible only at <1024px via .playground-mobile-tabs */}
      <div className="hidden playground-mobile-tabs bg-zinc-900 border-b border-zinc-700/50">
        {(["providers", "schema", "response"] as const).map((panel) => (
          <button
            key={panel}
            onClick={() => dispatch({ type: "SET_ACTIVE_PANEL", panel })}
            className={`flex-1 py-2 text-xs font-medium transition-colors duration-150 ${
              activePanel === panel
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {panel === "providers" ? "Providers" : panel === "schema" ? "Schema" : "Response"}
          </button>
        ))}
      </div>

      <div
        className="flex-1 grid playground-grid"
        style={{
          gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px`,
        }}
      >
        {/* LEFT PANEL: Provider Selector */}
        <div className={`bg-zinc-950 overflow-hidden ${activePanel !== "providers" ? "playground-panel-hidden" : ""}`}>
          <ProviderSelector
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          />
        </div>

        {/* LEFT DIVIDER */}
        <div
          className="cursor-col-resize bg-zinc-800 hover:bg-emerald-500/20 transition-colors duration-150 playground-divider"
          onMouseDown={handleDividerMouseDown("left")}
        />

        {/* CENTER PANEL: Schema Editor + Action Bar + Mock Test */}
        <div className={`bg-zinc-950 overflow-hidden flex flex-col ${activePanel !== "schema" ? "playground-panel-hidden" : ""}`}>
          <div className="flex-1 overflow-auto">
            <SchemaEditor />
          </div>
          <ActionBar onNegotiate={handleNegotiate} onExecute={handleExecute} />
          <MockTestSection />
        </div>

        {/* RIGHT DIVIDER */}
        <div
          className="cursor-col-resize bg-zinc-800 hover:bg-emerald-500/20 transition-colors duration-150 playground-divider"
          onMouseDown={handleDividerMouseDown("right")}
        />

        {/* RIGHT PANEL: Response Viewer */}
        <div className={`bg-zinc-950 overflow-hidden ${activePanel !== "response" ? "playground-panel-hidden" : ""}`}>
          <ResponseViewer />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
