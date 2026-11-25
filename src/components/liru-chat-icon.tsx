import Image from "next/image";
import styles from "./liru-chat.module.css";

/** Liru by JerrYamada, CC BY 4.0. Portrait adapted from character sheet v1.2.1. */
export function LiruChatIcon({ size = 32 }: { size?: number }) {
  return (
    <Image
      className={styles.icon}
      src="/mascot/liru/chat-launcher.webp"
      alt=""
      width={size}
      height={size}
      unoptimized
    />
  );
}
