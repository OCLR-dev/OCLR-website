# R04 — 形状稿来源

本轮按用户要求建立新稿，R03 保留。字形、滑条和英文全名均输出为 SVG 路径，不含图片、外部字体或滤镜。主体不加入纹理、阴影或角色背景。

- **OCL**：`ocl-mathcal.tex` 中的原文 `\mathcal{OCL}`，经本机 LaTeX 与 dvisvgm `--no-fonts --exact-bbox` 转为路径。实际字体为 Computer Modern Symbols / CMSY10 的数学花体大写；未用替代手写字体或人为加粗。保留 TeX 字距，组合时统一等比放大。
- **R**：见 [R-GEOMETRY.md](R-GEOMETRY.md)。控制点与可见轮廓取自用户提供的 [R 截图](r-reference.png)。截图读数的像素精度与缺失原始谱面文件的限制在几何记录中说明。
- **S11**：见 [S11-SOURCE.md](S11-SOURCE.md)。沿用仓库中与用户第二张图一致的笔刷字芯，确定性矢量描摹，保留原始比例与笔刷切口。
- **英文全名**：`OSU! CHINESE LEAGUE ROOKIE`，Noto Sans Regular 转路径；使用字距展开至 OCLR 宽度。此为全名的大写排印，没有新增比赛信息。
- **准度条**：横向黄／绿／蓝／绿／黄分区与中央零点，放置于 OCLR 与英文全名之间。本轮只确认位置和结构。
- **布局依据**：用户提供的 [横向布局参考](layout-reference.png)。OCL、R 与 S11 均独立等比缩放，没有非等比压扁或倾斜。

Computer Modern 的 AMSFonts 授权与 Noto Sans 均为 SIL Open Font License 1.1。随稿保留 [AMSFonts 授权](AMSFonts-LICENSE.txt) 和 [Noto 授权](Noto-LICENSE.txt)。这里分发的是字形路径构成的美术文档，不是修改后的字体文件。

## 重建

在仓库根目录运行：

```sh
latex -interaction=nonstopmode -halt-on-error -output-directory /tmp design/home-visual/revision-04/sources/ocl-mathcal.tex
dvisvgm --no-fonts --exact-bbox --output=design/home-visual/revision-04/ocl-mathcal.svg /tmp/ocl-mathcal.dvi
python design/home-visual/revision-04/sources/trace-s11.py
python design/home-visual/revision-04/sources/build-r-shape.py
python design/home-visual/revision-04/compose.py
```

R 的独立重建步骤见几何记录。组合脚本需要 Python 3、FontTools、Noto Sans Regular 与 librsvg；生成透明字标、白底 SVG / PNG，并检查矢量元素与 ID 唯一性。
