import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  mainMenuItems,
  type MainMenuItem,
} from "@/constants/main-menu-items";
import { useCodeEditor } from "@/hooks/use-code-editor";
import { useHotkeyLabel } from "@/hooks/use-hotkey-label";
import { useRunAfterClose } from "@/hooks/use-run-after-close";
import { useShowWorkspace } from "@/hooks/use-show-workspace";

const MenuEntry = ({
  item,
  onSelect,
}: {
  item: MainMenuItem;
  onSelect: (item: MainMenuItem) => void;
}) => {
  const hasEditor = useCodeEditor((state) => state.editor !== null);
  const hotkeyLabel = useHotkeyLabel();

  const children = item.getChildren?.() ?? item.children;

  if (children?.length) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{item.name}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-w-96 min-w-48">
          {children.map((child) => (
            <MenuEntry
              key={child.detail ?? child.name}
              item={child}
              onSelect={onSelect}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  const shortcut = hotkeyLabel(item);

  return (
    <DropdownMenuItem
      // An empty list (e.g. no recent folders) shows as a disabled entry.
      disabled={(item.needsEditor && !hasEditor) || !!children}
      onClick={() => onSelect(item)}
    >
      {item.detail ? (
        <span className="flex min-w-0 items-baseline gap-2" title={item.detail}>
          <span className="shrink-0">{item.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {item.detail}
          </span>
        </span>
      ) : (
        item.name
      )}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
};

const MainMenu = () => {
  const { runAfterClose, rootProps, popupProps } = useRunAfterClose();
  const showWorkspace = useShowWorkspace();

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="app-no-drag"
            aria-label="Main menu"
          />
        }
      >
        <MenuIcon size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44" {...popupProps}>
        {mainMenuItems.map((item) => (
          <MenuEntry
            key={item.name}
            item={item}
            onSelect={(selected) => {
              if (!selected.action) return;
              const { action } = selected;
              runAfterClose(
                async () => {
                  if (!selected.anyPage) await showWorkspace();
                  action();
                },
                { movesFocus: selected.movesFocus },
              );
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default MainMenu;
