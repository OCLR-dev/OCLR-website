import { ProxyAgent } from "undici";

let current: { url: string; agent: ProxyAgent } | undefined;

export function chatProxyFetch(proxyURL?: string): typeof fetch | undefined {
  if (!proxyURL) return undefined;
  if (current?.url !== proxyURL) {
    const agent = new ProxyAgent({ uri: proxyURL, proxyTunnel: true });
    void current?.agent.close();
    current = { url: proxyURL, agent };
  }
  const dispatcher = current.agent;
  return (input, init) => {
    const options = { ...init, dispatcher };
    return fetch(input, options);
  };
}
