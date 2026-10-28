import { useAppTranslations } from "@/i18n/shared";
import Link from "./pending-link";
import { CountryFlag } from "./country-flag";
import { countryFlagData } from "@/lib/country-flag";
import { Avatar } from "./avatar";
export function PublicPlayerIdentity({
  osuId,
  username,
  edition,
  countryCode,
  countryName,
}: {
  osuId: number;
  username: string;
  edition?: string;
  countryCode?: string | null;
  countryName?: string | null;
}) {
  const tr = useAppTranslations();

  const flag = countryFlagData(countryCode, tr.locale);
  return (
    <div className="public-player-identity">
      <Avatar osuId={osuId} username={username} />
      <div>
        <a className="text-link" href={`https://osu.ppy.sh/users/${osuId}`}>
          {username}
        </a>
        <p className="muted small">
          {tr("osu! ID ")}
          {osuId}
        </p>
        {flag && (
          <p className="small">
            <CountryFlag code={countryCode} /> {countryName ?? countryCode}
          </p>
        )}
        {edition && (
          <Link
            className="text-link small"
            href={`/players/${osuId}?edition=${edition}`}
            prefetch={false}
          >
            {tr("OCLR profile")}
          </Link>
        )}
      </div>
    </div>
  );
}
