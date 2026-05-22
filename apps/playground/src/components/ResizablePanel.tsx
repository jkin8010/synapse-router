import { useCallback, useRef } from "react";

interface ResizablePanelProps {
  side: "left" | "right";
  onResize?: (side: "left" | "right", width: number) => void;
}

export default function ResizablePanel({ side, onResize }: ResizablePanelProps) {
  const isDragging = useRef<"left" | "right" | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = side;
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDragging.current === "left") {
          const width = Math.max(200, Math.min(400, moveEvent.clientX));
          onResize?.("left", width);
        } else if (isDragging.current === "right") {
          const width = Math.max(280, Math.min(500, window.innerWidth - moveEvent.clientX));
          onResize?.("right", width);
        }
      };

      const handleMouseUp = () => {
        isDragging.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [side, onResize],
  );

  return (
    <div
      className="cursor-col-resize bg-zinc-800 hover:bg-emerald-500/20 transition-colors duration-150"
      style={{ width: "4px", height: "100%" }}
      onMouseDown={handleMouseDown}
    />
  );
}
