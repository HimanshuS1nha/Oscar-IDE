/** Native-path helpers for the renderer, which has no `node:path`. */

const SEPARATOR = /[\\/]/;

/** Last segment of a path: `/a/b/c.ts` → `c.ts`. */
export const baseName = (path: string) =>
  path.split(SEPARATOR).filter(Boolean).pop() ?? path;

/** Path without its last segment: `/a/b/c.ts` → `/a/b`. Roots return themselves. */
export const parentPath = (path: string) => {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index < 0) return path;
  // Keep the separator for roots like `/` and `C:\`.
  if (index === 0 || /^[a-zA-Z]:$/.test(trimmed.slice(0, index))) {
    return trimmed.slice(0, index + 1);
  }
  return trimmed.slice(0, index);
};

/** True if `path` is `dir` itself or anywhere inside it. */
export const isSameOrInside = (path: string, dir: string) => {
  if (path === dir) return true;
  const base = dir.replace(/[\\/]+$/, "");
  return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`);
};

/** Moves `path` from under `from` to under `to` (after renaming `from` to `to`). */
export const rebasePath = (path: string, from: string, to: string) =>
  path === from ? to : to + path.slice(from.length);

/** Joins a `/`-separated relative path onto `root`, using `root`'s separator. */
export const joinRelative = (root: string, relativePath: string) => {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  return `${base}${separator}${relativePath.split("/").join(separator)}`;
};
