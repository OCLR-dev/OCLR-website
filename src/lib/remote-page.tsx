import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { RemoteDataError } from "./remote-errors";
import { RemoteNotice } from "@/components/remote-development";
export async function remotePage(render: () => Promise<ReactNode>) {
  try {
    return await render();
  } catch (error) {
    if (!(error instanceof RemoteDataError)) throw error;
    if (error.code === "NOT_FOUND") notFound();
    return <RemoteNotice code={error.code} />;
  }
}
