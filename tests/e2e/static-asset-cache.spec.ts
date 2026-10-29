import { expect, test } from "@playwright/test";

test("production public assets retain validators and bounded browser freshness", async ({
  request,
}) => {
  for (const path of [
    "/branding/oclr-mark.svg",
    "/oclr-s11-key-visual.webp",
    "/archive/s7/key-visual.jpg",
    "/themes/prism-overture/prism-field-light.svg",
    "/fonts/quicksand-latin-variable.woff2",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(
      "public, max-age=300, must-revalidate",
    );
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    for (const [header, validator] of [
      ["If-None-Match", response.headers().etag],
      ["If-Modified-Since", response.headers()["last-modified"]],
    ]) {
      expect(validator).toBeTruthy();
      const unchanged = await request.get(path, {
        headers: { [header]: validator },
      });
      expect(unchanged.status()).toBe(304);
      expect((await unchanged.body()).length).toBe(0);
    }
  }
  const privateResponse = await request.get("/api/private.png");
  expect(privateResponse.headers()["cache-control"]).toContain("no-store");
  const missing = await request.get("/themes/does-not-exist.svg");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["cache-control"]).not.toContain("public");
});
