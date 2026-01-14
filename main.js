/* main.js (v4.2 双语自适应版) */
const { Plugin, PluginSettingTab, Setting, debounce } = require('obsidian');

// --- 1. 定义多语言词典 (Define Translation Dictionary) ---
const TRANSLATIONS = {
    'en': {
        commandName: 'Refresh section styles',
        settingsTitle: 'Folder Section Settings',
        ruleConfigName: 'Rule Configuration',
        ruleConfigDesc: 'Format: Regex:Section Title (e.g., ^0[0-9]_:Inbox)',
        placeholder: '^0[0-9]_:Inbox\n^1[0-9]_:Projects'
    },
    'zh': {
        commandName: '刷新分区样式',
        settingsTitle: '文件夹分节设置',
        ruleConfigName: '分节规则配置',
        ruleConfigDesc: '格式：正则表达式:分节标题 (例如：^0[0-9]_:流入区)',
        placeholder: '^0[0-9]_:流入区\n^1[0-9]_:项目区'
    }
};

// --- 2. 简单的翻译辅助函数 (Helper to pick language) ---
function t(key) {
    const lang = window.localStorage.getItem('language') || 'en';
    // 简单判断：如果是 zh-cn 或 zh-tw 都算 zh，否则默认 en
    // Simple check: treat zh-cn/zh-tw as 'zh', others as 'en'
    const validLang = lang.startsWith('zh') ? 'zh' : 'en';
    return TRANSLATIONS[validLang][key] || TRANSLATIONS['en'][key];
}

const DEFAULT_SETTINGS = {
    // 默认值保留英文示例，因为这是新安装时的默认状态
    // Default settings use English examples
    rulesText: '^0[0-9]_:Inbox\n^1[0-9]_:Projects\n^2[0-9]_:Areas\n^8[0-9]_:Resources\n^9[0-9]_:Archives',
    rules: []
};

module.exports = class FolderSectionPlugin extends Plugin {
    async onload() {
        this.isProcessing = false;
        await this.loadSettings();
        this.addSettingTab(new FolderSectionSettingTab(this.app, this));

        this.addCommand({
            id: 'refresh-folder-sections',
            name: t('commandName'), // <--- 使用翻译函数 (Use translation)
            callback: () => this.applyClasses()
        });

        this.app.workspace.onLayoutReady(() => {
            setTimeout(() => this.applyClasses(), 800);
            this.registerDomObserver();
        });
    }

    onunload() {
        this.removeClasses();
        if (this.observer) this.observer.disconnect();
    }

    registerDomObserver() {
        const debouncedApply = debounce(() => {
            if (!this.isProcessing) {
                this.applyClasses();
            }
        }, 200, true);

        this.observer = new MutationObserver((mutations) => {
            debouncedApply();
        });

        const leaves = this.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length > 0) {
            const view = leaves[0].view;
            this.observer.observe(view.containerEl, { childList: true, subtree: true, attributes: false });
        }
    }

    applyClasses() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        const leaves = this.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length === 0) {
            this.isProcessing = false;
            return;
        }
        
        const view = leaves[0].view;
        const filesContainer = view.containerEl.querySelector('.nav-files-container');
        if (!filesContainer) {
            this.isProcessing = false;
            return;
        }

        const allFolders = view.containerEl.querySelectorAll('.nav-folder');
        const taggedSections = new Set();

        allFolders.forEach(folderEl => {
            // 严格检查是否为根目录 (Strict Root Check)
            if (!this.isRootFolder(folderEl, filesContainer)) {
                folderEl.removeAttribute('data-section-title');
                folderEl.classList.remove('is-section-start');
                return; 
            }

            const titleEl = folderEl.querySelector('.nav-folder-title-content');
            if (!titleEl) return;
            const folderName = titleEl.textContent || "";

            let matchedTitle = null;

            for (const rule of this.settings.rules) {
                try {
                    if (new RegExp(rule.regex).test(folderName)) {
                        matchedTitle = rule.title;
                        break;
                    }
                } catch (e) {}
            }

            if (matchedTitle) {
                if (!taggedSections.has(matchedTitle)) {
                    folderEl.setAttribute('data-section-title', matchedTitle);
                    folderEl.classList.add('is-section-start');
                    taggedSections.add(matchedTitle);
                } else {
                    folderEl.removeAttribute('data-section-title');
                    folderEl.classList.remove('is-section-start');
                }
            } else {
                folderEl.removeAttribute('data-section-title');
                folderEl.classList.remove('is-section-start');
            }
        });

        this.isProcessing = false;
    }

    isRootFolder(folderEl, containerEl) {
        let parent = folderEl.parentElement;
        while (parent && parent !== containerEl) {
            if (parent.classList.contains('nav-folder-children')) {
                return false;
            }
            parent = parent.parentElement;
        }
        return true;
    }

    removeClasses() {
        const folders = document.querySelectorAll('.nav-folder.is-section-start');
        folders.forEach(el => {
            el.classList.remove('is-section-start');
            el.removeAttribute('data-section-title');
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.parseRules();
    }

    async saveSettings() {
        this.parseRules();
        await this.saveData(this.settings);
        this.applyClasses();
    }

    parseRules() {
        if (!this.settings.rulesText) {
            this.settings.rules = [];
            return;
        }
        const lines = this.settings.rulesText.split('\n');
        this.settings.rules = lines
            .map(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    return {
                        regex: parts[0].trim(),
                        title: parts.slice(1).join(':').trim()
                    };
                }
                return null;
            })
            .filter(r => r !== null);
    }
}

class FolderSectionSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        // <--- 使用翻译函数 (Use translation)
        containerEl.createEl('h2', { text: t('settingsTitle') });
        new Setting(containerEl)
            .setName(t('ruleConfigName'))
            .setDesc(t('ruleConfigDesc'))
            .addTextArea(text => text
                .setPlaceholder(t('placeholder'))
                .setValue(this.plugin.settings.rulesText)
                .onChange(async (value) => {
                    this.plugin.settings.rulesText = value;
                    await this.plugin.saveSettings();
                })
            );
        const textarea = containerEl.querySelector('textarea');
        if(textarea) textarea.style.height = '150px';
    }
}