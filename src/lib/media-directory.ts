import { realpath, mkdir, lstat } from "node:fs/promises";
import { isAbsolute, resolve, sep, join } from "node:path";
import { HttpError } from "./http-error";

/** One fail-closed policy for runtime, cleanup and release backup paths. */
export async function mediaRoot(
  root = process.env.OCLR_MEDIA_DIR,
  applicationRoots = [process.cwd()],
) {
  const invalid = () =>
    new HttpError(
      503,
      "Configure durable private media storage outside application releases and public roots.",
    );
  if (!root || !isAbsolute(root)) throw invalid();
  const path = resolve(root);
  const canonical = await realpath(path).catch(() => "");
  if (
    !canonical ||
    canonical !== path ||
    /\/(?:releases|public)(?:\/|$)/.test(path)
  )
    throw invalid();
  for (const app of applicationRoots) {
    const cwd = await realpath(app);
    if (path === cwd || path.startsWith(cwd + sep)) throw invalid();
  }
  if (!(await lstat(path)).isDirectory()) throw invalid();
  return path;
}
export async function mediaDirectory(name: "teams" | "replays", create = true) {
  const directory = join(await mediaRoot(), name);
  if (create) await mkdir(directory, { mode: 0o700, recursive: true });
  const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
    if (!create && error.code === "ENOENT") return null;
    throw error;
  });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
    throw new HttpError(503, "Private media storage is unavailable.");
  return directory;
}
