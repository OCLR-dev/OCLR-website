import { HttpError } from "../http-error";
import { isStaff } from "./staff";
import { requireUser } from "./user";

export async function requireStaff() {
  const user = await requireUser();
  if (!(await isStaff(user)))
    throw new HttpError(403, "Staff access is required.");
  return user;
}
