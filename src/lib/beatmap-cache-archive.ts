import { execFile } from "node:child_process";
import { HttpError } from "./http-error";
import {
  REPLAY_ARCHIVE_MAX_ENTRIES,
  REPLAY_ARCHIVE_MAX_EXPANDED_BYTES,
  REPLAY_BEATMAP_MAX_BYTES,
} from "./replay-model";

// Read and check ZIP members in a bounded subprocess. No archive paths are
// ever written to disk. Python's zipfile checks the CRC and local headers.
const inspect = String.raw`import hashlib, io, posixpath, re, stat, sys, zipfile
bid, expected = sys.argv[1:]
try:
    data = sys.stdin.buffer.read(${REPLAY_BEATMAP_MAX_BYTES + 1})
    if not data.startswith(b"PK\x03\x04") or len(data) > ${REPLAY_BEATMAP_MAX_BYTES}:
        raise ValueError()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if not entries or len(entries) > ${REPLAY_ARCHIVE_MAX_ENTRIES}:
            raise ValueError()
        if sum(max(e.file_size, e.compress_size) for e in entries) > ${REPLAY_ARCHIVE_MAX_EXPANDED_BYTES}:
            raise ValueError()
        files, matches = {}, []
        for entry in entries:
            name = entry.orig_filename
            normalized = name.rstrip("/").lower()
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if (not normalized or name.startswith("/") or re.search(r"[\\:\x00-\x1f]", name)
                or any(part in ("", ".", "..") for part in name.rstrip("/").split("/"))
                or normalized in files or kind not in (0, stat.S_IFREG, stat.S_IFDIR)
                or entry.flag_bits & 1 or entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                raise ValueError()
            files[normalized] = entry
            with archive.open(entry) as member:
                if not entry.is_dir() and name.lower().endswith(".osu"):
                    if entry.file_size > 4 * 1024 * 1024:
                        raise ValueError()
                    raw = member.read()
                    text = raw.decode("utf-8-sig", errors="replace")
                    checksum = hashlib.md5(raw, usedforsecurity=False).hexdigest()
                    if not re.match(r"^osu file format v[0-9]+\s*$", text, re.M):
                        continue
                    parsed_id = re.search(r"^BeatmapID[ \t]*:[ \t]*([0-9]+)[ \t]*\r?$", text, re.M)
                    if (expected and checksum == expected) or (not expected and parsed_id and parsed_id[1] == bid):
                        song = re.search(r"^AudioFilename[ \t]*:[ \t]*([^\r\n]+)", text, re.M)
                        matches.append((checksum, name, song[1].strip() if song else ""))
                else:
                    while member.read(65536):
                        pass
        if len(matches) != 1:
            sys.exit(4)
        checksum, name, song = matches[0]
        audio = files.get(posixpath.join(posixpath.dirname(name), song).lower())
        if not audio or not audio.file_size or not re.search(r"\.(mp3|ogg|wav)$", song, re.I):
            sys.exit(5)
        print(checksum)
except Exception:
    sys.exit(2)
`;

export async function inspectBeatmapPackage(
  bytes: Buffer,
  beatmapId: number,
  officialChecksum: string | undefined,
  signal?: AbortSignal,
) {
  if (!bytes.length || bytes.length > REPLAY_BEATMAP_MAX_BYTES)
    throw new HttpError(413, "Choose an .osz beatmap package up to 64 MiB.");

  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "python3",
      [
        "-I",
        "-c",
        inspect,
        String(beatmapId),
        officialChecksum?.toLowerCase() ?? "",
      ],
      { timeout: 6000, killSignal: "SIGKILL", maxBuffer: 1024, signal },
      (error, stdout) => {
        if (!error && /^[a-f0-9]{32}$/.test(stdout.trim())) {
          resolve(stdout.trim());
        } else if (error?.code === "ENOENT") {
          reject(
            new HttpError(
              503,
              "Beatmap package validation requires Python 3 on the app host.",
            ),
          );
        } else if (error?.code === 4) {
          reject(
            new HttpError(
              422,
              "The package has no unique difficulty matching this map.",
            ),
          );
        } else if (error?.code === 5) {
          reject(
            new HttpError(
              422,
              "The matching difficulty has no supported audio file.",
            ),
          );
        } else {
          reject(
            new HttpError(
              422,
              "This beatmap package is corrupt or exceeds archive limits.",
            ),
          );
        }
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(bytes);
  });
}
