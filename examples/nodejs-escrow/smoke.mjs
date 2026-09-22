import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(here, "../../packages/escrow-sdk");
const isolated = mkdtempSync(join(tmpdir(), "ggg-sdk-smoke-"));
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}`);
};
try {
  run("pnpm", ["--dir", sdkDir, "pack", "--pack-destination", isolated], sdkDir);
  const tarball = readdirSync(isolated).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("SDK pack produced no tarball");
  // The isolated project has no workspace aliases. Its Stellar SDK dependency is fixture-only.
  writeFileSync(
    join(isolated, "package.json"),
    JSON.stringify({
      name: "ggg-sdk-smoke",
      private: true,
      pnpm: { overrides: { "@stellar/stellar-sdk": "15.1.0" } },
    }),
  );
  run("pnpm", ["add", join(isolated, tarball), "@stellar/stellar-sdk@15.1.0"], isolated);
  copyFileSync(join(here, "smoke-client.mjs"), join(isolated, "smoke-client.mjs"));
  run("node", ["smoke-client.mjs"], isolated);
} finally {
  if (dirname(isolated) !== resolve(tmpdir()) || !basename(isolated).startsWith("ggg-sdk-smoke-")) {
    throw new Error("Refusing to clean an unexpected smoke directory");
  }
  rmSync(isolated, { recursive: true, force: true });
}
