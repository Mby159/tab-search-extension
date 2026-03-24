# Tab Content Search 🔍

> 一键搜索所有已打开标签页的页面内容，实时高亮匹配文本。  
> Search across all open tabs in real time, with inline highlighting.

支持：**Firefox** · **Chrome** · **Edge** · **Brave** · **所有基于 Chromium 的浏览器**

---

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 实时搜索 | 输入时自动搜索（300ms 防抖），按 Enter 立即触发 |
| 页面高亮 | 在每个标签页中高亮所有匹配位置 |
| 结果摘要 | 弹窗显示每处匹配的前后文摘要 |
| 一键跳转 | 点击结果直接切换到对应标签页并滚动到高亮处 |
| 清除高亮 | 点击 ✕ 清除所有标签页的高亮标记 |

---

## 📦 安装方法

### Firefox（Manifest V2）

1. 地址栏输入 `about:debugging#/runtime/this-firefox`
2. 点击 **"加载临时附加组件…"**
3. 选择本目录下的 **`manifest.json`**
4. 工具栏出现搜索图标即安装成功 ✅

> 临时加载在关闭 Firefox 后会失效，需重新加载。

### Chrome / Edge / Brave（Manifest V3）

1. 把 `manifest-chrome.json` **重命名或复制**为 `manifest.json`（覆盖原文件）
2. 打开浏览器，地址栏输入：
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. 打开右上角 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择本插件所在的目录 ✅

---

## 🗂️ 文件结构

```
tab-search-extension/
├── manifest.json         # Firefox (Manifest V2) 配置
├── manifest-chrome.json  # Chrome/Edge/Brave (Manifest V3) 配置
├── browser-polyfill.js   # 跨浏览器 API 兼容层
├── background.js         # Firefox 后台脚本
├── background-mv3.js     # Chrome MV3 Service Worker
├── content.js            # 内容脚本（注入每个页面）
├── popup.html            # 弹窗 UI
├── popup.js              # 弹窗逻辑
└── icons/
    ├── icon48.png
    └── icon96.png
```

---

## 📝 注意事项

- 仅搜索 `http://` 和 `https://` 协议的页面，`about:`、`chrome:` 等特殊页面不支持
- 高亮在关闭弹窗后仍保留，点击 ✕ 可清除
- Chrome MV3 下 background 为 Service Worker，页面不活跃时可能被回收（正常现象）

---

## 📜 License

MIT
