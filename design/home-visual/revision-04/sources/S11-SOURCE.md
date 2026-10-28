# R04 S11 笔刷轮廓来源

- 输出：[`../s11-brush.svg`](../s11-brush.svg)。原生 SVG 路径，5 个 `<path>`，无位图嵌入、字体依赖、滤镜或背景。使用 `currentColor`，默认黑色，适合当前只确认形状的阶段。
- 来源：仓库现有的 [`public/oclr-s11-classic-wordmark-soft.png`](../../../../public/oclr-s11-classic-wordmark-soft.png)，2086 × 754 RGBA。SHA-256：`4c434f55a3f70d4a9fb1722a3210428c7c1518f6ae0d8044ba600a8ce82465b0`。
- 对照：该文件的粉色笔刷 S11 与用户本轮第二张附件 `/tmp/codex-clipboard-QMhmpT.png` 中右侧的 S11 为同一字形；附件在网页背景上显示并缩放。`oclr-s11-classic-wordmark.png` 是另一种紫色手写版本，本稿没有使用它。
- 保留：S 和两根 1 的原始比例、相对位置、斜度、长尖尾，以及笔刷轮廓的刻缺和细线。这里没有换字体或重新设计 S11。
- 去除：深紫描边、发光、背景及 OCLR / 英文全名。原有粉色渐变本轮统一为单色，仅提取字芯形状。
- 几何：源图裁切矩形 `(1293, 178)–(2014, 601)`，右/下边界不包含，字芯尺寸 **721 × 423**；每边 4 单位透明余量，最终 `viewBox="0 0 729 431"`。路径的内部 Potrace 坐标经 `<g>` 变换回这一像素坐标系。1 SVG 单位对应 1 个源图像素。

## 重建

依赖 Python 3、Pillow、NumPy、Potrace 1.16：

```sh
python design/home-visual/revision-04/sources/trace-s11.py
```

脚本采用确定性色彩分离提取粉色字芯：R > 150、R − G > 75、R − B > 15、alpha > 180。随后使用 Potrace（turdsize 2、alphamax 0.7、opttolerance 0.15、unit 10）描摹，去掉面积不超过 2 像素的游离小噪点，保留主笔画轮廓。矢量化对栅格边缘存在亚像素拟合，并非声称恢复了原始字体或原始矢量控制点。

已用 librsvg 按原尺寸渲染检查：S / 1 / 1 的识别、原有细笔刷切口和尖尾均保留；SVG 不包含 `<image>` 或 `<text>`。源图二值轮廓与 SVG 原尺寸渲染轮廓的像素交并比为 99.17%。

本稿沿用仓库已有美术素材，未对素材原始作者或授权作新增声明。
