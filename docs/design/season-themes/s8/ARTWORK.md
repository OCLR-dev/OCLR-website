# S8 banner 與角色素材

## 女主角樣貌修整（2026-10-27）

主辦方標註實際 S8 頁面人物，依原 banner 重新修整臉部、雙眼比例、頭部傾斜及髮絲交界。正式引用改為 [heroine-half-refined.webp](heroine-half-refined.webp)，來源為 [內建 image_gen 的 PNG](heroine-half-refined.png)，1536×1024，保留透明 alpha。WebP 使用 quality 92 編碼並逐像素核對 alpha 完全相同，不裁切、調色或後製人物；公開素材與設計資料夾版本逐位元組一致。舊半身素材保留作歷史，原 banner／主視覺原檔不變。仍為原 banner 的候選補全，未宣稱未顯示的衣飾是官方原稿。

先嘗試保留舊構圖的臉部局部修整，視覺變化不足，未採用。下列為最終選用的重建提示詞；image 1 是原 banner、image 2 是舊半身像，僅取服裝／構圖參考。

```text
Use case: identity-preserve.
Asset type: replacement transparent half-body anime heroine illustration for an existing website, landscape 3:2 canvas.
Image 1 is the original S8 RULES banner. The cropped blonde heroine at its right is the PRIMARY authority for the face, eyes, expression, head angle, bangs and delicate drawing style. Image 2 is the previous half-body website asset; use it ONLY for the fully clothed costume, hand-at-cheek pose, lavender ribbons, sakura ornaments and waist-up framing. Do not copy the previous asset's exaggerated head tilt or mismatched eye proportions. Do not reproduce the banner or its lettering.
Reconstruct a refined, coherent half-body portrait of the original banner heroine. Her head should be nearly upright with only the subtle gentle tilt in the original banner, an elegant natural oval face, two balanced amber-orange eyes on one coherent perspective axis, matching pupils directed at the viewer, delicate crisp lashes and eyelids, small subtle nose without a white dot or glare, a gentle tiny closed mouth, clean natural jaw and neck anatomy. Facial proportions should match the original banner, not the enlarged doll eyes or pointed chin of the previous completion. Preserve her recognizable pale golden-blonde hair, straight wispy bangs with fine strands and cool lavender-gray hair shadows. The face must be clean and readable when the entire asset is displayed 340 CSS pixels wide.
Keep the existing modest ivory and pale lavender spring blouse/dress upper body with pink chest bow, frilled sleeves, lavender waist bow, small sakura flowers and trailing pale lavender ribbons. Keep the raised hand gently beside her cheek, draw coherent relaxed fingers and natural wrist. Single character only, fully clothed, gentle non-sexual spring portrait. Preserve the soft refined Japanese anime illustration with fine clean linework and delicate watercolor cel shading. Avoid glossy plastic skin, photorealism, chibi, overly large eyes, rigid symmetry or messy hair intersections.
Composition: crown to just beneath the waist bow. Both shoulders and raised hand visible. Complete flowing hair/ribbon silhouette contained within the canvas, with 5 percent clear margin above the crown and at both sides. Hair should frame the face gracefully rather than overwhelm it; do not shrink the face into an excessively wide hair spread. No legs, no lower skirt. Do not crop the hair, ornaments or ribbon ends at side edges.
Background must be truly transparent alpha everywhere outside the character and in gaps between ribbons and hair; no gray, lavender, black or white backdrop, gradient, ambient haze, halo, drop shadow, matte, painted sky or checkerboard. Fine clean antialiased cutout edges. No bottom fade baked into the image; the site handles its bottom fade.
No text, lettering, logos, RULES, watermark, UI, border, floating floral background or extra people. This must be a visibly corrected facial reconstruction matching image 1, not a near-identical copy of image 2.
```

## 原始來源與舊版生成紀錄

- 原始 banner：[source-rules-banner.png](source-rules-banner.png)，使用者於本 chat 提供，750×110，原檔逐位元組保留。圖內文字為 `RULES`，用於現有 RulesHandbook 封面位置，完整 contain，不重繪／改字。
- 原始主視覺：[thumbnail.jpg](../../../../public/archive/s8/thumbnail.jpg)，1920×1080，仍完整無框呈現，不改字／裁切／調色。
- 舊版角色（歷史）：[heroine-half.webp](heroine-half.webp)／[生成 PNG](heroine-half.png)，1536×1024、透明 alpha。依使用者「補全女主角」與後續「僅取半身像」要求，以原 banner 為參考，先補全再製成半身構圖。保持金髮、琥珀眼、淡藍紫髮帶及手靠臉的姿態；未顯示衣飾為候選延伸，非原圖還原保證。WebP 僅編碼轉換，無裁切／重繪。
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
