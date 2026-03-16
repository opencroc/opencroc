/* ═══════════════════════════════════════════════════════════════════════════════
   OpenCroc Studio 3D — UI Manager
   Glass-morphism overlay panels, logs, toasts, sidebars, desk cards
   ═══════════════════════════════════════════════════════════════════════════════ */

const STATUS_LABEL = {
  idle: '空闲', working: '工作中', scanning: '扫描中', navigating: '导航中',
  interacting: '交互中', asserting: '断言中', reporting: '报告中',
  thinking: '思考中', complete: '完成', done: '完成', error: '错误',
};

const STATUS_DOT_CLASS = {
  idle: 'dot-idle', working: 'dot-active', scanning: 'dot-active', navigating: 'dot-active',
  interacting: 'dot-active', asserting: 'dot-active', reporting: 'dot-active',
  thinking: 'dot-active', complete: 'dot-ok', done: 'dot-ok', error: 'dot-err',
};

/* ═══════════════════════════════════════════════════════════════════════════════
   UIManager  —  all DOM operations go through here
   ═══════════════════════════════════════════════════════════════════════════════ */
export class UIManager {

  constructor(state, options) {
    this._state = state;
    this._options = options || {};
    this._callbacks = {};
    this._logCount = 0;
    this._esc = options?.esc || (s => String(s));
    this._ROLE_ICONS = options?.ROLE_ICONS || {};
    this._resolveIcon = options?.resolveRoleIcon || (name => this._ROLE_ICONS[name] || '🐊');
  }

  /* ── init: store callbacks (event binding done in index.html) ────────── */
  init(callbacks) {
    this._callbacks = callbacks || {};
  }

  /* ── setLoading ──────────────────────────────────────────────────────── */
  setLoading(pct, text) {
    const fill = document.getElementById('loading-fill');
    const txt = document.getElementById('loading-text');
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = text || 'Loading…';
  }

  /* ── addLog ──────────────────────────────────────────────────────────── */
  addLog(msg, level = 'info', typewriter = false) {
    const logBody = document.getElementById('log-list');
    if (!logBody) return;

    this._logCount++;
    const ts = new Date();
    const timeStr = ts.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const row = document.createElement('div');
    row.className = `log-row log-${level}`;

    const timePart = `<span class="log-time">${timeStr}</span>`;
    const levelPart = `<span class="log-level ${level}">[${level.toUpperCase()}]</span>`;
    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';

    row.innerHTML = timePart + levelPart;
    row.appendChild(msgSpan);
    logBody.appendChild(row);

    // Auto-scroll
    logBody.scrollTop = logBody.scrollHeight;

    if (typewriter && msg.length > 0) {
      this._typewrite(msgSpan, msg, 0);
    } else {
      msgSpan.textContent = msg;
    }

    // Trim old logs
    while (logBody.children.length > 300) {
      logBody.removeChild(logBody.firstChild);
    }
  }

  _typewrite(el, text, i) {
    if (i < text.length) {
      el.textContent += text[i];
      setTimeout(() => this._typewrite(el, text, i + 1), 12);
    }
  }

  /* ── showToast ───────────────────────────────────────────────────────── */
  showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  /* ── updateSidebar: modules + agent list ─────────────────────────────── */
  updateSidebar(graph, agents) {
    // Module list
    const modList = document.getElementById('mod-list');
    if (modList && graph && graph.nodes) {
      const modules = {};
      graph.nodes.forEach(n => {
        const mod = n.module || 'default';
        if (!modules[mod]) modules[mod] = 0;
        modules[mod]++;
      });

      modList.innerHTML = '';
      Object.entries(modules).forEach(([mod, count]) => {
        const item = document.createElement('div');
        item.className = 'mod-item';
        item.innerHTML = `
          <span class="mod-dot"></span>
          <span class="mod-name">${this._esc(mod)}</span>
          <span class="mod-count">${count}</span>
        `;
        modList.appendChild(item);
      });
    }

    // Agent sidebar
    const agentSidebar = document.getElementById('agent-sidebar');
    if (agentSidebar && agents) {
      agentSidebar.innerHTML = '';
      const entries = Array.isArray(agents) ? agents : Object.entries(agents).map(([name, info]) => ({name, ...info}));
      entries.forEach(agent => {
        const name = agent.name || agent.role || '';
        const status = agent.status || 'idle';
        const role = agent.role || name;
        const item = document.createElement('div');
        item.className = 'agent-sidebar-item';
        const category = agent.category ? ` <span style="font-size:9px;color:var(--text-subtle);opacity:0.7">${this._esc(agent.category)}</span>` : '';
        item.innerHTML = `
          <span class="agent-icon">${this._resolveIcon(role)}</span>
          <span class="agent-name">${this._esc(name)}${category}</span>
          <span class="agent-status-dot ${STATUS_DOT_CLASS[status] || 'dot-idle'}"></span>
          <span class="agent-status-text">${STATUS_LABEL[status] || status}</span>
        `;
        agentSidebar.appendChild(item);
      });
    }
  }

