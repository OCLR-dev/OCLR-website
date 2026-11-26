import { difficultyMods, type DifficultyConfiguration } from "./mappool-model";

type AnalysisIntent =
  | { kind: "beatmap"; bid?: number; mod?: DifficultyConfiguration }
  | { kind: "player"; uid?: number };

const mapWords = /(?:[譜谱]面|地[圖图]|\b(?:beatmaps?|maps?)\b)/i;
const similarWords =
  /相似|[類类]似|近似|[類类]近|接近|\b(?:similar|nearest|comparable|closest)\b/i;
const artworkWords = /背景|封面|插[圖图]|\b(?:artwork|background|cover|bg)\b/i;
const playerWords =
  /技[術术]分析|技[術术]強弱|技[術术]强弱|強弱[項项]?|强弱[項项]?|強[項项]|强[項项]|弱[項项]|(?:推[薦荐].{0,12})?[練练][習习](?:推[薦荐]|[譜谱]面|地[圖图]|[對对]象)|\b(?:strengths?|weakness(?:es)?|skill(?:s| analysis| profile)?|practice(?:\s+\w+){0,2}\s+(?:maps?|beatmaps?|recommendations?))\b/i;
const playPractice = /[練练][習习]|\bpractice\b/i;
const draftWords = /[選选]秀|[隊队][員员]推[薦荐]|\bdraft\b/i;

const canonicalMods = new Map(
  Object.entries(difficultyMods).map(([mod, parts]) => [
    parts.toSorted().join(""),
    mod as DifficultyConfiguration,
  ]),
);
function unique(values: Iterable<string>) {
  const matches = [...new Set(values)];
  return matches.length === 1 ? matches[0] : undefined;
}
function positiveId(values: Iterable<string>) {
  const parsed = Number(
    unique([...values].map((value) => String(Number(value)))),
  );
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parse(text: string) {
  const bid = positiveId([
    ...Array.from(
      text.matchAll(
        /(?<![a-z0-9])(?:BID|beatmap(?:\s+ID)?|[譜谱]面\s*ID)\s*[:=#]?\s*(\d+)(?![a-z0-9])/gi,
      ),
      (m) => m[1],
    ),
    ...Array.from(
      text.matchAll(
        /https:\/\/osu\.ppy\.sh\/(?:beatmaps\/|beatmapsets\/\d+#osu\/)(\d+)(?![a-z0-9])/gi,
      ),
      (m) => m[1],
    ),
  ]);
  const uid = positiveId([
    ...Array.from(
      text.matchAll(
        /(?<![a-z0-9])(?:UID|(?:player|osu!?)\s+ID|[選选]手\s*ID)\s*[:=#]?\s*(\d+)(?![a-z0-9])/gi,
      ),
      (m) => m[1],
    ),
    ...Array.from(
      text.matchAll(
        /https:\/\/(?:osu\.ppy\.sh\/users|oclr\.org\/players)\/(\d+)(?![a-z0-9])/gi,
      ),
      (m) => m[1],
    ),
  ]);
  const labelled = [
    ...text.matchAll(
      /\bMODS?\b\s*[:=]?\s*([a-z]{2,12}(?:\s*\+\s*[a-z]{2})*)\b/gi,
    ),
  ];
  const tokens = labelled.length
    ? labelled
    : [
        ...text.matchAll(
          /\b((?:HDHRDT|HDHR|HDDT|HRDT|NM|HD|HR|DT|EZ|HT|FM|TB)(?:\s*\+\s*(?:HD|HR|DT))*)\b/gi,
        ),
      ];
  const rawMod = unique(
    tokens.map((m) => m[1].toUpperCase().replace(/[\s+]/g, "")),
  );
  const orderless =
    rawMod === "NM" ? "" : rawMod?.match(/.{2}/g)?.sort().join("");
  const mod =
    orderless !== undefined && rawMod!.length % 2 === 0
      ? canonicalMods.get(orderless)
      : undefined;
  return { bid, uid, mod, referredMod: tokens.length > 0 };
}

function kindOf(
  question: string,
  input: ReturnType<typeof parse>,
): AnalysisIntent["kind"] | undefined {
  if (
    !artworkWords.test(question) &&
    ((similarWords.test(question) && (mapWords.test(question) || input.bid)) ||
      (input.bid && input.referredMod && !playerWords.test(question)))
  )
    return "beatmap";
  if (
    playerWords.test(question) &&
    (!(draftWords.test(question) || /\b(?:SIP|ETX)\b/i.test(question)) ||
      playPractice.test(question)) &&
    (input.uid ||
      /[選选]手|osu|UID|\bplayers?\b/i.test(question) ||
      playPractice.test(question))
  )
    return "player";
}

export function chatAnalysisIntent(
  question: string,
  previous: string,
): AnalysisIntent | undefined {
  const current = question.normalize("NFKC").trim();
  const input = parse(current);
  const kind = kindOf(current, input);
  if (kind === "beatmap") return { kind, bid: input.bid, mod: input.mod };
  if (kind === "player") return { kind, uid: input.uid };

  const earlier = previous.normalize("NFKC");
  const prior = parse(earlier);
  const priorKind = kindOf(earlier, prior);
  if (
    priorKind === "beatmap" &&
    input.mod &&
    /^(?:(?:改成|[換换]成|用|use|try)\s*)?(?:MOD\s*[:=]?\s*)?[A-Z]{2,6}(?:\s*\+\s*[A-Z]{2})*[。？！?!.]*$/i.test(
      current,
    )
  )
    return { kind: "beatmap", bid: prior.bid, mod: input.mod };
  if (
    priorKind === "beatmap" &&
    input.bid &&
    /^BID\s*[:=#]?\s*\d+[。？！?!.]*$/i.test(current)
  )
    return { kind: "beatmap", bid: input.bid, mod: prior.mod };
  if (
    priorKind === "player" &&
    input.uid &&
    /^(?:osu!?\s*)?UID\s*[:=#]?\s*\d+[。？！?!.]*$/i.test(current)
  )
    return { kind: "player", uid: input.uid };
}
