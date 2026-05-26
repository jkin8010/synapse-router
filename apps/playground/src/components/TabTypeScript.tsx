import { useAppState } from "../context";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { useI18n } from "../i18n/context";

function extractTypeScriptCode(result: unknown): string {
  if (!result) return "";
  const r = result as Record<string, unknown>;
  if (typeof r.typescript_code === "string") return r.typescript_code;
  if (r.sdk && typeof (r.sdk as Record<string, unknown>).typescript === "string") {
    return (r.sdk as Record<string, unknown>).typescript as string;
  }
  // Fallback: show the full result as a representation
  return JSON.stringify(result, null, 2);
}

export default function TabTypeScript() {
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
          extensions={[javascript({ typescript: true })]}
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

  const tsCode = extractTypeScriptCode(negotiationResult);

  return (
    <div className="h-full">
      <CodeMirror
        value={tsCode}
        extensions={[javascript({ typescript: true })]}
        theme="dark"
        editable={false}
        basicSetup={false}
      />
    </div>
  );
}