  /* ── updateDeskCards: bottom bar ──────────────────────────────────────── */
  updateDeskCards(agents) {
    const row = document.getElementById('desk-row');
    if (!row || !agents) return;

    const entries = Array.isArray(agents) ? agents : Object.entries(agents).map(([name, info]) => ({name, ...info}));

    // Only rebuild if count changes
    const existing = row.querySelectorAll('.desk-card');
    if (existing.length !== entries.length) {
      row.innerHTML = '';
      entries.forEach(agent => {
        const name = agent.name || agent.role || '';
        const card = document.createElement('div');
        card.className = 'desk-card';
        card.id = `desk-${name}`;
        card.innerHTML = this._renderDeskCard(name, agent);
        row.appendChild(card);
      });
    } else {
      entries.forEach(agent => {
        const name = agent.name || agent.role || '';
        const card = document.getElementById(`desk-${name}`);
        if (card) card.innerHTML = this._renderDeskCard(name, agent);
      });
    }
  }

  _renderDeskCard(name, info) {
    const status = info.status || 'idle';
    const progress = info.progress || 0;
    const role = info.role || name;
    return `
      <div class="dc-icon">${this._resolveIcon(role)}</div>
      <div class="dc-name">${this._esc(name)}</div>
      <div class="dc-status ${STATUS_DOT_CLASS[status] || ''}">${STATUS_LABEL[status] || status}</div>
      <div class="dc-bar"><div class="dc-fill" style="width:${progress}%"></div></div>
      ${info.currentTask ? `<div class="dc-task">${this._esc(info.currentTask)}</div>` : ''}
    `;
  }

  /* ── updateStats: header stat counters ───────────────────────────────── */
  updateStats(graph) {
    if (!graph) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const nodes = graph.nodes || [];
    const modules = new Set(nodes.map(n => n.module || 'default'));
    const models = nodes.filter(n => n.type === 'model');
    const apis = nodes.filter(n => n.type === 'api' || n.type === 'endpoint');

    set('s-mod', modules.size);
    set('s-mdl', models.length);
    set('s-api', apis.length);
    set('s-files', nodes.length);
  }

  /* ── updateResults: test results panel ───────────────────────────────── */
  updateResults(data) {
    const panel = document.getElementById('results-panel');
    if (!panel) return;

    if (!data) {
      panel.innerHTML = '<div class="empty-hint">暂无测试结果</div>';
      return;
    }

    const total = data.total || 0;
    const passed = data.passed || 0;
    const failed = data.failed || 0;
    const skipped = data.skipped || 0;
    const rate = total ? Math.round((passed / total) * 100) : 0;

    panel.innerHTML = `
      <div class="result-summary">
        <div class="result-metric">
          <span class="metric-val">${total}</span>
          <span class="metric-label">总计</span>
        </div>
        <div class="result-metric ok">
          <span class="metric-val">${passed}</span>
          <span class="metric-label">通过</span>
        </div>
        <div class="result-metric err">
          <span class="metric-val">${failed}</span>
          <span class="metric-label">失败</span>
        </div>
        <div class="result-metric warn">
          <span class="metric-val">${skipped}</span>
          <span class="metric-label">跳过</span>
        </div>
        <div class="result-metric accent">
          <span class="metric-val">${rate}%</span>
          <span class="metric-label">通过率</span>
        </div>
      </div>
      ${data.suites ? this._renderSuites(data.suites) : ''}
    `;
  }

