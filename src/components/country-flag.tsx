"use client";

import Image from "next/image";
import { useState } from "react";
import { useAppTranslations } from "@/i18n/shared";
import { countryFlagData } from "@/lib/country-flag";
import styles from "./country-flag.module.css";

const sizes = { small: 18, medium: 24, large: 32 } as const;

export function CountryFlag({
  code,
  size = "medium",
  decorative = false,
}: {
  code?: string | null;
  size?: keyof typeof sizes;
  /** Use when adjacent text already names the same country. */
  decorative?: boolean;
}) {
  const tr = useAppTranslations();
  const country = countryFlagData(code, tr.locale);
  return country ? (
    <FlagImage
      key={country.code}
      country={country}
      height={sizes[size]}
      decorative={decorative}
      label={tr("{value0} flag", { value0: country.name })}
    />
  ) : null;
}

function FlagImage({
  country,
  height,
  decorative,
  label,
}: {
  country: NonNullable<ReturnType<typeof countryFlagData>>;
  height: number;
  decorative: boolean;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`country-flag ${styles.flag}`}
      style={{ width: (height * country.width) / country.height, height }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : failed ? country.name : label}
      aria-hidden={decorative || undefined}
      title={country.name}
    >
      {failed ? (
        <span className={styles.fallback}>{country.code}</span>
      ) : (
        <Image
          className={styles.image}
          src={country.src}
          width={country.width}
          height={country.height}
          alt=""
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
