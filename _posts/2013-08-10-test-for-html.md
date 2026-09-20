---
layout: post
title: "Markdown编辑时在页面中插入html"
title_en: "Embedding HTML & Video in Markdown Static Generators"
date: 2013-08-10 13:12:35 +0800
categories: ['Engineering', 'Markdown']
pub_tag: "Web Notes"
summary: "从 Flash embed 到 iframe 视频嵌入，记录早期在 Markdown 静态页面中插入原生 HTML 标签的兼容性处理历程（从 Blackfriday 到 Goldmark unsafe 渲染模式的变迁）。"
read_time: "2 MIN READ"
tags: ['Markdown', 'Hugo', 'HTML']
---

这个是用HTML的

试试视频能否运行

    <embed src="http://www.tudou.com/a/JSDyESAuhlQ/&resourceId=0_05_05_99&iid=131550528&bid=05/v.swf" type="application/x-shockwave-flash" allowscriptaccess="always" allowfullscreen="true" wmode="opaque" width="480" height="400"></embed>

> 以下是 update in 2022-03-12:

当年主流还是flash，所以 **“Adobe Flash Player 已不再受支持”**
看了下视频貌似也没了，就算了，这页面就这样吧。

在markdown文件中使用了原始HTML标签。

要在Hugo中使用HTML标签，Hugo默认的渲染器无法正确处理。所以要修改成支持html的 **blackfriday**。

还查到一种选择，使用goldmark和设置unsafe的选项 markup.goldmark.renderer来true：

```
[markup]
  defaultMarkdownHandler = "goldmark"
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true
```

我选择了第一个方式，换个视频重新做了一个。

<iframe src="http://player.vimeo.com/video/42698213?color=e3e3e3" width="500" height="281" frameborder="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>
