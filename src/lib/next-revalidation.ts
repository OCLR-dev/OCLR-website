import { revalidatePath } from "next/cache";

/** Invalidate only after the database transaction has committed. */
export function revalidateCommittedPath(path: string, type?: "page" | "layout") {
  try {
    revalidatePath(path, type);
  } catch {
    // The write is already saved. Preserve its receipt and surface a safe diagnostic.
    console.error("A committed change could not invalidate the Next.js cache.");
  }
}
