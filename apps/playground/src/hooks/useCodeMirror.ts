import { useEffect, useRef, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { lintGutter, linter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";

export function useCodeMirror(options: {
  container: HTMLDivElement | null;
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
}) {
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!options.container) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange?.(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: options.value,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        EditorView.editable.of(options.editable ?? true),
        updateListener,
        EditorView.theme({
          "&": { backgroundColor: "transparent", height: "100%" },
          ".cm-scroller": {
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontSize: "13px",
          },
          ".cm-activeLine": { backgroundColor: "rgba(59, 130, 246, 0.05)" },
          ".cm-cursor": { borderLeftColor: "#60a5fa" },
          ".cm-selectionBackground": { backgroundColor: "rgba(59, 130, 246, 0.2)" },
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: options.container });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [options.container, options.editable]); // NOT options.value -- prevents re-creation on every keystroke

  const setValue = useCallback((newValue: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newValue },
    });
  }, []);

  return { view: viewRef, setValue };
}
