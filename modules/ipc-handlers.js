/**
 * Setup IPC handlers for main process
 * @param {Object} ipcMain - Electron IPC main instance
 * @param {Object} services - Services to use in handlers
 */
function setupIpcHandlers(ipcMain, services) {
    const {
        ConfigManager,
        WindowManager,
        DeploymentService
    } = services;
    const DeploymentOrchestrator = require('./deployment-orchestrator');

    // Window management
    ipcMain.on('open-settings', () => {
        WindowManager.createSettingsWindow();
    });

    ipcMain.on('close-settings', () => {
        WindowManager.closeSettingsWindow();
    });

    // Configuration
    ipcMain.handle('get-environments', async () => {
        try {
            return ConfigManager.getEnvironments();
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
            return ConfigManager.getCurrentEnvConfig();
        } catch (error) {
            console.error('Error in get-current-env-config:', error);
            return ConfigManager.DEFAULT_CONFIG.environments.uat;
        }
    });

    ipcMain.handle('set-current-env', async (event, envName) => {
        return ConfigManager.setCurrentEnv(envName);
    });

    ipcMain.handle('save-env-config', async (event, data) => {
        return ConfigManager.saveEnvConfig(data);
    });

    ipcMain.handle('get-env-config', async (event, envName) => {
        try {
            return ConfigManager.getEnvConfig(envName);
        } catch (error) {
            console.error('Error in get-env-config:', error);
            return ConfigManager.DEFAULT_CONFIG.environments[envName] || ConfigManager.DEFAULT_ENV_CONFIG;
        }
    });

    // Deployment
    ipcMain.on('start-deployment', async (event, data) => {
        await DeploymentService.performDeployment(
            data.buildNumber,
            (status) => event.reply('deployment-status', status)
        );
    });

    ipcMain.handle('get-latest-build', async () => {
        try {
            return await DeploymentService.getLatestBuildNumber();
        } catch (error) {
            console.error('Error getting latest build:', error);
            throw error.message;
        }
    });

    ipcMain.handle('test-jenkins-connection', async () => {
        return await DeploymentService.testJenkinsConnection();
    });

    ipcMain.on('start-smart-deployment', async (event, data) => {
        // Update config based on checkbox state
        const config = ConfigManager.getStore().get('config');
        config.deploymentConfig.autoDeploySuccessfulBuild = data.autoDeployBuild;
        ConfigManager.getStore().set('config', config);

        // Start the orchestrated deployment
        await DeploymentOrchestrator.orchestrateDeployment(
            (status) => event.reply('smart-deployment-status', status)
        );
    });
}

module.exports = setupIpcHandlers;