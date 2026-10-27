# S8 banner 與角色素材

- 原始 banner：[source-rules-banner.png](source-rules-banner.png)，使用者於本 chat 提供，750×110，原檔逐位元組保留。圖內文字為 `RULES`，用於現有 RulesHandbook 封面位置，完整 contain，不重繪／改字。
- 原始主視覺：[thumbnail.jpg](../../../../public/archive/s8/thumbnail.jpg)，1920×1080，仍完整無框呈現，不改字／裁切／調色。
- 選用角色：[heroine-half.webp](heroine-half.webp)／[生成 PNG](heroine-half.png)，1536×1024、透明 alpha。依使用者「補全女主角」與後續「僅取半身像」要求，以原 banner 為參考，先補全再製成半身構圖。保持金髮、琥珀眼、淡藍紫髮帶及手靠臉的姿態；未顯示衣飾為候選延伸，非原圖還原保證。WebP 僅編碼轉換，無裁切／重繪。
- [sakura-sprig.svg](sakura-sprig.svg)：本次以 SVG 自繪的五瓣缺口櫻花、細枝與橙色折角，用於標題留白。

工具：內建 `image_gen`（imagegen skill），未使用 CLI 或 API key。原角色未提供作者／角色名，本次不推測來源或官方合作；素材 provenance 保留使用者原圖與完整提示詞，待主辦方確認。

## 完整提示詞 1：初次補全（中間版本，未作頁面引用）

```text
Use case: identity-preserve.
Asset type: completed full-body transparent anime character asset for the OCLR S8 Sakura Circuit theme.
Input image 1 is the supplied original S8 RULES banner, used as the identity and drawing-style reference for its cropped heroine on the right. Preserve that character's recognizable face, warm amber/orange eyes, long pale golden-blonde hair with fine lavender-gray shading, straight wispy bangs, delicate pale blue/lavender hair ribbons and gentle expression. This request completes the cropped character; it does not edit the source banner.
Primary request: reveal the complete heroine from the top of her hair to both shoes, with her entire silhouette and all ribbons visible. Keep the hand gently raised near her cheek as in the reference. Complete unseen anatomy and clothing naturally in the same refined Japanese anime illustration style. A modest fully clothed ivory and very pale lavender-blue spring dress with subtle pink details and flowing ribbons, light shoes, graceful relaxed standing pose. The unseen outfit is a design continuation rather than a claim about the original.
Style: precise delicate linework, soft watercolor-like cel shading, clean readable silhouette, polished illustration matching the reference. Avoid chibi proportions or thick cartoon outlines.
Composition: one character, full body, centered on a portrait canvas with generous transparent margin all around, full hair, fingertips, skirt hem and shoes inside the image. Keep her face and hairstyle strongly consistent with the supplied banner.
Background: genuinely transparent alpha, clean cutout edges. No opaque background, no checkerboard, no scene, no flowers obscuring the body, no shadow plate.
Constraints: no text, no RULES lettering, no logo, no watermark, no UI or border, no additional characters. Do not replace blonde hair with another color or change amber eyes. Preserve the reference's youthful, gentle, fully clothed, non-sexual spring tone.
```

## 完整提示詞 2：依回饋改為半身（頁面選用）

```text
Use case: identity-preserve.
Asset type: transparent waist-up anime heroine portrait for OCLR S8 Sakura Circuit.
Input image 1 is the completed character illustration to preserve. Input image 2 is the original supplied banner identity reference.
Primary request: change only the framing to a polished waist-up / half-body portrait. Preserve the same blonde heroine's face, warm amber eyes, delicate bangs, long pale gold hair, pale blue-lavender flowing hair ribbons, gentle expression, raised hand near cheek, ivory blouse, pink chest bow, lavender waist ribbon and fine sakura details. Keep the exact established upper-body clothing design, colors, face and delicate linework.
Composition: waist-up portrait from comfortably above the entire hair and hair flower down to just below the waist ribbon; both shoulders and raised hand fully visible. Hair and ribbons must stay comfortably inside the canvas with ample transparent margins. Do not include the full skirt, legs or shoes. Center the portrait on a landscape 3:2 canvas so it can occupy the side of a website heading.
Background: actual transparent alpha. Remove background glow or gray halos; no opaque background, no scene, no checkerboard. Clean transparent cutout with soft fine hair edges. Do not add petals or props floating outside the character.
Style: same fine Japanese anime linework and soft watercolor cel shading as the input, refined rather than chibi.
Constraints: one character only, fully clothed, gentle neutral expression, no text, no logo, no RULES lettering, no watermark, no UI or frame. Preserve recognizable identity and visible outfit; only reframe and make a clean half-body asset.
```


## 精修提示詞：櫻花插畫（2026-10-27）

依主辦方回饋移除強制折角；正式主題選用 [blossom-spray.webp](blossom-spray.webp)／[PNG](blossom-spray.png)，內建 image_gen 生成，透明 alpha。保留五瓣缺口、細花脈與淡金花蕊，自然彎枝；原 `sakura-sprig.svg` 留作初稿歷史，不再用於正式主題。WebP 僅編碼轉換。

```text
Use case: stylized-concept.
Asset type: refined transparent botanical accent for the OCLR S8 website heading.
Input image 1 is the supplied S8 banner, a palette and spring mood reference only. Input image 2 is the established heroine portrait, a fine-line anime watercolor rendering reference only. Do not include the character or any lettering.
Primary request: a small, airy, asymmetrical spray of Japanese cherry blossoms with two open five-petaled sakura flowers, one smaller side-facing blossom and one tiny bud on a very slender naturally curved twig. The spray must feel hand-painted and delicate, with generous empty transparent space. Suitable as a subtle companion beside the heroine, never the dominant image.
Style: exquisite fine botanical anime illustration, translucent watercolor pink petals with pale almost-white tips, very fine petal veins, softly layered petal edges with the characteristic small notches, tiny cream-gold stamens, quiet warm rosy-brown twig. Match the heroine's nuanced linework and soft shading; avoid flat vector shapes.
Composition: loose diagonal flow on a landscape 3:2 canvas, complete flowers comfortably within the canvas, fine curved stems, generous transparent margin all sides. No rigid straight branches or geometric connector nodes. No orange folded lines, corner marks, frames, badges or circuits.
Background: genuinely transparent alpha, clean cutout, no surrounding glow, gray halo, white paper, rectangular panel, painted sky or opaque backdrop.
Constraints: no text, no logo, no UI, no character, no dense bouquet, no oversized leaves, no extra ornaments. Restrained blush pink, ivory and tiny champagne centers; natural, refined, quiet spring detail.
```
