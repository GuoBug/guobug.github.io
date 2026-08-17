---
layout: default
title: HOME
---
<span class="c-magenta">#</span> <span class="c-green">Gu0Bug</span>

这里是独立数字空间的节点。记录从企业体制过渡至远程游牧状态的实践数据。

<span class="c-dim">--------------------------------------------------</span>
<span class="c-magenta">##</span> <span class="c-yellow">LATEST_LOGS</span>

{% for post in site.posts limit:5 %}
<div class="log-entry"><span class="c-dim">[{{ post.date | date: "%Y-%m-%d" }}]</span> <a href="{{ post.url | relative_url }}" class="log-title-link"><span class="c-green">{{ post.title }}</span></a>
{% if post.summary %}<span class="log-summary">  └─ {{ post.summary | truncate: 30 }}</span>{% endif %}</div>
{% endfor %}

<span class="c-magenta">##</span> <span class="c-yellow">SYS_STATUS</span>

- 身份定位：支持家族企业稳定运转 / 探索数字游牧
- 运作环境：<span class="c-cyan">Distributed / Remote</span>
- 核心输出：产品管理、远程工作流、技术实践验证
