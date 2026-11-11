import { useEffect, useRef } from "react";

import {
  attachTerminalSession,
  fitTerminalSession,
} from "@/lib/terminal-sessions";

/** Shows terminal `id` and keeps it sized to the available space. */
const TerminalView = ({ id }: { id: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const detach = attachTerminalSession(id, container);

    // Refit once per frame while the panel or window is being resized.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitTerminalSession(id));
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      detach();
    };
  }, [id]);

  return <div ref={containerRef} className="h-full w-full" />;
};

export default TerminalView;
