/**
 * popup.js — 搜索弹窗逻辑
 */

const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const resultsEl = document.getElementById('results');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');

let debounceTimer = null;
let lastQuery = '';

// ── 工具函数 ──────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 在摘要文本中标记高亮（大小写不敏感）
 */
function highlightSnippet(snippet, query) {
  const escaped = escapeHtml(snippet);
  if (!query) return escaped;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function setStatus(text, type) {
  statusBar.className = 'status-bar' + (type ? ` ${type}` : '');
  statusText.innerHTML = text;
}

// ── 搜索逻辑 ──────────────────────────────────────────────

function showSpinner() {
  setStatus('<span class="spinner"></span> 正在搜索…');
}

async function doSearch(query) {
  if (!query || query.trim() === '') {
    clearResults();
    setStatus('输入关键词开始搜索');
    return;
  }

  lastQuery = query;
  showSpinner();

  try {
    const response = await browser.runtime.sendMessage({
      action: 'searchAll',
      query: query.trim()
    });

    if (query !== lastQuery) return; // 已被新查询覆盖

    renderResults(response.results, query.trim());
  } catch (e) {
    setStatus('搜索出错：' + e.message, 'no-results');
  }
}

function clearResults() {
  resultsEl.innerHTML = '';
}

function renderResults(results, query) {
  clearResults();

  if (!results || results.length === 0) {
    setStatus(`未找到 "${escapeHtml(query)}" 的匹配结果`, 'no-results');
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔎</div>
        <p>在所有标签页中未找到匹配内容</p>
      </div>
    `;
    return;
  }

  const totalCount = results.reduce((sum, r) => sum + r.count, 0);
  setStatus(
    `在 <strong>${results.length}</strong> 个标签页中找到 <strong>${totalCount}</strong> 处匹配`,
    'has-results'
  );

  results.forEach(tab => {
    const card = document.createElement('div');
    card.className = 'tab-card';

    const snippetsHtml = tab.snippets
      .map(s => `<div class="snippet">${highlightSnippet(s, query)}</div>`)
      .join('');

    const faviconHtml = tab.favicon
      ? `<img class="tab-favicon" src="${escapeHtml(tab.favicon)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="tab-favicon-placeholder" style="display:none">🌐</div>`
      : `<div class="tab-favicon-placeholder">🌐</div>`;

    card.innerHTML = `
      <div class="tab-header">
        ${faviconHtml}
        <span class="tab-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
        <span class="tab-count">${tab.count}</span>
        <span class="tab-toggle">▼</span>
      </div>
      <div class="tab-snippets">
        <div class="tab-url" title="${escapeHtml(tab.url)}">${escapeHtml(tab.url)}</div>
        ${snippetsHtml}
        <button class="focus-btn" data-tab-id="${tab.tabId}">
          → 跳转到该标签页
        </button>
      </div>
    `;

    // 展开/收起
    const header = card.querySelector('.tab-header');
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    // 默认展开有结果的卡片
    if (results.length <= 5) {
      card.classList.add('expanded');
    }

    // 跳转按钮
    card.querySelector('.focus-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(e.target.dataset.tabId, 10);
      browser.runtime.sendMessage({ action: 'focusTab', tabId });
      window.close();
    });

    resultsEl.appendChild(card);
  });
}

// ── 清除 ──────────────────────────────────────────────────

async function clearSearch() {
  searchInput.value = '';
  lastQuery = '';
  clearResults();
  setStatus('输入关键词开始搜索');
  try {
    await browser.runtime.sendMessage({ action: 'clearAll' });
  } catch (_) {}
  searchInput.focus();
}

// ── 事件绑定 ──────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value;
  if (!query.trim()) {
    clearSearch();
    return;
  }
  debounceTimer = setTimeout(() => doSearch(query), 300);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    doSearch(searchInput.value);
  }
  if (e.key === 'Escape') {
    clearSearch();
  }
});

clearBtn.addEventListener('click', clearSearch);

// 打开时自动聚焦
searchInput.focus();
