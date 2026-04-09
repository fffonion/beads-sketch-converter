import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const cargoManifestPath = join(rootDir, "detecter", "Cargo.toml");
const outputPath = join(rootDir, "src", "wasm", "detecter.wasm");
const releaseArtifactPath = join(
  rootDir,
  "detecter",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "detecter.wasm",
);
const rustToolchain = "1.94.1-x86_64-pc-windows-msvc";

if (await shouldRebuildDetecter()) {
  await runCommand("rustup", [
    "run",
    rustToolchain,
    "cargo",
    "build",
    "--manifest-path",
    cargoManifestPath,
    "--release",
    "--target",
    "wasm32-unknown-unknown",
  ]);
}

await mkdir(dirname(outputPath), { recursive: true });
await copyFile(releaseArtifactPath, outputPath);

async function runCommand(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function shouldRebuildDetecter() {
  const artifactTime = await getMtimeMs(releaseArtifactPath);
  if (!artifactTime) {
    return true;
  }

  const sourceFiles = await collectDetecterSourceFiles(join(rootDir, "detecter"));
  for (const filePath of sourceFiles) {
    const modifiedTime = await getMtimeMs(filePath);
    if (modifiedTime && modifiedTime > artifactTime) {
      return true;
    }
  }

  return false;
}

async function collectDetecterSourceFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name === "target") {
      continue;
    }

    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectDetecterSourceFiles(entryPath)));
      continue;
    }

    results.push(entryPath);
  }

  return results;
}

async function getMtimeMs(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.mtimeMs;
  } catch {
    return null;
  }
}
