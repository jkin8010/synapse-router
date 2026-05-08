import { useState, useCallback, useRef } from "react";
import { AppProvider } from "./context";
import ProviderSelector from "./components/ProviderSelector";
import SchemaEditor from "./components/SchemaEditor";
import ActionBar from "./components/ActionBar";
import MockTestSection from "./components/MockTestSection";
import ResponseViewer from "./components/ResponseViewer";
import StatusBar from "./components/StatusBar";

export default function App() {
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const isDragging = useRef<"left" | "right" | null>(null);

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

  return (
    <AppProvider>
      <div className="h-screen flex flex-col">
        <div
          className="flex-1 grid"
          style={{
            gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px`,
          }}
        >
          {/* LEFT PANEL: Provider Selector */}
          <div className="bg-gray-950 overflow-hidden">
            <ProviderSelector />
          </div>

          {/* LEFT DIVIDER */}
          <div
            className="cursor-col-resize bg-gray-800 hover:bg-blue-500/30 transition-colors duration-150"
            onMouseDown={handleDividerMouseDown("left")}
          />

          {/* CENTER PANEL: Schema Editor + Action Bar + Mock Test */}
          <div className="bg-gray-950 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              <SchemaEditor />
            </div>
            <ActionBar />
            <MockTestSection />
          </div>

          {/* RIGHT DIVIDER */}
          <div
            className="cursor-col-resize bg-gray-800 hover:bg-blue-500/30 transition-colors duration-150"
            onMouseDown={handleDividerMouseDown("right")}
          />

          {/* RIGHT PANEL: Response Viewer */}
          <div className="bg-gray-950 overflow-hidden">
            <ResponseViewer />
          </div>
        </div>

        <StatusBar />
      </div>
    </AppProvider>
  );
}
