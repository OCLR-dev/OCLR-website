import { authorizeBackupActor, backupChannelAllowed } from "../admin-backups";
import { requireUser } from "./user";

export async function requireBackupActor() {
  const actor = backupChannelAllowed() ? await requireUser() : null;
  return authorizeBackupActor(actor);
}
