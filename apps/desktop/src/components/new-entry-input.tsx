import { useQueryClient } from "@tanstack/react-query";

import { EntryNameInput } from "@/components/entry-name-input";

import { splitEntryName, validateEntryName } from "../../electron/shared/entry-name";
import {
  useExplorerTree,
  type PendingCreation,
} from "@/hooks/use-explorer-tree";
import { useOpenedFiles } from "@/hooks/use-opened-files";
import { baseName, parentPath } from "@/lib/paths";
import { duplicateNameError, findSibling } from "@/lib/sibling-names";
import { directoryQuery } from "@/queries/directory-query";
import type { DirectoryEntry } from "@/types";

/** Every directory `name` creates on the way to its last segment, as absolute paths. */
const intermediateDirectories = (parent: string, name: string) => {
  const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  const segments = splitEntryName(name).slice(0, -1);
  const paths: string[] = [];
  let current = parent.replace(/[\\/]+$/, "");
  for (const segment of segments) {
    current = `${current}${separator}${segment}`;
    paths.push(current);
  }
  return paths;
};

/** The inline input for "New File" / "New Folder". */
export const NewEntryInput = ({
  pending,
  siblings,
  paddingLeft,
}: {
  pending: PendingCreation;
  /** Current listing of `pending.parentPath`, for duplicate checks. */
  siblings: DirectoryEntry[];
  paddingLeft: number;
}) => {
  const queryClient = useQueryClient();
  const isFolder = pending.type === "directory";

  const validate = (name: string) => {
    const error = validateEntryName(name);
    if (error) return error;
    // Nested names may go into an existing folder; only a single name can clash here.
    const segments = splitEntryName(name);
    const duplicate =
      segments.length === 1 && findSibling(siblings, segments[0]);
    return duplicate ? duplicateNameError(duplicate.name) : null;
  };

  const create = async (name: string) => {
    const api = window.electron.file;
    const createdPath = isFolder
      ? await api.createDirectory(pending.parentPath, name)
      : await api.createFile(pending.parentPath, name);

    // Show the new entry now rather than waiting for the file watcher.
    const createdDirs = intermediateDirectories(pending.parentPath, name);
    await queryClient.invalidateQueries({
      queryKey: directoryQuery(pending.parentPath).queryKey,
      exact: true,
    });

    const tree = useExplorerTree.getState();
    tree.expand(createdDirs);
    tree.cancelCreation(pending.id);
    tree.select({ path: createdPath, type: pending.type });

    if (!isFolder) {
      useOpenedFiles.getState().addFile({
        name: baseName(createdPath),
        path: createdPath,
        isPermanent: true,
      });
    }

    // Nested names: make sure the folders created on the way are listed.
    for (const dir of [...createdDirs, parentPath(createdPath)]) {
      void queryClient.invalidateQueries({
        queryKey: directoryQuery(dir).queryKey,
        exact: true,
      });
    }
  };

  return (
    <EntryNameInput
      id={`new-${pending.id}`}
      type={pending.type}
      paddingLeft={paddingLeft}
      ariaLabel={isFolder ? "New folder name" : "New file name"}
      validate={validate}
      onSubmit={create}
      onCancel={() => useExplorerTree.getState().cancelCreation(pending.id)}
    />
  );
};
