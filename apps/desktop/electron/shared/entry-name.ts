/**
 * Validation for names typed into the explorer's "New File" / "New Folder" input.
 * Shared by the renderer (instant feedback) and the main process (enforcement).
 *
 * A name may contain `/` (or `\`) to create nested folders, e.g. `src/utils/index.ts`.
 */

/** Characters Windows refuses in file names; refused everywhere so projects stay portable. */
// Control characters are deliberately refused.
// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"|?*\u0000-\u001f]/;

/** Device names Windows reserves, with or without an extension. */
const RESERVED_WINDOWS_NAMES =
  /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Splits a typed name into its path segments, ignoring a leading/trailing/doubled separator. */
export const splitEntryName = (name: string) =>
  name.split(/[\\/]/).filter((segment) => segment.length > 0);

/** Returns a message describing why `name` can't be used, or null if it can. */
export const validateEntryName = (name: string): string | null => {
  if (name.trim().length === 0) {
    return "A file or folder name must be provided.";
  }
  if (/^[\\/]/.test(name)) {
    return "A file or folder name cannot start with a slash.";
  }

  for (const segment of splitEntryName(name)) {
    if (segment === "." || segment === "..") {
      return `"${segment}" is not a valid file or folder name.`;
    }
    if (INVALID_CHARS.test(segment)) {
      return `The name "${segment}" contains characters that aren't allowed.`;
    }
    if (RESERVED_WINDOWS_NAMES.test(segment)) {
      return `"${segment}" is reserved by the operating system.`;
    }
    if (/[. ]$/.test(segment)) {
      return `The name "${segment}" cannot end with a space or a period.`;
    }
  }

  return null;
};
