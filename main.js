/* main.js (v4.5 语法修复版) */
const { Plugin, PluginSettingTab, Setting, debounce, Platform } = require('obsidian');

// --- 多语言支持 ---
const TRANSLATIONS = {
    'en': {
        commandName: 'Refresh section styles',
        settingsTitle: 'Folder Section Settings',
        ruleConfigName: 'Rule Configuration',
        ruleConfigDesc: 'Format: Prefix:Title (e.g., 00_:Inbox)',
        placeholder: '00_:Inbox\n01_:Projects'
    },
    'zh': {
        commandName: '刷新分区样式',
        settingsTitle: '文件夹分节设置',
        ruleConfigName: '分节规则配置',
        ruleConfigDesc: '格式：前缀:标题 (例如 "00_" 匹配 "00_Inbox")',
        placeholder: '00_:流入区\n01_:项目区'
    }
};

function t(key) {
    const lang = window.localStorage.getItem('language') || 'en';
    const validLang = lang.startsWith('zh') ? 'zh' : 'en';
    return TRANSLATIONS[validLang][key] || TRANSLATIONS['en'][key];
}

const DEFAULT_SETTINGS = {
    rulesText: '00_:Inbox\n01_:Projects\n02_:Areas\n08_:Resources\n09_:Archives',
    rules: []
};

module.exports = class FolderSectionPlugin extends Plugin {
    async onload() {
        this.isProcessing = false;
        this.observer = null;

        await this.loadSettings();
        this.addSettingTab(new FolderSectionSettingTab(this.app, this));

        this.addCommand({
            id: 'refresh-folder-sections',
            name: t('commandName'),
            callback: () => {
                this.applyClasses();
            }
        });

        this.app.workspace.onLayoutReady(() => {
            const initDelay = Platform.isMobile ? 1500 : 800;
            
            // 多轮尝试机制 (箭头函数写法优化，防止语法歧义)
            setTimeout(() => { this.tryInitialize(); }, initDelay);
            setTimeout(() => { this.tryInitialize(); }, 3000);
            setTimeout(() => { this.tryInitialize(); }, 5000);
        });
    }

    tryInitialize() {
        this.applyClasses();
        if (!this.observer) {
            this.registerDomObserver();
        }
    }

    onunload() {
        this.removeClasses();
        if (this.observer) this.observer.disconnect();
        this.observer = null;
    }

    registerDomObserver() {
        const leaves = this.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length === 0) return;

        const debouncedApply = debounce(() => {
            if (!this.isProcessing) {
                this.applyClasses();
            }
        }, 200, true);

        this.observer = new MutationObserver((mutations) => {
            debouncedApply();
        });

        const view = leaves[0].view;
        this.observer.observe(view.containerEl, { childList: true, subtree: true, attributes: false });
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
            // 严格根目录检查
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
                // 前缀匹配
                if (folderName.startsWith(rule.prefix)) {
                    matchedTitle = rule.title;
                    break;
                }
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
        if (folders) {
            folders.forEach(el => {
                el.classList.remove('is-section-start');
                el.removeAttribute('data-section-title');
            });
        }
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
                        prefix: parts[0].trim(),
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
