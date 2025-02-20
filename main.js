const { app, ipcMain } = require('electron');

// Import modules
const ConfigManager = require('./modules/config-manager');
const WindowManager = require('./modules/window-manager');
const DeploymentService = require('./modules/deployment-service');
const NotificationService = require('./modules/notification-service');
const setupIpcHandlers = require('./modules/ipc-handlers');

/**
 * Initialize application
 */
async function init() {
    try {
        // Initialize configuration
        await ConfigManager.initialize();

        // Setup IPC handlers
        setupIpcHandlers(ipcMain, {
            ConfigManager,
            WindowManager,
            DeploymentService,
            NotificationService
        });

        // Create main application window
        WindowManager.createMainWindow();
    } catch (error) {
        console.error('Initialization failed:', error);
        app.quit();
    }
}

// App lifecycle events
app.whenReady().then(init);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        WindowManager.createMainWindow();
    }
});