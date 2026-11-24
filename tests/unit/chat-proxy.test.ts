import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { chatConfiguration } from "@/lib/chat-config";
import { chatProxyFetch } from "@/lib/chat-proxy";

afterEach(() => vi.unstubAllEnvs());

it("enables only HTTP(S) proxy addresses and preserves unconfigured chat", () => {
  vi.stubEnv("OCLR_CHAT_BASE_URL", "https://model.example/v1");
  vi.stubEnv("OCLR_CHAT_MODEL", "test-model");
  vi.stubEnv("OCLR_CHAT_PROXY_URL", "");
  expect(chatConfiguration()?.baseURL).toBe("https://model.example/v1");
  expect(chatProxyFetch(chatConfiguration()?.proxyURL)).toBeUndefined();
  const valid = "https://proxy.example:8443";
  vi.stubEnv("OCLR_CHAT_PROXY_URL", valid);
  expect(chatConfiguration()?.proxyURL).toBe(valid);
  for (const value of [
    "bad",
    "socks5://proxy",
    valid + "/path",
    valid + "?q=x",
    "http://u:%XX@proxy",
  ]) {
    vi.stubEnv("OCLR_CHAT_PROXY_URL", value);
    expect(chatConfiguration()).toBeNull();
  }
});

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return "127.0.0.1:" + (server.address() as AddressInfo).port;
}

it("tunnels the model stream, separates credentials and stops on proxy failure", async () => {
  const direct = vi.fn();
  const directServer = createServer((_req, res) => {
    direct();
    res.end();
  });
  const destination = await listen(directServer);
  const modelRequest = vi.fn();
  const tunnel = vi.fn();
  const model = createServer((req, res) => {
    modelRequest(
      req.url,
      req.headers.authorization,
      req.headers["proxy-authorization"],
    );
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: hello\n\n");
    // Keep the stream open until the caller cancels it.
  });
  const proxy = createServer();
  let rejectTunnel = false;
  const rejected = vi.fn();
  proxy.on("connect", (req, socket) => {
    tunnel(
      req.url,
      req.headers["proxy-authorization"],
      req.headers.authorization,
    );
    if (rejectTunnel) {
      rejected();
      socket.end(
        "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    model.emit("connection", socket);
  });
  const proxyAddress = await listen(proxy);
  const send = chatProxyFetch("http://user:p%40ss@" + proxyAddress)!;
  const controller = new AbortController();
  const url = "http://" + destination + "/v1/chat/completions";
  try {
    const response = await send(url, {
      method: "POST",
      headers: { authorization: "Bearer model-key" },
      body: "{}",
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      "data: hello\n\n",
    );
    expect(tunnel).toHaveBeenCalledWith(
      destination,
      "Basic " + Buffer.from("user:p@ss").toString("base64"),
      undefined,
    );
    expect(modelRequest).toHaveBeenCalledWith(
      "/v1/chat/completions",
      "Bearer model-key",
      undefined,
    );
    controller.abort();
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    rejectTunnel = true;
    await expect(send(url, { method: "POST" })).rejects.toThrow();
    expect(rejected).toHaveBeenCalled();
    expect(modelRequest).toHaveBeenCalledTimes(1);
    expect(direct).not.toHaveBeenCalled();
  } finally {
    controller.abort();
    model.closeAllConnections();
    proxy.close();
    directServer.close();
  }
});
