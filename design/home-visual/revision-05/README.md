# R05 — 棱角 OCL / S11

按用户要求独立新增本稿，`revision-04/` 的文件保持不变。

- OCL 与 S11：直接以 SVG 直线闭合路径绘制，统一斜切笔画与切角；内部透明，不使用替代字体或位图描摹。OCL 字高仍为 260；S11 独立横排于右侧。
- R：从 R04 最终 SVG 逐节点复制完整 `R-reference-slider`，包括轮廓、原坐标控制点和连线；位置、大小、遮罩与所有几何属性不变。沿用 [R 的截图重建记录](../revision-04/sources/R-GEOMETRY.md)。
- 喝：直接复用 R03 `judgement-katu` 中的原字形路径，只改变位置、字号及旋转，放在 R 的右上角。该字形为 Noto Serif CJK Black，沿用 [SIL OFL 授权](../revision-02/FONT-LICENSE.txt)。没有更换为另一个汉字字体。「喝」保持实心以保留小字号笔画识别；主字标内部仍透明。
- 准度条与英文全名：逐节点复用 R04，位置不变。英文全名的 Noto Sans 授权见 [R04 字体来源](../revision-04/sources/SHAPE-SOURCES.md)。

## 文件与验证

- `oclr-s11-angular.svg`：透明、纯矢量的独立字标。
- `shape-board.svg` / `shape-board.png`：白底审稿图；白底不是透明 SVG 的组成部分。
- `index.html`：独立预览页，链接至保留的 R04 和 R03。
- `compose.py`：运行 `python design/home-visual/revision-05/compose.py` 可重建。需要 Python 与 librsvg，复用的 R03/R04 资源在仓库内。

生成时校验唯一 ID、无位图/字体文本/脚本/滤镜，以及 R 元素与 R04 完全一致。渲染后目视检查轮廓、控制点、右上角「喝」和边界；检查 R04 无改动及 `git diff --check`。仅为设计稿，不涉及应用代码、数据库或部署。
