// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Default configuration
const DEFAULT_CONFIG = {
    namespace: 'byredo-m2-dev',
    jenkinsUsername: '',
    jenkinsApiToken: '',
    sshKeyPath: '~/.ssh/byredo_rsa'
};

let mainWindow;
let settingsWindow;
let store;

async function initializeStore() {
    const { default: Store } = await import('electron-store');
    store = new Store();

    if (!store.get('config')) {
        store.set('config', DEFAULT_CONFIG);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
                                       width: 600,
                                       height: 400,
                                       webPreferences: {
                                           nodeIntegration: true,
                                           contextIsolation: false
                                       }
                                   });

    mainWindow.loadFile('index.html');
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
                                           width: 600,
                                           height: 500,
                                           title: 'Settings',
                                           parent: mainWindow,
                                           modal: true,
                                           webPreferences: {
                                               nodeIntegration: true,
                                               contextIsolation: false
                                           }
                                       });

    settingsWindow.loadFile('settings.html');

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

// Initialize app
app.whenReady().then(async () => {
    try {
        await initializeStore();
        createWindow();
    } catch (error) {
        console.error('Failed to initialize:', error);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers
ipcMain.on('open-settings', () => {
    createSettingsWindow();
});

ipcMain.handle('get-config', async () => {
    if (!store) {
        await initializeStore();
    }
    return store.get('config');
});

ipcMain.handle('save-config', async (event, newConfig) => {
    if (!store) {
        await initializeStore();
    }
    store.set('config', newConfig);
    return { success: true };
});

async function getPodName() {
    if (!store) {
        await initializeStore();
    }
    const config = store.get('config');
    try {
        const command = `kubectl get pods -n ${config.namespace}`;
        const output = await executeCommand(command);

        const lines = output.split('\n');
        const podLine = lines.find(line => line.includes('magento2-web-'));

        if (!podLine) {
            throw new Error('No magento2-web pod found');
        }

        return podLine.split(/\s+/)[0];
    } catch (error) {
        throw new Error(`Failed to get pod name: ${error.message}`);
    }
}

ipcMain.on('start-deployment', async (event, data) => {
    try {
        if (!store) {
            await initializeStore();
        }
        const config = store.get('config');
        const { buildNumber } = data;

        event.reply('deployment-status', {
            success: true,
            message: 'Detecting pod name...',
            inProgress: true
        });

        const podName = await getPodName();

        event.reply('deployment-status', {
            success: true,
            message: `Pod detected: ${podName}\nStarting deployment...`,
            inProgress: true
        });

        await executeCommand(`kubectl cp ${config.sshKeyPath} ${config.namespace}/${podName}:/tmp`);

        const commands = [
            `cd /tmp`,
            `curl -L https://ci.vaimo.network/job/project/job/byredo/job/project_byredo-retainer-artefact/job/uat/${buildNumber}/artifact/htdocs.tar.gz --user ${config.jenkinsUsername}:${config.jenkinsApiToken} --output vaimo_byredo_${buildNumber}.tar.gz`,
            `scp -i byredo_rsa -P 12022 vaimo_byredo_${buildNumber}.tar.gz serge-test@manager.byredo.akoova.cloud:/trigger/`,
            `ssh -i byredo_rsa serge-test@manager.byredo.akoova.cloud -p 12022 "touch /trigger/deploy-vaimo_byredo_${buildNumber}.tar.gz"`,
            `rm byredo_rsa`,
            `rm vaimo_byredo_${buildNumber}.tar.gz`
        ];

        for (const command of commands) {
            await executeCommand(`kubectl exec -it ${podName} -n ${config.namespace} -- sh -c "${command}"`);
        }

        event.reply('deployment-status', {
            success: true,
            message: 'Deployment completed successfully!',
            inProgress: false
        });
    } catch (error) {
        event.reply('deployment-status', {
            success: false,
            message: `Deployment failed: ${error.message}`,
            inProgress: false
        });
    }
});

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}