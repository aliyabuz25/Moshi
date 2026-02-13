// --- File Management ---

class FileSystem {
    constructor() {
        this.files = {};
        this.folders = {};
        this.root = '/';
        this.writeFile('/index.html', '<!-- Moshi Project -->\n<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div id="app">\n    <h1>Moshi Ready</h1>\n    <p>How can I help you today?</p>\n  </div>\n  <script src="script.js"><\/script>\n</body>\n</html>');
        this.writeFile('/style.css', 'body {\n  font-family: Inter, sans-serif;\n  background: #121212;\n  color: #e0e0e0;\n  padding: 20px;\n}\nh1 { color: #aaddff; }');
        this.writeFile('/script.js', 'console.log("Moshi-v1 environment initialized.");');
    }

    exists(path) { return this.files[path] !== undefined || this.folders[path] !== undefined || path === '/'; }

    writeFile(path, content, handle = null) {
        this.files[path] = { content, handle };
        const parts = path.split('/');
        let current = '';
        for (let i = 1; i < parts.length - 1; i++) {
            current += '/' + parts[i];
            this.folders[current] = true;
        }
    }

    readFile(path) { return this.files[path] ? this.files[path].content : null; }

    renamePath(oldPath, newPath) {
        if (!this.exists(oldPath)) return false;
        if (this.exists(newPath)) return false;
        if (this.files[oldPath] !== undefined) {
            this.files[newPath] = this.files[oldPath]; delete this.files[oldPath];
        } else if (this.folders[oldPath]) {
            this.folders[newPath] = true; delete this.folders[oldPath];
            Object.keys(this.files).forEach(f => {
                if (f.startsWith(oldPath + '/')) {
                    const suffix = f.substring(oldPath.length);
                    this.files[newPath + suffix] = this.files[f]; delete this.files[f];
                }
            });
            Object.keys(this.folders).forEach(f => {
                if (f.startsWith(oldPath + '/')) {
                    const suffix = f.substring(oldPath.length);
                    this.folders[newPath + suffix] = true; delete this.folders[f];
                }
            });
        }
        return true;
    }

    deletePath(path) {
        if (this.files[path] !== undefined) delete this.files[path];
        if (this.folders[path] !== undefined) {
            delete this.folders[path];
            Object.keys(this.files).forEach(f => {
                if (f.startsWith(path + '/')) delete this.files[f];
            });
            Object.keys(this.folders).forEach(f => {
                if (f.startsWith(path + '/')) delete this.folders[f];
            });
        }
    }

    getTree() {
        const tree = { name: 'root', path: '/', type: 'folder', children: [] };
        Object.keys(this.folders).sort().forEach(path => this._addToTree(tree, path, 'folder'));
        Object.keys(this.files).sort().forEach(path => this._addToTree(tree, path, 'file'));
        return tree;
    }

    _addToTree(root, path, type) {
        const parts = path.split('/').filter(p => p);
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            let child = current.children.find(c => c.name === part);
            if (!child) {
                const childType = isLast ? type : 'folder';
                child = { name: part, path: (current.path === '/' ? '' : current.path) + '/' + part, type: childType, children: [] };
                current.children.push(child);
            }
            current = child;
        }
    }
}

const fs = new FileSystem();
let editor = null;
let activePath = null;
let openTabs = [];
const fileHistory = {}; // Stores { path: [history] }

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function () { initEditor(); });

function initEditor() {
    // Define Cursor-inspired Theme
    monaco.editor.defineTheme('moshi-cursor-theme', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6a737d' },
            { token: 'keyword', foreground: 'ff7b72' },
            { token: 'string', foreground: 'a5d6ff' },
            { token: 'function', foreground: 'd2a8ff' },
        ],
        colors: {
            'editor.background': '#0b0d11',
            'editor.foreground': '#d1d5db',
            'editorLineNumber.foreground': '#4b5563',
            'editor.lineHighlightBackground': '#1e2227',
            'editorCursor.foreground': '#3b82f6',
            'editorIndentGuide.background': '#1e2227',
            'editorIndentGuide.activeBackground': '#3b82f6',
        }
    });

    editor = monaco.editor.create(document.getElementById('monaco-container'), {
        value: '',
        language: 'plaintext',
        theme: 'moshi-cursor-theme',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        scrollBeyondLastLine: false,
        padding: { top: 10 }
    });
    editor.onDidChangeModelContent(() => { if (activePath) fs.writeFile(activePath, editor.getValue()); });
    editor.onDidChangeCursorPosition((e) => { document.getElementById('cursor-position').innerText = `Ln ${e.position.lineNumber}, Col ${e.position.column}`; });

    renderFileTree();
    openFile('/index.html');
    Split(['#sidebar', '#main-split'], { sizes: [20, 80], minSize: [180, 400], gutterSize: 4 });
    Split(['.editor-area', '.preview-area'], { sizes: [60, 40], minSize: [200, 200], gutterSize: 4 });
    document.addEventListener('click', () => { document.getElementById('context-menu').style.display = 'none'; });
}

