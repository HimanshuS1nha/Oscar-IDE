import { useEffect, useState } from "react";

import type { WindowState } from "../../electron/shared/window-state";

const INITIAL_STATE: WindowState = {
  isMaximized: false,
  isFullScreen: false,
  isFocused: true,
};

export const useWindowState = () => {
  const [state, setState] = useState<WindowState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;

    window.electron.window.getState().then((initial) => {
      if (active && initial) setState(initial);
    });

    const unsubscribe = window.electron.window.onStateChange(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
};
