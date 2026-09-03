[English](README.md) | [中文](README_zh.md)

---

# GuoBug Terminal Theme

A minimalist, hardcore terminal-aesthetic personal website template powered by Jekyll. Native support for GitHub Pages with absolutely zero configuration required.

## 🌟 Features
- **One-Click Deployment**: No local build tools needed. Natively compiled and deployed by GitHub Pages.
- **Content & Structure Separation**: Control different tabs via independent Markdown files instead of modifying HTML code.
- **Automated Blogging System**: Simply drop a file named `YYYY-MM-DD-title.md` into the `_posts` directory to auto-generate standalone article pages and list views.
- **Native SEO Out-of-the-box**: Auto-generated `sitemap.xml` and built-in `jekyll-seo-tag` support.

## 🚀 How to build your own site with this template?

If you like this theme, you can make it your own in just a few steps:

### 1. Use this template
Click the green **"Use this template"** button at the top right of this repository -> **"Create a new repository"**, and name your new repo `YOUR_USERNAME.github.io`.

### 2. Modify Global Config (Only once)
Open the `_config.yml` file and customize your personal information:
```yaml
title: "YOUR_HANDLE · Terminal"
description: "A terminal-style personal page on GitHub Pages."
author: "Your Name"
github_username: "Your GitHub Username"
url: "https://YOUR_USERNAME.github.io" 
```

### 3. Update Site Content
This template comes with 4 default core pages. Simply edit the corresponding Markdown files:
- `index.md` => Homepage (HOME)
- `about.md` => About Section (ABOUT_ME)
- `projects.md` => Portfolio (PROJECTS)
- `contact.md` => Contact Info (CONTACT)

### 4. Publish Posts
1. Create a new Markdown file in the `_posts/` directory. The naming format must be: `YYYY-MM-DD-title.md` (e.g., `2026-03-20-my-first-post.md`).
2. Add the YAML Front Matter at the top of the file:
```yaml
---
layout: post
title: Your Post Title Displayed Here
---
```
3. Write your content below. Save it, and GitHub will automatically update your site and display it on the `POSTS` page!

### 5. Customize ASCII Logo (Advanced)
If you want to change the ASCII art logo in the sidebar, go to `_layouts/default.html`, search for `<div class="ascii-logo c-cyan">`, and replace the ASCII characters inside. It is recommended to use [TAAG](https://patorjk.com/software/taag/) to generate ASCII Art.

---

*Based on independent digital nomad aesthetics.*
