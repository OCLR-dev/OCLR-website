# S10 city pop 場景插畫

- 工具：內建 image_gen，兩步生成／風格調整；沒有使用 CLI 或 API key。
- 成品：[city-pop-coast.webp](city-pop-coast.webp)，2172×724，488,896 bytes。生成原圖只做 WebP 編碼，沒有裁切、縮放或改字；應用截圖中的響應式取景由候選 CSS 控制。
- 角色主視覺：[原始 S10 圖](../../../../public/archive/s10/thumbnail.png) 僅作第二步的配色／筆觸參考，檔案與畫面內容保持原樣。
- 場景：海岸城市、棕櫚、夕陽與海浪；晴空藍／亮青主導，桃粉、奶油白和藍紫輪廓呼應 S10 原圖。沒有角色、字樣、Logo 或賽事資料。
- 使用範圍：review-only 的頁面標題插畫；不替代原主視覺，也不是譜面封面、正式外觀或賽事事實。
- 生成具有隨機性，以下保存本次實際 prompt set，不能保證再次生成逐像素相同結果。

## 第一階段：場景構圖

```text
Use case: stylized-concept
Asset type: original wide decorative illustration for a city-pop tournament website theme, not a UI mockup.
Primary request: A vivid, sophisticated Japanese city-pop coastal metropolis at sunset, with an unmistakably illustrated, hand-painted album-cover aesthetic.
Scene: a turquoise oceanfront in the foreground, an elegant urban skyline with a few slender modern towers, illuminated windows and terraces, a very large coral-orange sun slipping behind the skyline, sweeping palm fronds in the right foreground, small soft clouds and shimmering turquoise reflections.
Style/medium: richly colored editorial gouache / airbrush illustration, crisp designed shapes with delicately drawn architectural details and visible subtle paper-print texture, clean expressive outlines, strong illustrated depth. The image should feel like a polished original record-jacket illustration, not flat generic vector clip art and not photorealistic.
Composition: panoramic landscape around 3:1 aspect ratio. City and sun centered toward the right; palm fronds on the far right; left quarter relatively open peach sky and turquoise ocean. Compose skyline, sunset and coast to remain legible at a shallow banner crop. No surrounding border or frame.
Color palette: saturated coral pink, hot rose, tangerine and apricot sunset; luminous aqua and turquoise sea; cobalt and deep indigo architecture; warm cream highlights. Vivid and confident, not washed-out pastel and not monochrome purple.
Text: none.
Constraints: no lettering, no logos, no watermarks, no interface elements, no buttons, no charts, no people or characters. This is a newly authored scenery asset; do not recreate or edit the existing tournament artwork.
```

## 最終階段：依 S10 原圖調整配色與插畫筆觸

Image 1 是第一階段的生成場景；Image 2 是未修改的 S10 原始主視覺，僅作參考。

```text
Use case: style-transfer
Edit target: Image 1, the newly generated wide coastal scene.
Reference only: Image 2, the original S10 tournament artwork. Use its PALETTE and ILLUSTRATED rendering as reference. Do not edit, redraw, copy its character, lettering, logo, or composition.
Primary request: Restyle the coastal panorama into a clearly hand-drawn anime/editorial city-pop illustration whose colors closely match the S10 reference, with vivid sky blue and cyan dominant, peach pink, cream white, and blue-violet linework. It must feel part of the same illustrated visual world.
Keep the panoramic coast, urban skyline, sunset and palm composition, but replace the dominant orange sky with clear saturated sky blue #2db6ec and cyan #49d2e1, with soft peach #ffc7b1 and candy pink #ff91bd only around the horizon and clouds. Use cobalt and periwinkle outlines, bright pink/blue architecture, creamy warm highlights. Keep deep indigo only as small shadows, not large black silhouettes. No overall orange color cast.
Style: confident visible thin blue and pink ink outlines, cel-like flat planes, soft gouache fills, simplified but refined architectural detail, graphic clouds, expressive illustrated waves and cream glints, subtle print texture. More clearly drawn and designed, less photographic and less physically realistic. Bright and vivid, never muted beige or grey.
No text, no logo, no UI, no people, no characters, no frame. Output only the revised 3:1 panoramic scenery image.
```
