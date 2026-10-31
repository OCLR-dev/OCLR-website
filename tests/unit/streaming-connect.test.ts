import { remotePageSupported } from "../../src/lib/data-source";
import { describe, expect, it } from "vitest";
import {
  streamingReturnPath,
  streamingOAuthReturn,
} from "../../src/lib/streaming-connect-model";
const origins = ["http://127.0.0.1:3001", "http://localhost:3001"];
const path = `/streaming/s11/connect?${new URLSearchParams({ origin: origins[0], state: "x".repeat(43) })}`;
describe("streaming login handoff", () => {
  it("does not expose browser credential issuance in read-only remote mode", () => {
    expect(remotePageSupported("/streaming/s11/connect")).toBe(false);
  });
  it("accepts only the exact streaming connection route and configured loopback origin", () => {
    expect(streamingReturnPath(path, origins)).toBe(path);
    for (const bad of [
      "https://evil.example" + path,
      "//evil.example" + path,
      path + "#secret",
      path + "&token=secret",
      path + "&state=" + "y".repeat(43),
      path.replace("s11", "../admin"),
      path.replace("connect?", "?"),
      path.replace(
        encodeURIComponent(origins[0]),
        encodeURIComponent("http://127.0.0.1.evil.example:3001"),
      ),
      path.replace(
        encodeURIComponent(origins[0]),
        encodeURIComponent("http://localhost:3002"),
      ),
      path.replace("x".repeat(43), "short"),
      null,
    ])
      expect(streamingReturnPath(bad, origins)).toBeNull();
  });
  it("binds return metadata to the consumed OAuth state and revalidates configuration", () => {
    const value = Buffer.from(
      JSON.stringify({ stateHash: "synthetic-hash", returnTo: path }),
    ).toString("base64url");
    expect(streamingOAuthReturn(value, "synthetic-hash", origins)).toBe(path);
    expect(streamingOAuthReturn(value, "different-state", origins)).toBeNull();
    expect(streamingOAuthReturn(value, "synthetic-hash", [])).toBeNull();
    expect(
      streamingOAuthReturn("invalid-json", "synthetic-hash", origins),
    ).toBeNull();
  });
});
