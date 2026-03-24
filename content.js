/**
 * content.js — 注入到每个标签页，响应来自 background 的搜索请求
 */

// 保存高亮节点引用，便于清除
let highlightedNodes = [];
let currentMarkElements = [];

/**
 * 在页面文本中搜索关键词，返回匹配摘要列表
 */
function searchInPage(query) {
  // 先清除上次高亮
  clearHighlights();

  if (!query || query.trim() === '') return [];

  const results = [];
  const lowerQuery = query.toLowerCase();

  // 用 TreeWalker 遍历所有文本节点
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        // 跳过脚本、样式、不可见元素
        const tag = node.parentElement && node.parentElement.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.textContent.trim() === '') return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const matchedNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent;
    if (text.toLowerCase().includes(lowerQuery)) {
      matchedNodes.push(node);
    }
  }

  // 高亮并收集摘要
  matchedNodes.forEach((textNode) => {
    const snippets = extractSnippets(textNode.textContent, lowerQuery, query);
    snippets.forEach(s => results.push(s));
    highlightNode(textNode, query);
  });

  return results;
}

/**
 * 提取匹配片段（带上下文）
 */
function extractSnippets(text, lowerQuery, query) {
  const snippets = [];
  const lowerText = text.toLowerCase();
  let pos = 0;

  while (true) {
    const idx = lowerText.indexOf(lowerQuery, pos);
    if (idx === -1) break;

    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + lowerQuery.length + 40);
    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = '…' + snippet;
    if (end < text.length) snippet = snippet + '…';

    snippets.push(snippet);
    pos = idx + lowerQuery.length;
  }

  return snippets;
}

/**
 * 高亮文本节点中所有匹配项
 */
function highlightNode(textNode, query) {
  const parent = textNode.parentElement;
  if (!parent) return;

  const text = textNode.textContent;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts = [];
  let lastIdx = 0;

  while (true) {
    const idx = lowerText.indexOf(lowerQuery, lastIdx);
    if (idx === -1) break;

    // 前面普通文本
    if (idx > lastIdx) {
      parts.push(document.createTextNode(text.slice(lastIdx, idx)));
    }

    // 高亮 span
    const mark = document.createElement('mark');
    mark.className = '__tab_search_highlight__';
    mark.style.cssText = 'background:#ff0;color:#000;border-radius:2px;padding:0 1px;';
    mark.textContent = text.slice(idx, idx + query.length);
    parts.push(mark);
    currentMarkElements.push(mark);

    lastIdx = idx + query.length;
  }

  if (parts.length === 0) return;

  // 追加剩余文本
  if (lastIdx < text.length) {
    parts.push(document.createTextNode(text.slice(lastIdx)));
  }

  // 用 fragment 替换原始文本节点
  const fragment = document.createDocumentFragment();
  parts.forEach(p => fragment.appendChild(p));
  parent.replaceChild(fragment, textNode);
  highlightedNodes.push({ parent, parts });
}

/**
 * 清除所有高亮
 */
function clearHighlights() {
  currentMarkElements.forEach(mark => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
  });
  currentMarkElements = [];
  highlightedNodes = [];
}

/**
 * 滚动到第一个高亮元素
 */
function scrollToFirstHighlight() {
  if (currentMarkElements.length > 0) {
    currentMarkElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// 监听来自 background 的消息
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'search') {
    const snippets = searchInPage(message.query);
    sendResponse({ snippets, count: currentMarkElements.length });
  } else if (message.action === 'clear') {
    clearHighlights();
    sendResponse({ ok: true });
  } else if (message.action === 'scrollToFirst') {
    scrollToFirstHighlight();
    sendResponse({ ok: true });
  }
  return true;
});
