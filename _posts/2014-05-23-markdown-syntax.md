---
layout: post
title: "Markdown 语法对照"
title_en: "Markdown Syntax Quick Reference"
date: 2014-05-24 14:46:42 +0800
categories: ['Engineering', 'Markdown']
pub_tag: "Cheatsheet"
summary: "整理常用的 Markdown 格式对照表：标题层级、引用区块、有序/无序列表、代码块原生转义、分隔线与行内/引用链接的使用规范。"
read_time: "4 MIN READ"
tags: ['Markdown', 'Cheatsheet']
---

Markdown 常用语法：

### 1.  标题

markdown 形式

```
这里为H1标题
============
这里为H2标题
------------

或者

# 这里为H1标题

##这里为H2标题

这里#可拓展到6个，也就是到 H6
```

效果
> H1:
>
> 这里为 H2 标题
> ————

---

### 2.  区块

markdown 形式

```
> # 段落内 H1
> 段落内容
> * 段落列表
>
```

---

### 3.  列表

有序列表的编号其实并不那么重要，因为在 **markdown** 在处理过程中会重编号。
markdown 形式

```
1. 无序列表使用星号、加号或是减号作为列表标记

    * 段落列表
    等价于
    - 列表
    等价于 
    + 列表
2. 序列表使用数字接着一个英文句点

    1. 内容
    2. 内容
    3. 内容
```

---

### 4.  引用与区域块

在不需要解释 **Markdown** 的时候，可以使用[*块*]，这样页面会将解释代码包含在`<pre>`和`<code>`中,直接显示 **markdown** 的源代码

markdown 形式

```
正常文字

    需要显示的 markdown 代码内容，或者其他需要直接显示的代码
    直接显示代码
    而且是直接按照文档格式输出
    ###   ****
```

---

### 5.  转意符与分隔符

像有些符号用 **HTML** ，比较好打出，在 markdown 中也提供了支持，比如“`<div>©</div>`”，在 markdown 中可以直接这样打出 `<div>©</div>`。

还有水平分隔符，在一行里只放三个或更多个连字符，或星号或下划线，你就会得到一个水平线标记(`
---
`)。下面每一行都会得到一个水平线：

```
* * *
***
********
- - -
--------------
```

---

### 6.  链接

链接的两种方式，*行内链接* 和 *引用链接*

```
1. 行内链接
    内容[链接](http://example.com “title”)内容
    访问[about me](/about/)
2. 应用链接
    内容[示例][id]内容
    页面其他位置：
    [id]: http://example.com  "title"
    or
    link to [google][],please click.
    [google]: http://google.com   "google"
```
