"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./mappool-replay-player.module.css";
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
}: {
  replayUrl: string;
  beatmapMd5: string;
  filename: string;
}) {
  const tr = useAppTranslations();
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<Playback | null>(null);
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
      const [viewer, archives, replayBytes, beatmapBytes, skinBytes] =
        await Promise.all([
          import("replayviewer-js"),
          import("@/lib/replay-playback-archive"),
          fetchAsset(replayUrl, signal, REPLAY_MAX_BYTES, "replay"),
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
      "Could not load the beatmap package. Check the server beatmap cache for this map.",
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

  const ready = duration > 0;
  const playLabel = playing ? tr("Pause replay") : tr("Play replay");

  return (
    <>
      <div
        className={styles.frame}
        role="group"
        aria-label={tr("Replay playback for {value0}", { value0: filename })}
        aria-busy={loading}
      >
        <div className={styles.stage}>
          <canvas ref={canvas} width={960} height={540} aria-hidden="true" />
          {!ready && (
            <div className={styles.poster}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="m10 8 6 4-6 4z" />
              </svg>
              {loading ? (
                <span role="status">{tr("Loading replay…")}</span>
              ) : (
                <span>{filename}</span>
              )}
            </div>
          )}
        </div>
        <div className={styles.controls}>
          <input
            className={styles.timeline}
            type="range"
            min={0}
            max={duration || 1}
            step="any"
            value={time}
            disabled={!ready}
            style={
              {
                "--replay-value": ready ? `${(100 * time) / duration}%` : "0%",
              } as CSSProperties
            }
            aria-label={tr("Replay progress")}
            aria-valuetext={mediaTime(time)}
            onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          />
          <div className={styles.transport}>
            <button
              type="button"
              className={styles.play}
              disabled={loading}
              aria-label={playLabel}
              title={playLabel}
              onClick={() => (ready ? toggle() : void start())}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                {playing ? (
                  <path d="M8 5h3v14H8zm5 0h3v14h-3z" />
                ) : (
                  <path d="M8 5v14l11-7z" />
                )}
              </svg>
            </button>
            <span className={styles.time}>
              {mediaTime(time)} <span aria-hidden="true">/</span>{" "}
              {ready ? mediaTime(duration) : "–:––"}
            </span>
            <label className={styles.volume}>
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 9h4l5-4v14l-5-4H3zM15 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" />
              </svg>
              <span className="sr-only">{tr("Replay volume")}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                disabled={loading}
                style={{ "--replay-value": `${volume}%` } as CSSProperties}
                aria-valuetext={`${volume}%`}
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
        </div>
      </div>
      {failure && (
        <p className="error-text" role="alert">
          {messages[failure]}
        </p>
      )}
    </>
  );
}
