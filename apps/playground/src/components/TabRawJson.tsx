import { useAppState } from "../context";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";

export default function TabRawJson() {
  const { negotiationResult } = useAppState();

  if (!negotiationResult) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No response yet. Run Negotiate or Execute to see results.
      </div>
    );
  }

  return (
    <div className="h-full">
      <CodeMirror
        value={JSON.stringify(negotiationResult, null, 2)}
        extensions={[json()]}
        theme="dark"
        editable={false}
        basicSetup={false}
      />
    </div>
  );
}
