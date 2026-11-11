import { app, safeStorage, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "auth-token";

const tokenPath = () => path.join(app.getPath("userData"), FILE_NAME);

/**
 * Whether the token can be written to disk encrypted with a key the OS
 * protects (Keychain, DPAPI, or the Secret Service/KWallet on Linux). On Linux
 * without a keyring, Electron falls back to a hard-coded key ("basic_text"),
 * which protects nothing.
 */
const canPersist = async () =>
  (await safeStorage.isAsyncEncryptionAvailable()) &&
  (process.platform !== "linux" ||
    safeStorage.getSelectedStorageBackend() !== "basic_text");

/** The token as far as this process knows; undefined until first read. */
let cached: string | null | undefined;

const writeToDisk = async (token: string) => {
  // Write a temporary file and rename it, so a crash can't leave half a file.
  const target = tokenPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    `${target}.tmp`,
    await safeStorage.encryptStringAsync(token),
    { mode: 0o600 },
  );
  await fs.rename(`${target}.tmp`, target);
};

const readFromDisk = async () => {
  if (!(await canPersist())) return null;
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      await fs.readFile(tokenPath()),
    );
    // The OS rotated the key: store it under the new one.
    if (shouldReEncrypt) await writeToDisk(result);
    return result;
  } catch {
    // Missing, or encrypted with a key we no longer have.
    return null;
  }
};

/**
 * The signed-in user's API token, kept in the app's data folder encrypted with
 * Electron's `safeStorage`. Where the OS offers no secure key store, it's kept
 * in memory only, so the user signs in again on the next launch.
 */
export class AuthToken {
  static async get() {
    if (cached === undefined) {
      const fromDisk = await readFromDisk();
      // A sign-in or sign-out while reading wins over what was on disk.
      if (cached === undefined) cached = fromDisk;
    }
    return cached;
  }

  static async set(_event: IpcMainInvokeEvent, token: unknown) {
    if (typeof token !== "string" || !token) {
      throw new Error("The token must be a non-empty string");
    }
    cached = token;
    if (await canPersist()) await writeToDisk(token);
  }

  static async clear() {
    cached = null;
    await fs.rm(tokenPath(), { force: true });
  }
}
