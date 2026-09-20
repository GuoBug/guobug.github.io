---
layout: post
title: "Pi 上的 Pidora 中文化"
title_en: "Localization and Chinese Environment for Pidora on Raspberry Pi"
date: 2014-07-02 22:51:27 +0800
categories: ['Engineering', 'Hardware']
pub_tag: "IoT Notes"
summary: "在树莓派 Raspberry Pi 运行 Pidora 发行版时安装中文字体（cjkuni/wqy）、配置输入法（scim/gcin）及修改 /etc/sysconfig/i18n 语言环境的极简实操配置手册。"
read_time: "2 MIN READ"
tags: ['Raspberry-Pi', 'Linux', 'Hardware']
---

* 安裝中文字形

```
# yum install cjkuni-ukai-fonts cjkuni-uming-fonts taipeifonts wqy-bitmap-fonts wqy-microhei-fonts
```

* 安裝中文輸入法 gcin 或 scim

```
# yum install gcin
```

或

```
# yum install scim scim-tables scim-tables-chinese scim-tables-chinese-extra scim-array scim-chewing
```

* 修改中文環境設定

```
# vi /etc/sysconfig/i18n
```

把

```
LANG="en_US.UTF-8"
```

改成

```
LANG="zh_TW.UTF-8"
```

* 重新開機

功能表已改成中文
