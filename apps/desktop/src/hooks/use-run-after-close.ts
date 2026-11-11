import { useRef } from "react";

/**
 * For menus and dialogs, which keep focus inside themselves while open: runs
 * the chosen action only once they have fully closed, so an action that
 * focuses something (the editor, an input) isn't undone by them.
 *
 * Spread `rootProps` on the Root and `popupProps` on the Popup (or Content).
 */
export const useRunAfterClose = () => {
  const pending = useRef<(() => void) | null>(null);
  const skipFocusRestore = useRef(false);

  return {
    /**
     * Runs `action` once closed. Pass `movesFocus` if it focuses something
     * itself, so focus isn't sent back to the trigger.
     */
    runAfterClose: (action: () => void, { movesFocus = false } = {}) => {
      pending.current = action;
      skipFocusRestore.current = movesFocus;
    },
    rootProps: {
      onOpenChangeComplete: (open: boolean) => {
        if (open) return;
        const action = pending.current;
        pending.current = null;
        action?.();
      },
    },
    popupProps: {
      finalFocus: () => {
        const restore = !skipFocusRestore.current;
        skipFocusRestore.current = false;
        return restore;
      },
    },
  };
};
