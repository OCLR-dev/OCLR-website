import { notFound, redirect } from "next/navigation";
import { HttpError } from "../http-error";
import { withFrontendReadRequest } from "../next-frontend-request";
// Server pages translate service authorization failures into navigation responses.
// APIs keep their explicit 401/403 status through apiError instead.
export async function authorizedPage<T>(render: () => Promise<T>): Promise<T> {
  try {
    return await withFrontendReadRequest(render);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) redirect("/login");
      if (error.status === 403 || error.status === 404) notFound();
    }
    throw error;
  }
}
