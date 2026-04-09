import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "..");
const cargoManifestPath = join(rootDir, "rust-chart-detector", "Cargo.toml");
const outputPath = join(rootDir, "src", "lib", "rust-chart-detector.wasm");
const releaseArtifactPath = join(
  rootDir,
  "rust-chart-detector",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "rust_chart_detector.wasm",
);
const rustToolchain = "1.94.1-x86_64-pc-windows-msvc";

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
