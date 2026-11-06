import { z } from "zod";

/** An operator-supplied browser download link; the server never fetches it. */
export const downloadMirrorSchema = z
  .string()
  .trim()
  .max(2048)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/[\s\u0000-\u001f\u007f]/.test(value)
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS download URL without credentials.");

export function safeDownloadMirror(value: unknown): string | null {
  const parsed = downloadMirrorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
