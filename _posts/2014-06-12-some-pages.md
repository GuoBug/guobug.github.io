---
layout: post
title: "Html5页面如何图片叠加等"
title_en: "Image Overlay Techniques in HTML5 and CSS"
date: 2014-06-12 15:17:28 +0800
categories: ['Frontend']
pub_tag: "Web Notes"
summary: "早期移动端 Web 开发中实现图片与图层叠加的三种方案对比：使用 CSS position:fixed 与 z-index、使用绝对定位 DIV 容器包裹、以及将底层图设为 DIV 背景的优缺点分析。"
read_time: "3 MIN READ"
tags: ['HTML5', 'CSS', 'Frontend']
---

### 如何实现网页图片的叠加？

* 使用CSS控制图片

在两张图片标签上，将添加 *CSS* 属性 **“position:fixed”** ，并且设置图片的层级。
层级的设置是在 *CSS* 中添加 **“z-index:{X}”** 。这里 {X} 为层级，赋值为2的层级，在值为1的上方。

但是这种方法设置，需要手动调整两张图的位置（ *width*,*height*,*left*,*right*,*top*,*bottom*等）。

```
……
<img src="我在下面.png" width="100%" style="z-index:1; position:fixed"/
\<img src="我在上面.png" width="100%" …… style="z-index:2; position:fixed">
……
```

* 使用 CSS 控制 DIV

这中方法类似，不过是在将图片包裹在 *DIV* 中，并且在 *DIV* 中控制块的位置。

之后在控制图片在 *DIV* 中的位置。

```html
<div id="web_bg" style="width:100%; height:100%; z-index:1; position:absolute;left:0px">
<img src="sepopup.png" width="100%"/>
</div>
<div id="web_btn" align="center" style="width:60%; height:100%; position:absolute; z-index: 2;left:20%">
<img src="btn_continue.png" width="100%" class="pos_right">
</div>
```

* 将底部图片作为 *DIV* 背景

这种方法是比较简单的，将 *DIV* 块大小设置成需要图片的大小，之后在块内添加图片。
好处就是在 HTML 内，位置更好判断。

```html
<div id="web_main" style="width:100%; height:80%; position:absolute;background:url(底层图片.png) repeat-x 0 0;background-size:100%;">
<img id="btn" src="上层图片.png" align="center" style="width:65% ;position: absolute;top: 85%;left: 17.5%;" >
</div>
```

这样就实现了不同图片的叠加。
