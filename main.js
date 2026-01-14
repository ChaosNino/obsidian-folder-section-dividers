/* main.js (v4.3 极简前缀匹配版) */
const { Plugin, PluginSettingTab, Setting, debounce } = require('obsidian');

// --- 1. 定义多语言词典 (Define Translation Dictionary) ---
const TRANSLATIONS = {
    'en': {
        commandName: 'Refresh section styles',
        settingsTitle: 'Folder Section Settings',
        ruleConfigName: 'Rule Configuration',
        // 修改说明：不再提及正则，强调前缀匹配
        ruleConfigDesc: 'Format: Folder Prefix:Section Title. (Matches if folder name starts with the prefix)',
        placeholder: '00_:Inbox\n01_:Projects\nDaily:Journal'
    },
    'zh': {
        commandName: '刷新分区样式',
        settingsTitle: '文件夹分节设置',
        ruleConfigName: '分节规则配置',
        // 修改说明：不再提及正则，强调前缀匹配
        ruleConfigDesc: '格式：文件夹前缀:分节标题 (例如输入 "00_" 可匹配 "00_Inbox" 或 "00_收集箱")',
        placeholder: '00_:流入区\n01_:项目区\nDaily:日记'
    }
};

// --- 2. 简单的翻译辅助函数 ---
function t(key) {
    const lang = window.localStorage.getItem('language') || 'en';
    const validLang = lang.startsWith('zh') ? 'zh' : 'en';
    return TRANSLATIONS[validLang][key] || TRANSLATIONS['en'][key];
}

const DEFAULT_SETTINGS = {
    // 默认值改为更直观的前缀形式
    rulesText: '00_:Inbox\n01_:Projects\n02_:Areas\n08_:Resources\n09_:Archives',
    rules: []
};

module.exports = class FolderSectionPlugin extends Plugin {
    async onload() {
        this.isProcessing = false;
        await this.loadSettings();
        this.addSettingTab(new FolderSectionSettingTab(this.app, this));

        this.addCommand({
            id: 'refresh-folder-sections',
            name: t('commandName'),
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
            // 严格检查是否为根目录
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
                // --- 核心修改：使用 startsWith 替代正则 ---
                // 只要文件夹名是以配置的 prefix 开头，就算匹配成功
                // 输入 "Box" 不会匹配 "Inbox"，但会匹配 "BoxProject"
                if (folderName.startsWith(rule.prefix)) {
                    matchedTitle = rule.title;
                    break;
                }
            }

            if (matchedTitle) {
                // 确保同一个分节标题只出现一次（如果你希望每个匹配的文件夹都显示，可以去掉这个 if 判断）
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
                // 简单的分割逻辑
                const parts = line.split(':');
                if (parts.length >= 2) {
                    return {
                        // 使用 prefix 语义更清晰
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
