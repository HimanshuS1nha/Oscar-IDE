import { getPlatform } from "@/helpers/get-platform";
import { useWindowState } from "@/hooks/use-window-state";

import LinuxWindowControls from "./linux-window-controls";
import MacWindowControls from "./mac-window-controls";
import WindowsWindowControls from "./windows-window-controls";

export type WindowControlsProps = {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  className?: string;
};

type Props = {
  className?: string;
};

/**
 * Close / minimize / maximize buttons drawn to match the host platform.
 * macOS: traffic lights (render on the left). Windows: Fluent caption
 * buttons (flush top-right). Linux: Adwaita-style round buttons.
 */
const WindowControls = ({ className }: Props) => {
  const state = useWindowState();
  const platform = getPlatform();

  const props: WindowControlsProps = {
    ...state,
    className,
    onClose: () => window.electron.window.close(),
    onMinimize: () => window.electron.window.minimize(),
    onMaximize: () => window.electron.window.maximize(),
  };

  switch (platform) {
    case "darwin":
      return <MacWindowControls {...props} />;
    case "win32":
      return <WindowsWindowControls {...props} />;
    default:
      return <LinuxWindowControls {...props} />;
  }
};

export default WindowControls;