// --- Moshi Status Polling ---
async function pollMoshiStatus() {
    try {
        const res = await fetch('http://localhost:5000/status');
        const data = await res.json();
        const statusEl = document.getElementById('moshi-brain-status');
        if (statusEl) {
            statusEl.innerText = 'Global-Sync: ' + data.sync_status + ' | ' + data.status;
            statusEl.style.color = data.sync_status === 'Synced' ? '#2ecc71' : '#f1c40f';
        }
    } catch (e) { }
}
setInterval(pollMoshiStatus, 3000);

document.getElementById('global-sync-btn').onclick = async () => {
    const btn = document.getElementById('global-sync-btn');
    btn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Syncing...';
    btn.disabled = true;
    try {
        const res = await fetch('http://localhost:5000/ai/sync', { method: 'POST' });
        const data = await res.json();
        appendMessage('System', data.message + ' (Global Brain Updated)');
    } catch (e) {
        appendMessage('System', 'Sync Failed. Backend offline or git not configured.');
    }
    btn.innerHTML = '<i class="codicon codicon-cloud-download"></i> Sync';
    btn.disabled = false;
};

// --- Moshi-v1 AI Integration ---
const chatInput = document.getElementById('chat-input');
const chatHistory = document.getElementById('chat-history');

chatInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const msg = chatInput.value.trim();
        if (!msg) return;
        appendMessage('User', msg);
        chatInput.value = '';
        const thinkingId = showThinking();

        const contextFile = document.getElementById('ai-context-file').value;
        let contextContent = "";
        if (contextFile) {
            contextContent = fs.readFile(contextFile) || "";
        }

        try {
            const response = await fetch('http://localhost:5000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: msg,
                    context: {
                        path: contextFile,
                        content: contextContent
                    }
                })
            });
            if (!response.ok) throw new Error('Backend not reachable');
            hideThinking(thinkingId);
            const data = await response.json();

            if (data.tokens_used) {
                appendMessage('System', `Used ${data.tokens_used} tokens for this reasoning.`, false, true);
            }

            if (data.action === 'start_training') {
                appendMessage('Moshi-v1', 'Initiating training protocol...', false);
                startTrainingStream();
            } else {
                appendMessage('Moshi-v1', data.message, true);
                if (data.files && Object.keys(data.files).length > 0) {
                    for (const [path, content] of Object.entries(data.files)) { fs.writeFile(path, content); }
                    renderFileTree();
                    if (data.files['/index.html']) { openFile('/index.html'); }
                }
            }
        } catch (err) {
            hideThinking(thinkingId);
            appendMessage('System', 'Error: Backend unavailable.', false);
            console.error(err);
        }
    }
});

let thinkingInterval = null;

