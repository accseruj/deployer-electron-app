const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Manages application windows
 */
class WindowManager {
    constructor() {
        this.mainWindow = null;
        this.settingsWindow = null;
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
                                                width: 600,
                                                height: 600,
                                                webPreferences: {
                                                    nodeIntegration: true,
                                                    contextIsolation: false
                                                }
                                            });

        this.mainWindow.loadFile(path.join(__dirname, '../index.html'));

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        return this.mainWindow;
    }

    createSettingsWindow() {
        if (this.settingsWindow) {
            this.settingsWindow.focus();
            return this.settingsWindow;
        }

        this.settingsWindow = new BrowserWindow({
                                                    width: 600,
                                                    height: 800,
                                                    title: 'Settings',
                                                    parent: this.mainWindow,
                                                    modal: true,
                                                    webPreferences: {
                                                        nodeIntegration: true,
                                                        contextIsolation: false
                                                    }
                                                });

        this.settingsWindow.loadFile(path.join(__dirname, '../settings.html'));

        this.settingsWindow.on('closed', () => {
            this.settingsWindow = null;
        });

        return this.settingsWindow;
    }

    closeSettingsWindow() {
        if (this.settingsWindow) {
            this.settingsWindow.close();
        }
    }
}

module.exports = new WindowManager();