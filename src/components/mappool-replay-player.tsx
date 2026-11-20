"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { CoreSession, SkinAssets } from "replayviewer-js";
import { useAppTranslations } from "@/i18n/shared";
import {
  REPLAY_BEATMAP_MAX_BYTES,
  REPLAY_MAX_BYTES,
  REPLAY_SKIN_MAX_BYTES,
} from "@/lib/replay-model";

type Failure =
  "replay" | "beatmap" | "mismatch" | "skin" | "audio" | "playback";
type Playback = {
  controller: AbortController;
  audio: AudioContext;
  command: number;
  session?: CoreSession;
  skin?: SkinAssets;
};

class PlaybackFailure extends Error {
  constructor(readonly reason: Failure) {
    super(reason);
  }
}

function disposePlayback(playback: Playback) {
  playback.controller.abort();
  playback.session?.audioSync.pause();
  playback.session?.destroy();
  playback.session?.background?.close();
  playback.skin?.images.forEach((image) => image.close());
  playback.session = undefined;
  playback.skin = undefined;
  if (playback.audio.state !== "closed")
    void playback.audio.close().catch(() => {});
}

async function fetchAsset(
  url: string,
  signal: AbortSignal,
  limit: number,
  failure: Failure,
) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (failure === "beatmap" && response.status === 409)
    throw new PlaybackFailure("mismatch");
  if (
    !response.ok ||
    !response.body ||
    !response.headers
      .get("content-type")
      ?.startsWith("application/octet-stream")
  )
    throw new PlaybackFailure(failure);

  // Count the decoded stream. Next or a proxy can compress the response or
  // omit Content-Length, so it cannot describe the browser's byte count.
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new PlaybackFailure(failure);
    }
    chunks.push(value);
  }
  if (!size) throw new PlaybackFailure(failure);
  return new Blob(chunks).arrayBuffer();
}

function mediaTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MappoolReplayPlayer({
  replayUrl,
  beatmapMd5,
  filename,
  id,
}: {
  replayUrl: string;
  beatmapMd5: string;
  filename: string;
  id: string;
}) {
  const tr = useAppTranslations();
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<Playback | null>(null);
  const [beatmapFile, setBeatmapFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(
    () => () => {
      const previous = active.current;
      active.current = null;
      if (previous) disposePlayback(previous);
    },
    [],
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const session = active.current?.session;
      if (!session) return;
      const position = session.player.currentTimeMs;
      setTime(position);
      if (position >= session.player.durationMs) {
        session.player.pause();
        session.audioSync.pause();
        setPlaying(false);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [playing]);

  async function playFrom(playback: Playback, position: number) {
    const session = playback.session;
    if (!session) return;
    const command = ++playback.command;
    setPlaying(true);
    try {
      await session.audioSync.playFrom(position);
      if (active.current !== playback || playback.command !== command) return;
      session.player.seek(position);
      session.player.play();
    } catch {
      if (active.current !== playback || playback.command !== command) return;
      session.audioSync.pause();
      setPlaying(false);
      setFailure("playback");
    }
  }

  async function start() {
    if (active.current || !canvas.current) return;
    const surface = canvas.current;
    setFailure(null);
    const controller = new AbortController();
    let audio: AudioContext;
    try {
      audio = new AudioContext();
    } catch {
      setFailure("audio");
      return;
    }
    const playback: Playback = { controller, audio, command: 0 };
    active.current = playback;
    const signal = controller.signal;
    setLoading(true);

    try {
      if (beatmapFile && beatmapFile.size > REPLAY_BEATMAP_MAX_BYTES)
        throw new PlaybackFailure("beatmap");
      const [viewer, archives, replayBytes, beatmapBytes, skinBytes] =
        await Promise.all([
          import("replayviewer-js"),
          import("@/lib/replay-playback-archive"),
          fetchAsset(replayUrl, signal, REPLAY_MAX_BYTES, "replay"),
          beatmapFile?.arrayBuffer() ??
            fetchAsset(
              `${replayUrl}/playback/beatmap.osz`,
              signal,
              REPLAY_BEATMAP_MAX_BYTES,
              "beatmap",
            ),
          fetchAsset(
            `${replayUrl}/playback/skin.osk`,
            signal,
            REPLAY_SKIN_MAX_BYTES,
            "skin",
          ),
          audio.resume().catch(() => {
            throw new PlaybackFailure("audio");
          }),
        ]);
      signal.throwIfAborted();

      const replay = await viewer.parseReplay(replayBytes).catch(() => {
        throw new PlaybackFailure("replay");
      });
      signal.throwIfAborted();
      const hash = beatmapMd5.toLowerCase();
      if (
        replay.mode !== 0 ||
        !/^[a-f0-9]{32}$/.test(hash) ||
        replay.beatmapHash.toLowerCase() !== hash
      )
        throw new PlaybackFailure("replay");
      replay.beatmapHash = hash;

      let beatmap: ArrayBuffer;
      try {
        beatmap = archives.prepareReplayArchive(beatmapBytes, hash);
      } catch (error) {
        throw new PlaybackFailure(
          error instanceof archives.ReplayArchiveError &&
            error.reason === "mismatch"
            ? "mismatch"
            : "beatmap",
        );
      }
      let skin: SkinAssets;
      try {
        skin = await viewer.loadSkin(
          archives.prepareReplayArchive(skinBytes),
          audio,
        );
        if (!skin.images.size) throw new Error();
      } catch {
        throw new PlaybackFailure("skin");
      }
      playback.skin = skin;
      signal.throwIfAborted();

      const session = await viewer.createReplaySession({
        canvas: surface,
        audioContext: audio,
        replay,
        beatmapSet: beatmap,
        skin: viewer.buildSkin(skin, undefined, { mode: replay.mode }),
        lazerDefaultsUrl: "/replay-lazer-defaults",
      });
      playback.session = session;
      signal.throwIfAborted();
      if (!session.assets.songBuffer) throw new PlaybackFailure("audio");

      session.audioSync.setSongVolume(volume / 100);
      session.audioSync.setEffectsVolume(volume / 100);
      session.player.setClockFn(session.audioSync.clockFn);
      session.renderer.start();
      setDuration(session.player.durationMs);
      await playFrom(playback, 0);
    } catch (error) {
      disposePlayback(playback);
      if (active.current === playback) {
        active.current = null;
        setLoading(false);
        setFailure(
          error instanceof PlaybackFailure ? error.reason : "playback",
        );
      }
    } finally {
      if (active.current === playback) setLoading(false);
    }
  }

  function toggle() {
    const playback = active.current;
    if (!playback?.session) return;
    const { player, audioSync } = playback.session;
    setFailure(null);
    if (playing) {
      playback.command++;
      player.pause();
      audioSync.pause();
      setTime(player.currentTimeMs);
      setPlaying(false);
    } else {
      const position =
        player.currentTimeMs >= player.durationMs ? 0 : player.currentTimeMs;
      player.seek(position);
      setTime(position);
      void playFrom(playback, position);
    }
  }

  function seek(position: number) {
    const playback = active.current;
    if (!playback?.session) return;
    const { player, audioSync } = playback.session;
    playback.command++;
    player.pause();
    audioSync.pause();
    player.seek(position);
    setTime(position);
    if (playing && position < player.durationMs)
      void playFrom(playback, position);
    else setPlaying(false);
  }

  const messages = {
    replay: tr("Could not load this replay. Reload the list and try again."),
    beatmap: tr(
      "Could not load the beatmap package. Choose a matching .osz up to 64 MiB.",
    ),
    mismatch: tr("The beatmap package has no difficulty matching this replay."),
    skin: tr(
      "Replay skin is unavailable. Ask an Admin to check the installed skin.",
    ),
    audio: tr(
      "Could not start replay audio. Check the beatmap package and try again.",
    ),
    playback: tr("Could not play this replay. Try again."),
  };

  return (
    <div className="replay-player" id={id}>
      <canvas
        ref={canvas}
        width={960}
        height={540}
        aria-label={tr("Replay playback for {value0}", { value0: filename })}
      />
      {duration > 0 ? (
        <Fragment key="transport">
          <label className="field">
            <span>
              {tr("Replay progress")} · {mediaTime(time)} /{" "}
              {mediaTime(duration)}
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step="any"
              value={time}
              aria-valuetext={mediaTime(time)}
              onChange={(event) => seek(event.currentTarget.valueAsNumber)}
            />
          </label>
          <div className="actions">
            <button type="button" className="secondary" onClick={toggle}>
              {playing ? tr("Pause replay") : tr("Play replay")}
            </button>
            <label className="field">
              <span>{tr("Replay volume")}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  setVolume(value);
                  active.current?.session?.audioSync.setSongVolume(value / 100);
                  active.current?.session?.audioSync.setEffectsVolume(
                    value / 100,
                  );
                }}
              />
            </label>
          </div>
        </Fragment>
      ) : (
        <Fragment key="source">
          <label className="field">
            <span>{tr("Use a local beatmap package (.osz)")}</span>
            <input
              type="file"
              accept=".osz"
              disabled={loading}
              onChange={(event) => {
                setBeatmapFile(event.currentTarget.files?.[0] ?? null);
                setFailure(null);
              }}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              disabled={loading}
              onClick={() => void start()}
            >
              {tr("Play replay")}
            </button>
          </div>
          {loading && <p role="status">{tr("Loading replay…")}</p>}
        </Fragment>
      )}
      {failure && (
        <p className="error-text" role="alert">
          {messages[failure]}
        </p>
      )}
    </div>
  );
}
