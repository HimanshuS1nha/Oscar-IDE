import { EntryNameInput } from "@/components/entry-name-input";

import { splitEntryName, validateEntryName } from "../../electron/shared/entry-name";
import {
  useExplorerTree,
  type PendingRename,
} from "@/hooks/use-explorer-tree";
import { renameEntry } from "@/lib/explorer-actions";
import { duplicateNameError, findSibling } from "@/lib/sibling-names";
import type { DirectoryEntry } from "@/types";

/** Replaces a tree row while it is being renamed. */
export const RenameEntryInput = ({
  pending,
  entry,
  siblings,
  isExpanded,
  paddingLeft,
}: {
  pending: PendingRename;
  entry: DirectoryEntry;
  /** Current listing of the entry's folder, for duplicate checks. */
  siblings: DirectoryEntry[];
  isExpanded: boolean;
  paddingLeft: number;
}) => {
  const validate = (name: string) => {
    const error = validateEntryName(name);
    if (error) return error;
    if (splitEntryName(name).length !== 1 || /[\\/]/.test(name)) {
      return "A new name cannot contain a slash.";
    }
    // Changing only the case of its own name isn't a clash.
    const duplicate = findSibling(
      siblings.filter((sibling) => sibling.path !== entry.path),
      name,
    );
    return duplicate
      ? duplicateNameError(duplicate.name)
      : null;
  };

  return (
    <EntryNameInput
      id={`rename-${pending.id}`}
      type={entry.type}
      initialName={entry.name}
      isExpanded={isExpanded}
      paddingLeft={paddingLeft}
      ariaLabel={`Rename ${entry.name}`}
      validate={validate}
      onSubmit={async (name) => {
        await renameEntry(entry, name);
        useExplorerTree.getState().cancelRename(pending.id);
      }}
      onCancel={() => useExplorerTree.getState().cancelRename(pending.id)}
    />
  );
};
