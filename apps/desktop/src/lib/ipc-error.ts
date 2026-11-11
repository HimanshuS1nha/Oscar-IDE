/** Electron prefixes errors thrown in `ipcMain.handle`; show only the message. */
export const ipcErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(
    /^Error invoking remote method '[^']*': (\w*Error: )?/,
    "",
  );
};
