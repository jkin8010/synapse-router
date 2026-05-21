import { useEffect } from "react";

export interface UseKeyboardShortcutOptions {
  /** Key value from KeyboardEvent.key (e.g., "Enter", "Escape", "k") */
  key: string;
  /** Require Meta (Cmd on Mac) or Ctrl (on Windows/Linux). Default false. */
  metaKey?: boolean;
  /** Require Ctrl key. Use metaKey instead for cross-platform Cmd/Ctrl. Default false. */
  ctrlKey?: boolean;
  /** Require Shift key. Default false. */
  shiftKey?: boolean;
  /** Require Alt key. Default false. */
  altKey?: boolean;
  /** Callback to fire when key combination matches */
  handler: () => void;
  /** Whether the shortcut is currently active. Default true. */
  enabled?: boolean;
}

/**
 * Register a global keyboard shortcut.
 *
 * - Cross-platform: metaKey matches both e.metaKey AND e.ctrlKey
 * - ctrlKey matches ONLY e.ctrlKey (use metaKey for Cmd/Ctrl)
 * - Calls e.preventDefault() when matched
 * - Cleans up listener on unmount or when enabled changes
 * - When enabled=false, handler is not invoked and listener is removed
 */
export default function useKeyboardShortcut({
  key,
  metaKey = false,
  ctrlKey = false,
  shiftKey = false,
  altKey = false,
  handler,
  enabled = true,
}: UseKeyboardShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if target is an input, textarea, or contenteditable element
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        target.isContentEditable
      ) {
        return;
      }

      const metaMatch = metaKey ? (e.metaKey || e.ctrlKey) : true;
      const ctrlMatch = ctrlKey ? e.ctrlKey : true;
      const shiftMatch = shiftKey ? e.shiftKey : true;
      const altMatch = altKey ? e.altKey : true;

      if (
        e.key === key &&
        metaMatch &&
        ctrlMatch &&
        shiftMatch &&
        altMatch
      ) {
        e.preventDefault();
        handler();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [key, metaKey, ctrlKey, shiftKey, altKey, handler, enabled]);
}
