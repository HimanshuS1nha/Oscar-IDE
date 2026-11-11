export type Platform = "darwin" | "win32" | "linux";

export const getPlatform = (): Platform => {
  const platform = window.electron.platform;
  if (platform === "darwin" || platform === "win32") {
    return platform;
  }
  
  return "linux";
};
