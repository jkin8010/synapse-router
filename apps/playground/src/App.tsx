import { AppProvider } from "./context";
import { ResizablePanel } from "./components/ResizablePanel";
import { StatusBar } from "./components/StatusBar";

export default function App() {
  return (
    <AppProvider>
      <div className="h-screen grid" style={{ gridTemplateColumns: "240px 4px 1fr 4px 320px" }}>
        <div className="bg-gray-950 p-4 text-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">PROVIDERS</p>
        </div>
        <ResizablePanel side="left" />
        <div className="bg-gray-950 p-4 text-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SCHEMA EDITOR</p>
        </div>
        <ResizablePanel side="right" />
        <div className="bg-gray-950 p-4 text-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">RESPONSE</p>
        </div>
      </div>
      <StatusBar />
    </AppProvider>
  );
}
