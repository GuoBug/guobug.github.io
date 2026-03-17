[English](README.md) | [中文](README_zh.md)

---

# Gu0Bug Terminal Theme

这是一个极简、硬核的类终端风格（Terminal Aesthetic） Jekyll 个人网站模板，原生支持 GitHub Pages，完全零配置部署。

## 🌟 特性
- **一键部署**：无需本地包含任何构建工具，支持 GitHub Pages 原生编译。
- **内容与结构分离**：通过独立 Markdown 文件控制不同页签，告别修改 HTML。
- **自动文章系统**：将以 `YYYY-MM-DD-title.md` 命名的文件放进 `_posts` 即可自动生成独立文章页面和文章列表。
- **原生 SEO 支持**：内置自动化生成的 `sitemap.xml` 和 `jekyll-seo-tag` 支持。

## 🚀 如何使用这个模板建设你自己的网站？

如果你喜欢这个主题，只需几个步骤就能把它变成你自己的：

### 1. 使用此模板
点击本仓库右上角的绿色按钮 **"Use this template"** -> **"Create a new repository"**，然后将你的新仓库命名为 `你的用户名.github.io`。

### 2. 修改全局配置 (只需改一次)
进入 `_config.yml` 文件，修改你的专属个人信息：
```yaml
title: "YOUR_HANDLE · Terminal"
description: "A terminal-style personal page on GitHub Pages."
author: "你的名字"
github_username: "你的GitHub用户名"
url: "https://你的用户名.github.io" 
```

### 3. 修改网站内容
本模板有 4 个默认的核心页面，直接修改对应的 Markdown 文件即可生效：
- `index.md` => 首页大厅 (HOME)
- `about.md` => 关于我 (ABOUT_ME)
- `projects.md` => 个人项目 (PROJECTS)
- `contact.md` => 联系方式 (CONTACT)

### 4. 发表文章
1. 在 `_posts/` 目录下新建一个 Markdown 文件，命名格式必须是：`年-月-日-文章全名.md`（例如：`2026-03-20-my-first-post.md`）。
2. 在文章开头添加 YAML 头部信息：
```yaml
---
layout: post
title: 文章的显示标题
---
```
3. 在下方写入正文。保存后，GitHub 会自动更新你的站点并在 `POSTS` 页面展示它！

### 5. 自定义 ASCII Logo (进阶)
如果你想更换侧边栏的字符画 Logo，请前往 `_layouts/default.html` 文件，搜索 `<div class="ascii-logo c-cyan">`，将里面的字符画替换为你想要的图案。推荐使用 [TAAG](https://patorjk.com/software/taag/) 生成 ASCII Art。

---

*Based on independent digital nomad aesthetics.*