  _renderSuites(suites) {
    if (!suites || !suites.length) return '';
    return '<div class="result-suites">' + suites.map(s => `
      <div class="suite-row">
        <span class="suite-icon">${s.passed ? '✅' : '❌'}</span>
        <span class="suite-name">${this._esc(s.name)}</span>
        <span class="suite-dur">${s.duration || '-'}ms</span>
      </div>
    `).join('') + '</div>';
  }

  /* ── updateFileList: scanned files ───────────────────────────────────── */
  updateFileList(files) {
    const panel = document.getElementById('file-list');
    if (!panel) return;

    if (!files || !files.length) {
      panel.innerHTML = '<div class="empty-hint">暂无扫描文件</div>';
      return;
    }

    panel.innerHTML = '<div class="file-list">' + files.map(f => {
      const name = typeof f === 'string' ? f : (f.path || f.name || '');
      const ext = name.split('.').pop().toLowerCase();
      const icon = this._fileIcon(ext);
      return `
        <div class="file-item" data-path="${this._escAttr(name)}">
          <span class="file-icon">${icon}</span>
          <span class="file-name">${this._esc(name)}</span>
        </div>
      `;
    }).join('') + '</div>';

    // Click handlers
    panel.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        const path = el.dataset.path;
        if (path) this._fire('openFile', path);
      });
    });
  }

  _fileIcon(ext) {
    const map = {
      ts: '📘', tsx: '📘', js: '📒', jsx: '📒',
      vue: '💚', css: '🎨', html: '🌐', json: '📋',
      md: '📝', py: '🐍', go: '🐹', rs: '🦀',
      java: '☕', sql: '🗃️', yaml: '⚙️', yml: '⚙️',
    };
    return map[ext] || '📄';
  }

  /* ── updateReports ───────────────────────────────────────────────────── */
  updateReports(reports) {
    const panel = document.getElementById('reports-panel');
    if (!panel) return;

    if (!reports || !reports.length) {
      panel.innerHTML = '<div class="empty-hint">暂无报告</div>';
      return;
    }

    panel.innerHTML = '<div class="report-list">' + reports.map(r => {
      const name = r.name || r.title || 'Report';
      return `
        <div class="report-item" data-id="${this._escAttr(r.id || '')}">
          <span class="report-icon">📊</span>
          <span class="report-name">${this._esc(name)}</span>
          <span class="report-date">${r.date || ''}</span>
        </div>
      `;
    }).join('') + '</div>';

    panel.querySelectorAll('.report-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (id) this._fire('openReport', id);
      });
    });
  }

  /* ── openFilePreview ─────────────────────────────────────────────────── */
  openFilePreview(path, content) {
    const title = document.getElementById('fp-title');
    const body = document.getElementById('fp-code');
    const modal = document.getElementById('file-preview');
    if (title) title.textContent = path;
    if (body) body.textContent = content || '(empty)';
    if (modal) modal.classList.add('visible');
  }

  /* ── openReportPreview ───────────────────────────────────────────────── */
  openReportPreview(reportData) {
    const title = document.getElementById('fp-title');
    const body = document.getElementById('fp-code');
    const modal = document.getElementById('file-preview');
    if (title) title.textContent = reportData.name || 'Report';
    if (body) {
      body.textContent = typeof reportData.content === 'string'
        ? reportData.content : JSON.stringify(reportData, null, 2);
    }
    if (modal) modal.classList.add('visible');
  }

  /* ── Connection status ───────────────────────────────────────────────── */
  setConnected(connected) {
    const dot = document.getElementById('conn-dot');
    if (dot) dot.classList.toggle('connected', connected);
  }

  /* ── Utility ─────────────────────────────────────────────────────────── */
  _bind(id, event, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  }

  _fire(name, ...args) {
    if (this._callbacks[name]) this._callbacks[name](...args);
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
