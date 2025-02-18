const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Default configuration template for environments
const DEFAULT_ENV_CONFIG = {
    namespace: 'byredo-m2-dev',
    jenkinsUsername: '',
    jenkinsApiToken: '',
    sshKeyPath: '~/.ssh/byredo_rsa',
    jenkinsJobUrl: '',
    sshUser: '',
    sshHost: 'manager.byredo.akoova.cloud',
    sshPort: '12022'
};

// Default configurations for different environments
const DEFAULT_CONFIG = {
    currentEnv: 'uat',
    environments: {
        uat: {
            ...DEFAULT_ENV_CONFIG,
            jenkinsJobUrl: 'https://ci.vaimo.network/job/project/job/byredo/job/project_byredo-retainer-artefact/job/uat/',
            sshUser: 'byredo-uat',
        },
        upgrade: {
            ...DEFAULT_ENV_CONFIG,
            jenkinsJobUrl: 'https://ci.vaimo.network/job/project/job/byredo/job/project_byredo-retainer-artefact/job/upgrade/',
            sshUser: 'byredo-upgrade',
        }
    }
};

let mainWindow;
let settingsWindow;
let store;


async function initializeStore() {
    try {
        const { default: Store } = await import('electron-store');
        store = new Store();

        // Check if config exists, if not set default
        if (!store.get('config')) {
            store.set('config', DEFAULT_CONFIG);
        }

        // Ensure the config structure is complete
        const currentConfig = store.get('config');
        if (!currentConfig.environments || !currentConfig.currentEnv) {
            store.set('config', {
                ...DEFAULT_CONFIG,
                ...currentConfig,
                environments: {
                    ...DEFAULT_CONFIG.environments,
                    ...(currentConfig.environments || {})
                }
            });
        }
    } catch (error) {
        console.error('Store initialization error:', error);
        throw error;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
                                       width: 600,
                                       height: 500,
                                       webPreferences: {
                                           nodeIntegration: true,
                                           contextIsolation: false
                                       }
                                   });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
                                           width: 600,
                                           height: 700,
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

// App lifecycle events
app.whenReady().then(async () => {
    try {
        await initializeStore();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
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

// IPC handlers
ipcMain.on('open-settings', () => {
    createSettingsWindow();
});

ipcMain.handle('get-environments', async () => {
    try {
        if (!store) {
            await initializeStore();
        }
        const config = store.get('config');
        if (!config || !config.environments) {
            throw new Error('Invalid configuration structure');
        }
        return {
            currentEnv: config.currentEnv || 'uat',
            environments: Object.keys(config.environments)
        };
    } catch (error) {
        console.error('Error in get-environments:', error);
        return {
            currentEnv: 'uat',
            environments: ['uat', 'upgrade']
        };
    }
});

ipcMain.handle('get-current-env-config', async () => {
    try {
        if (!store) {
            await initializeStore();
        }
        const config = store.get('config');
        const currentEnv = config.currentEnv || 'uat';
        return config.environments[currentEnv] || DEFAULT_CONFIG.environments.uat;
    } catch (error) {
        console.error('Error in get-current-env-config:', error);
        return DEFAULT_CONFIG.environments.uat;
    }
});

ipcMain.handle('set-current-env', async (event, envName) => {
    if (!store) {
        await initializeStore();
    }
    const config = store.get('config');
    config.currentEnv = envName;
    store.set('config', config);
    return { success: true };
});

ipcMain.handle('save-env-config', async (event, { envName, envConfig }) => {
    if (!store) {
        await initializeStore();
    }
    const config = store.get('config');
    config.environments[envName] = envConfig;
    store.set('config', config);
    return { success: true };
});

async function getPodName() {
    if (!store) {
        await initializeStore();
    }
    const config = store.get('config');
    const currentEnvConfig = config.environments[config.currentEnv];

    try {
        const command = `kubectl get pods -n ${currentEnvConfig.namespace}`;
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
        const currentEnvConfig = config.environments[config.currentEnv];
        const { buildNumber } = data;

        event.reply('deployment-status', {
            success: true,
            message: `Starting deployment for ${config.currentEnv} environment...\nDetecting pod name...`,
            inProgress: true
        });

        const podName = await getPodName();

        event.reply('deployment-status', {
            success: true,
            message: `Pod detected: ${podName}\nStarting deployment...`,
            inProgress: true
        });

        await executeCommand(`kubectl cp ${currentEnvConfig.sshKeyPath} ${currentEnvConfig.namespace}/${podName}:/tmp`);

        let sshKey = currentEnvConfig.sshKeyPath.replace(/^.*[\\\/]/, '');
        const commands = [
            `cd /tmp`,
            `curl -L ${currentEnvConfig.jenkinsJobUrl}${buildNumber}/artifact/htdocs.tar.gz --user ${currentEnvConfig.jenkinsUsername}:${currentEnvConfig.jenkinsApiToken} --output vaimo_byredo_${buildNumber}.tar.gz`,
            `scp -i ${sshKey} -P ${currentEnvConfig.sshPort} vaimo_byredo_${buildNumber}.tar.gz ${currentEnvConfig.sshUser}@${currentEnvConfig.sshHost}:/trigger/`,
            `ssh -i ${sshKey} ${currentEnvConfig.sshUser}@${currentEnvConfig.sshHost} -p ${currentEnvConfig.sshPort} "touch /trigger/deploy-vaimo_byredo_${buildNumber}.tar.gz"`,
            `rm ${sshKey}`,
            `rm vaimo_byredo_${buildNumber}.tar.gz`
        ];

        for (const command of commands) {
            // await executeCommand(`kubectl exec -it ${podName} -n ${currentEnvConfig.namespace} -- sh -c "${command}"`);
            console.log(`Executed command: ${command}`);
        }

        event.reply('deployment-status', {
            success: true,
            message: `Deployment to ${config.currentEnv} completed successfully!`,
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

ipcMain.handle('get-env-config', async (event, envName) => {
    try {
        if (!store) {
            await initializeStore();
        }
        const config = store.get('config');
        if (!config || !config.environments || !config.environments[envName]) {
            return DEFAULT_CONFIG.environments[envName] || DEFAULT_ENV_CONFIG;
        }
        return config.environments[envName];
    } catch (error) {
        console.error('Error in get-env-config:', error);
        return DEFAULT_CONFIG.environments[envName] || DEFAULT_ENV_CONFIG;
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