function showThinking() {
    const id = 'think-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'chat-msg thinking';
    div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span>Moshi is thinking</span>
            <div class="thinking-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
        <div class="token-usage" style="font-size: 10px; margin-top: 4px; opacity: 0.6;">
            <i class="codicon codicon-pulse"></i> Tokens: <span class="live-token-count">0</span>
        </div>
    `;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Start live token polling
    thinkingInterval = setInterval(async () => {
        try {
            const res = await fetch('http://localhost:5000/status');
            const data = await res.json();
            const countEl = div.querySelector('.live-token-count');
            if (countEl && data.total_tokens) countEl.innerText = data.total_tokens.toLocaleString();
        } catch (e) { }
    }, 500);

    return id;
}

function hideThinking(id) {
    if (thinkingInterval) clearInterval(thinkingInterval);
    const el = document.getElementById(id);
    if (el) el.remove();
}

function startTrainingStream() {
    const eventSource = new EventSource('http://localhost:5000/train_stream');
    eventSource.onmessage = function (e) {
        appendMessage('Training', e.data);
        if (e.data.includes('Complete')) {
            eventSource.close();
            appendMessage('System', 'Training Stream Closed.');
        }
    };
    eventSource.onerror = function () {
        eventSource.close();
        appendMessage('System', 'Training Stream Interrupted.');
    };
}

async function typewriter(container, text, speed = 15) {
    const chars = text.split('');
    let currentText = '';
    for (const char of chars) {
        currentText += char;
        container.innerHTML = parseMarkdown(currentText);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        await new Promise(r => setTimeout(r, speed));
    }
}

function parseMarkdown(text) {
    // Simple code block detection for typewriter
    return text.replace(/```([\s\S]*?)```/g, (match, code) => {
        return `<div class="code-block-container">
            <div class="code-header">
                <span>Code Output</span>
                <div class="code-actions">
                    <button class="code-action-btn" onclick="copyToClipboard(\`${code.replace(/`/g, '\\`').trim()}\`)">
                        <i class="codicon codicon-copy"></i> Copy
                    </button>
                    <button class="code-action-btn apply" onclick="applyToCurrentFile(\`${code.replace(/`/g, '\\`').trim()}\`, this)">
                        <i class="codicon codicon-cloud-upload"></i> Apply
                    </button>
                    <button class="code-action-btn revert hidden" onclick="revertFile(this)">
                        <i class="codicon codicon-history"></i> Revert
                    </button>
                </div>
            </div>
            <div class="code-content">${code.trim()}</div>
        </div>`;
    }).replace(/\n/g, '<br>');
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    const btn = event.currentTarget;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="codicon codicon-check"></i> Copied';
    setTimeout(() => btn.innerHTML = oldText, 2000);
};

window.applyToCurrentFile = (code, btn) => {
    if (!activePath) {
        alert("Please open a file first!");
        return;
    }

    // Save history
    if (!fileHistory[activePath]) fileHistory[activePath] = [];
    fileHistory[activePath].push(fs.readFile(activePath));

    fs.writeFile(activePath, code);
    editor.setValue(code);

    if (btn) {
        const container = btn.closest('.code-actions');
        container.querySelector('.revert').classList.remove('hidden');
    }
};

window.revertFile = (btn) => {
    if (!activePath || !fileHistory[activePath] || fileHistory[activePath].length === 0) return;

    const prevContent = fileHistory[activePath].pop();
    fs.writeFile(activePath, prevContent);
    editor.setValue(prevContent);

    if (btn) {
        if (fileHistory[activePath].length === 0) {
            btn.classList.add('hidden');
        }
    }
};

function appendMessage(sender, text, isAI = false, isMetric = false) {
    const div = document.createElement('div');
    const senderClass = isMetric ? 'metric' : (sender.toLowerCase().includes('moshi') ? 'moshi' : (sender === 'User' ? 'user' : 'system'));
    div.className = `chat-msg ${senderClass}`;

    if (isMetric) {
        div.style.fontSize = '10px';
        div.style.padding = '4px 12px';
        div.style.opacity = '0.7';
        div.style.border = 'none';
        div.style.background = 'transparent';
    }

    const name = document.createElement('strong');
    name.innerText = sender + ': ';
    div.appendChild(name);

    const content = document.createElement('div');
    content.className = 'msg-content';
    div.appendChild(content);

    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (isAI) {
        typewriter(content, text);
    } else {
        content.innerHTML = parseMarkdown(text);
    }
}

// --- FS Methods ---
async function openLocalFolder() {
    try {
        const dirHandle = await window.showDirectoryPicker();
        fs.files = {}; fs.folders = {};
        await readDirectory(dirHandle, '');
        renderFileTree();
        if (fs.exists('/index.html')) openFile('/index.html');
        else { const first = Object.keys(fs.files)[0]; if (first) openFile(first); }
    } catch (err) { if (err.name !== 'AbortError') alert('Failed to open folder.'); }
}

async function readDirectory(dirHandle, pathPrefix) {
    for await (const entry of dirHandle.values()) {
        const path = pathPrefix + '/' + entry.name;
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            const text = await file.text();
            fs.writeFile(path, text, entry);
        } else if (entry.kind === 'directory') {
            fs.folders[path] = true;
            await readDirectory(entry, path);
        }
    }
}

document.getElementById('open-folder-btn').onclick = openLocalFolder;

function renderFileTree() {
    const container = document.getElementById('file-explorer');
    container.innerHTML = '';
    const tree = fs.getTree();
    container.appendChild(renderNode(tree, 0));
    updateContextDropdown();
}

function updateContextDropdown() {
    const select = document.getElementById('ai-context-file');
    const currentValue = select.value;
    select.innerHTML = '<option value="">No context</option>';

    Object.keys(fs.files).sort().forEach(path => {
        const option = document.createElement('option');
        option.value = path;
        option.innerText = path;
        if (path === currentValue) option.selected = true;
        select.appendChild(option);
    });
}

function renderNode(node, level) {
    if (node.path === '/') {
        const rootDiv = document.createElement('div');
        node.children.forEach(child => rootDiv.appendChild(renderNode(child, level)));
        return rootDiv;
    }
    const itemWrapper = document.createElement('div');
    const item = document.createElement('div');
    item.className = `tree-item ${node.path === activePath ? 'selected' : ''}`;
    item.style.paddingLeft = `${level * 12 + 10}px`;
    item.dataset.path = node.path;
    let fileIcon = 'codicon-file';
    if (node.name.endsWith('.html')) fileIcon = 'codicon-file-code';
    if (node.name.endsWith('.css')) fileIcon = 'codicon-file-code';
    if (node.name.endsWith('.js')) fileIcon = 'codicon-file-code';
    if (node.type === 'folder') fileIcon = 'codicon-chevron-right';
    const isSrc = node.name === 'src' && node.type === 'folder';
    const iconColor = isSrc ? 'color: #aaddff;' : (node.type === 'folder' ? 'color: #dcb67a;' : '');
    item.innerHTML = `
        <span class="tree-arrow">${node.type === 'folder' ? '<i class="codicon codicon-chevron-right"></i>' : ''}</span>
        <i class="codicon ${node.type === 'folder' ? 'codicon-folder' : fileIcon} tree-icon" style="${iconColor}"></i>
        <span class="tree-label">${node.name}</span>
    `;
    item.onclick = (e) => { e.stopPropagation(); if (node.type === 'file') openFile(node.path); };
    item.oncontextmenu = (e) => handleContextMenu(e, node);
    itemWrapper.appendChild(item);
    if (node.children && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        node.children.forEach(child => childrenContainer.appendChild(renderNode(child, level + 1)));
        itemWrapper.appendChild(childrenContainer);
    }
    return itemWrapper;
}

function openFile(path) {
    if (!fs.exists(path)) return;
    activePath = path;
    if (!openTabs.includes(path)) openTabs.push(path);
    renderTabs(); renderFileTree();
    const content = fs.readFile(path);
    const model = monaco.editor.createModel(content, getLanguage(path));
    editor.setModel(model);
    document.getElementById('breadcrumbs').innerHTML = `<span>${path}</span>`;
    document.getElementById('language-mode').innerText = getLanguage(path).toUpperCase();
}

function closeTab(path, e) {
    if (e) e.stopPropagation();
    const idx = openTabs.indexOf(path);
    if (idx > -1) {
        openTabs.splice(idx, 1);
        if (activePath === path) {
            if (openTabs.length > 0) openFile(openTabs[openTabs.length - 1]);
            else { activePath = null; editor.setModel(null); }
        }
        renderTabs();
    }
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    openTabs.forEach(path => {
        const tab = document.createElement('div');
        tab.className = `tab ${path === activePath ? 'active' : ''}`;
        const name = path.split('/').pop();
        tab.innerHTML = `<span>${name}</span><div class="tab-close"><i class="codicon codicon-close"></i></div>`;
        tab.onclick = () => openFile(path);
        tab.querySelector('.tab-close').onclick = (e) => closeTab(path, e);
        container.appendChild(tab);
    });
}

function getLanguage(path) {
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.js')) return 'javascript';
    return 'plaintext';
}

document.getElementById('ai-chat-toggle').onclick = () => {
    document.getElementById('ai-panel').classList.toggle('visible');
    document.getElementById('ai-chat-toggle').classList.toggle('active');
};

const contextMenu = document.getElementById('context-menu');
let contextTarget = null;
function handleContextMenu(e, node) {
    e.preventDefault(); e.stopPropagation(); contextTarget = node;
    contextMenu.style.top = `${e.clientY}px`; contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.display = 'flex';
}

document.getElementById('ctx-rename').onclick = () => {
    const el = document.querySelector(`div[data-path="${contextTarget.path}"] .tree-label`);
    if (el) makeInlineInput(el, (newName) => {
        const parentPath = contextTarget.path.substring(0, contextTarget.path.lastIndexOf('/'));
        const newPath = (parentPath === '' ? '' : parentPath) + '/' + newName;
        fs.renamePath(contextTarget.path, newPath); renderFileTree();
    });
};
document.getElementById('ctx-delete').onclick = () => { if (confirm('Delete?')) { fs.deletePath(contextTarget.path); renderFileTree(); } };
document.getElementById('ctx-new-file').onclick = () => {
    const base = contextTarget.type === 'folder' ? contextTarget.path : '/';
    const name = prompt('File Name:', 'newfile.js');
    if (name) { fs.writeFile((base === '/' ? '' : base) + '/' + name, ''); renderFileTree(); }
};

function makeInlineInput(element, callback) {
    const originalText = element.innerText;
    element.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'tree-input'; input.value = originalText;
    element.appendChild(input); input.focus(); input.select();
    let committed = false;
    const commit = () => { if (committed) return; committed = true; if (input.value) callback(input.value); else element.innerText = originalText; };
    input.onkeydown = (e) => { if (e.key === 'Enter') commit(); };
    input.onblur = commit;
}


document.getElementById('new-file-btn').onclick = () => {
    const name = prompt('New File Name:', 'index.html');
    if (name) { fs.writeFile('/' + name, ''); renderFileTree(); }
}
