import type { DirectoryEntry } from "@/types";

/** Case-insensitive, like the file systems on macOS and Windows. */
export const findSibling = (siblings: DirectoryEntry[], name: string) =>
  siblings.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

export const duplicateNameError = (name: string) =>
  `A file or folder "${name}" already exists at this location. Please choose a different name.`;
