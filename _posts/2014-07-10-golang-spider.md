---
layout: post
title: "用Golang写爬虫和分析程序"
title_en: "Building Web Spiders and Analyzers with Golang"
date: 2014-07-10 23:19:55 +0800
categories: ['Engineering', 'Go']
pub_tag: "Code Practice"
summary: "在缺乏数据库直接查询权限的场景下，使用 Go 语言并发抓取 PC 端 Sitemap XML，解析多层级结构体，提取参数重构无线站点地图（Mobile Sitemap）的实战记录与核心代码实现。"
read_time: "6 MIN READ"
tags: ['golang', 'coding', 'spider', 'sitemap']
---

因为某些原因，需要写个 **无线网站 sitemap**（**手机网站 sitemap**）。
于是开始计划如何实施。

* 首先要确定制作的范围，**手机网站** 的 URL 形式是先要搞定的.需要的 URL 可以分成几类，列表页和各种详情。

例如：“m.example.com/mob/{$1}/{$2}/p{$3}.html”

* 这时候，就需要提供各种参数，可惜，不是开发，得不到数据库使用权限。这样的话本来本来很简单的工作又需要重新想办法处理了。还好 PC 和 **无线网站** 的数据是一样的，实在没办法，还能从之前 PC 网站的 **sitemap** 提取数据在次复用。

* 既然确定了要做什么，并且有了数据，那就开搞~ 因为数据量太大，而且用文本又容易出错。所以就用 **golang** 来写个 **爬虫** ，来爬取 **PC sitemap** ，之后提取数据，重新拼装。

* 开始动手，首先要做 无线的 sitemap ，需要的sitemap采用sitemap协议以及特定的标记和额外命名空间要求。

> ```xml
> <?xml version="1.0" encoding="UTF-8" ?>
> <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0">
> <url>
> <loc>http://mobile.example.com/article100.html</loc>
> <mobile:mobile/>
> </url>
> </urlset>
> ```

注意：来自 [google](https://support.google.com/webmasters/answer/34648?hl=zh-Hans)的建议

> 1、如果要使用 Sitemap 创建工具，您需要查看其是否可以创建移动 Sitemap。
> 2、移动站点地图只能包含提供移动网络内容的网址。Google抓取机制将忽略任何只提供非移动网络内容的网址。如果有非移动内容，请为这些网址创建单独的站点地图。
> 3、如果`<mobile:mobile/>`标记丢失，我们就无法正常抓取您的移动网址。
> 4、支持多种标记语言的网址可在单个站点地图中列出。
> 5、各移动站点地图应使用唯一名称。
> 6、如果使用站点地图生成器创建移动站点地图，您需要为每个移动站点地图创建单独的配置文件。

* 都搞定了，开始编码。使用 **golang** ,首先要解析 **XML** ，使用 `"encoding/xml"`。要从线上取得 sitemap 就要使用 `"net/http"`。其他的目前也用不到。也就不考虑其他高级技能了（笑）。

* 要从线上取得已完成的 sitemap，完成一个http的 GET请求，那么首先要确定请求的内容，为了防止被屏蔽，要设置 **User-Agent** ，这儿可以从报文直接获取到。顺带也把 Host 设置了。

```
User-Agent:
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.114 Safari/537.36
```

之后开始发起”GET”请求

```
//创建个客户端
client := &http.Client{}
//创建请求
req, err := http.NewRequest("GET", url, nil)
if err != nil {
    ///do sth.
}
//从 header 的 map 中取得值，付给请求
for key, value := range header {
    req.Header.Add(key, value)
}
//客户端请求
resp, err := client.Do(req)
if err != nil {
    panic(err)
    //do sth.
}
//用 iotil 读取响应内容 放入 body 字段
body, err := ioutil.ReadAll(resp.Body)
if err != nil {
    panic(err)
    //do sth.
}
// close()
defer resp.Body.Close()
```

* 之后是 **goalng XML 解析** 填入字段，本次要解析的 XML 类型主要有两种，一种是直接包含 URL 的 XML；另一种是包含多条 XML 的集合文件。要使用`"encoding/xml"` 需要多种结构体，来存放数据。

```go
//最内层
type sitemap struct {
XMLName xml.Name `xml:"sitemap"`
Url     string   `xml:"loc"`
time    string   `xml:"lastmod"`
}
//一般 XML 的结构
type urlset struct {
XMLName     xml.Name    `xml:"urlset"`
Loc         []Urlstruct `xml:"url"`
Description string      `xml:",innerxml"`
}
//
type Urlstruct struct {
XMLName xml.Name `xml:"url"`
Url     string   `xml:"loc"`
}
//XML 索引文件
type sitemapindex struct {
XMLName     xml.Name  `xml:"sitemapindex"`
Version     string    `xml:"version,attr"`
Sitemap     []sitemap `xml:"sitemap"`
Description string    `xml:",innerxml"`
}
```

有了结构，需要取出值的方法。

```
//表明变量 v 的类型
v := urlset{}
//通过方法将 body 内容放入结构中
err = xml.Unmarshal(body, &v)
if err != nil {
    panic(err)
}
//之后将取出的内容，处理就好了
for _, v := range v.Loc {
    ///do sth.
}
```

* 之后就是将上述内容写入文件了，也就没什么难点了。唯一要注意的，sitemap 文件是有大小限制的，单个文件最大不能超10M。

其他也就没什么了，好奇了，这种通过数据库分分钟出来的东西，那帮人为何就不做呢？真是无语。

（over）
