import { notFound } from "next/navigation";
import { remoteMode } from "@/lib/data-source";
import { RemoteNotice } from "@/components/remote-development";
export default function Unsupported() {
  if (!remoteMode()) notFound();
  return <RemoteNotice />;
}
