import { remoteMode } from "./data-source";

export function chatConfiguration() {
  const baseURL = process.env.OCLR_CHAT_BASE_URL?.trim();
  const model = process.env.OCLR_CHAT_MODEL?.trim();
  const apiKey = process.env.OCLR_CHAT_API_KEY?.trim();
  if (remoteMode() || !baseURL || !model || !URL.canParse(baseURL)) return null;
  const url = new URL(baseURL);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (loopback && url.protocol === "http:"))
  )
    return null;
  return { baseURL, model, apiKey };
}
