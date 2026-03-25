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
let searchResults = []; // 保存搜索结果
let selectedTabIndex = -1; // 当前选中的标签索引

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
  statusText.textContent = text;
}

// ── 搜索逻辑 ──────────────────────────────────────────────

function showSpinner() {
  statusBar.className = 'status-bar';
  statusText.innerHTML = ''; // 清空
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  statusText.appendChild(spinner);
  statusText.appendChild(document.createTextNode(' 正在搜索…'));
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

    searchResults = response.results || [];
    selectedTabIndex = searchResults.length > 0 ? 0 : -1;
    renderResults(searchResults, query.trim());
  } catch (e) {
    setStatus('搜索出错：' + e.message, 'no-results');
  }
}

function clearResults() {
  resultsEl.innerHTML = '';
  searchResults = [];
  selectedTabIndex = -1;
}

function renderResults(results, query) {
  clearResults();
  searchResults = results;

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
  statusBar.className = 'status-bar has-results';
  statusText.innerHTML = ''; // 清空
  statusText.appendChild(document.createTextNode('在 '));
  const strong1 = document.createElement('strong');
  strong1.textContent = results.length;
  statusText.appendChild(strong1);
  statusText.appendChild(document.createTextNode(' 个标签页中找到 '));
  const strong2 = document.createElement('strong');
  strong2.textContent = totalCount;
  statusText.appendChild(strong2);
  statusText.appendChild(document.createTextNode(' 处匹配'));

  results.forEach((tab, index) => {
    const card = document.createElement('div');
    card.className = 'tab-card' + (index === 0 ? ' expanded' : '');
    card.dataset.index = index;
    card.dataset.tabId = tab.tabId;

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
        <div class="nav-buttons">
          <button class="nav-btn nav-prev" data-tab-id="${tab.tabId}" title="上一个匹配 (Shift+Enter)">◀ 上一个</button>
          <span class="nav-indicator" id="indicator-${tab.tabId}">1 / ${tab.count}</span>
          <button class="nav-btn nav-next" data-tab-id="${tab.tabId}" title="下一个匹配 (Enter)">下一个 ▶</button>
        </div>
        <button class="focus-btn" data-tab-id="${tab.tabId}">
          → 跳转到该标签页
        </button>
      </div>
    `;

    // 展开/收起
    const header = card.querySelector('.tab-header');
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
      selectedTabIndex = parseInt(card.dataset.index);
      updateSelection();
    });

    // 上一个/下一个导航
    card.querySelector('.nav-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      navigateHighlight(tab.tabId, 'prev');
    });
    card.querySelector('.nav-next').addEventListener('click', (e) => {
      e.stopPropagation();
      navigateHighlight(tab.tabId, 'next');
    });

    // 跳转按钮
    card.querySelector('.focus-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      focusTab(tab.tabId);
    });

    resultsEl.appendChild(card);
  });

  // 默认选中第一个
  selectedTabIndex = 0;
  updateSelection();
}

/**
 * 更新选中状态样式
 */
function updateSelection() {
  document.querySelectorAll('.tab-card').forEach((card, index) => {
    if (index === selectedTabIndex) {
      card.style.borderColor = '#89b4fa';
      card.style.background = '#2a2d45';
    } else {
      card.style.borderColor = '#313244';
      card.style.background = '#24273a';
    }
  });
}

/**
 * 导航到上一个/下一个高亮
 */
async function navigateHighlight(tabId, direction) {
  const action = direction === 'next' ? 'scrollToNext' : 'scrollToPrev';
  try {
    const response = await browser.runtime.sendMessage({ action, tabId });
    if (response && response.ok) {
      // 更新指示器
      const indicator = document.getElementById(`indicator-${tabId}`);
      if (indicator && response.total > 0) {
        indicator.textContent = `${response.index + 1} / ${response.total}`;
      }
    }
  } catch (e) {
    console.error('导航失败:', e);
  }
}

/**
 * 切换到指定标签页
 */
async function focusTab(tabId) {
  try {
    await browser.runtime.sendMessage({ action: 'focusTab', tabId });
    window.close();
  } catch (e) {
    console.error('跳转失败:', e);
  }
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

// ── 键盘导航 ──────────────────────────────────────────────

function handleKeyNavigation(e) {
  const cards = document.querySelectorAll('.tab-card');
  if (cards.length === 0) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedTabIndex = (selectedTabIndex + 1) % cards.length;
      updateSelection();
      cards[selectedTabIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedTabIndex = selectedTabIndex <= 0 ? cards.length - 1 : selectedTabIndex - 1;
      updateSelection();
      cards[selectedTabIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    case 'Enter':
      e.preventDefault();
      if (selectedTabIndex >= 0 && selectedTabIndex < cards.length) {
        const tabId = parseInt(cards[selectedTabIndex].dataset.tabId);
        if (e.shiftKey) {
          navigateHighlight(tabId, 'prev');
        } else {
          // 如果卡片未展开，先展开；否则导航到下一个
          if (!cards[selectedTabIndex].classList.contains('expanded')) {
            cards[selectedTabIndex].classList.add('expanded');
          } else {
            navigateHighlight(tabId, 'next');
          }
        }
      }
      break;
  }
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
  // 在搜索框时也能用方向键导航结果
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    handleKeyNavigation(e);
  }
});

clearBtn.addEventListener('click', clearSearch);

// 结果区域键盘导航
resultsEl.addEventListener('keydown', handleKeyNavigation);

// 打开时自动聚焦
searchInput.focus();
