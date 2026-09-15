---
# ===== Firefly 动态 (dynamic) 模板 · Templater 版 =====
# 存放位置: src/content/dynamic/<文件名>.md   （一个文件 = 一条动态）
# 仅需 published；location / pinned 为可选。
# 时间按字面值显示，末尾自动追加 siteConfig.timezone 对应的时区标识。
# 正文无需标题/描述，支持普通 Markdown；图片会自动归整到内容底部，
# 并支持图片网格、轮播与灯箱放大。
published: <% tp.date.now("YYYY-MM-DD HH:mm:ss") %>
location: 
pinned: false
---

在这里写下你的动态内容……（几行文字即可，无需标题、无需描述）

支持普通 Markdown 语法；直接粘贴图片链接即可，例如：

![图片描述](https://your-cdn.example.com/path/to/photo.jpg)
![图片2](https://your-cdn.example.com/path/to/photo2.jpg)
