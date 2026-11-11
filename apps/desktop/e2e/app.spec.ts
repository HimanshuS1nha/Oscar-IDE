import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from "@playwright/test";

let app: ElectronApplication;
let userData: string;

test.beforeEach(async () => {
  // A fresh profile: no saved settings, session or sign-in.
  userData = await mkdtemp(path.join(tmpdir(), "oscar-e2e-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    cwd: path.join(import.meta.dirname, ".."),
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(userData, { recursive: true, force: true });
});

test("starts and shows the editor", async () => {
  const window = await app.firstWindow();
  const errors: Error[] = [];
  window.on("pageerror", (error) => errors.push(error));

  await expect(window.getByText("Open a file from the explorer")).toBeVisible();
  expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(
    userData,
  );
  expect(errors).toEqual([]);
});
