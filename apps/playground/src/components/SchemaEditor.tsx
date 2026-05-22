import { useRef, useCallback } from "react";
import { useAppState, useDispatch } from "../context";
import { useCodeMirror } from "../hooks/useCodeMirror";

function tryParseJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export default function SchemaEditor() {
  const { schema, status } = useAppState();
  const dispatch = useDispatch();
  const divRef = useRef<HTMLDivElement>(null);

  const { setValue } = useCodeMirror({
    container: divRef.current,
    value: schema,
    onChange: (value) =>
      dispatch({ type: "UPDATE_SCHEMA", schema: value, valid: tryParseJSON(value) }),
    editable: status !== "negotiating",
  });

  const handleLoad = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setValue(content);
        dispatch({ type: "UPDATE_SCHEMA", schema: content, valid: tryParseJSON(content) });
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setValue, dispatch]);

  const handleSave = useCallback(() => {
    const blob = new Blob([schema], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-schema.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [schema]);

  const handleClear = useCallback(() => {
    setValue("");
    dispatch({ type: "UPDATE_SCHEMA", schema: "", valid: false });
  }, [setValue, dispatch]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          SCHEMA EDITOR
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleLoad}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            [Load]
          </button>
          <button
            onClick={handleSave}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            [Save]
          </button>
          <button
            onClick={handleClear}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            [Clear]
          </button>
        </div>
      </div>

      {/* Editor container */}
      <div className="flex-1 overflow-hidden relative min-h-[300px]">
        <div ref={divRef} className="h-full w-full" />

        {/* Loading overlay */}
        {status === "negotiating" && (
          <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <svg
                className="animate-spin h-4 w-4 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
