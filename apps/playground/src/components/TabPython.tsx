import { useAppState } from "../context";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { useI18n } from "../i18n/context";

function extractPythonCode(result: unknown): string {
  if (!result) return "";
  const r = result as Record<string, unknown>;
  if (typeof r.python_code === "string") return r.python_code;
  if (r.sdk && typeof (r.sdk as Record<string, unknown>).python === "string") {
    return (r.sdk as Record<string, unknown>).python as string;
  }
  // Fallback: show the full result as a representation
  return JSON.stringify(result, null, 2);
}

export default function TabPython() {
  const { t } = useI18n();
  const { sdkPreviewCode, sdkPreviewLoading, negotiationResult } = useAppState();

  if (sdkPreviewLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        {t("sdkPreview.generating")}
      </div>
    );
  }

  if (sdkPreviewCode) {
    return (
      <div className="h-full">
        <CodeMirror
          value={sdkPreviewCode}
          extensions={[python()]}
          theme="dark"
          editable={false}
          basicSetup={false}
        />
      </div>
    );
  }

  if (!negotiationResult) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        {t("sdkPreview.empty")}
      </div>
    );
  }

  const pyCode = extractPythonCode(negotiationResult);

  return (
    <div className="h-full">
      <CodeMirror
        value={pyCode}
        extensions={[python()]}
        theme="dark"
        editable={false}
        basicSetup={false}
      />
    </div>
  );
}
