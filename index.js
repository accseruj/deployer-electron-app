// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
                                       width: 800,
                                       height: 600,
                                       webPreferences: {
                                           nodeIntegration: true,
                                           contextIsolation: false
                                       }
                                   });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

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

ipcMain.on('start-deployment', async (event, data) => {
    const {
        buildNumber,
        username,
        apiToken,
        namespace,
        podName,
        sshKeyPath
    } = data;

    try {
        // Copy SSH key to pod
        await executeCommand(`kubectl cp ${sshKeyPath} ${namespace}/${podName}:/tmp`);

        // Execute commands in pod
        const commands = [
            `cd /tmp`,
            `curl -L https://ci.vaimo.network/job/project/job/byredo/job/project_byredo-retainer-artefact/job/uat/${buildNumber}/artifact/htdocs.tar.gz --user ${username}:${apiToken} --output vaimo_byredo_${buildNumber}.tar.gz`,
            `scp -i byredo_rsa -P 12022 vaimo_byredo_${buildNumber}.tar.gz serge-test@manager.byredo.akoova.cloud:/trigger/`,
            // `ssh -i byredo_rsa serge-test@manager.byredo.akoova.cloud -p 12022 "touch /trigger/deploy-vaimo_byredo_${buildNumber}.tar.gz"`,
            `rm byredo_rsa`,
            `rm vaimo_byredo_${buildNumber}.tar.gz`
        ];

        for (const command of commands) {
            await executeCommand(`kubectl exec -it ${podName} -n ${namespace} -- sh -c "${command}"`);
        }

        event.reply('deployment-status', { success: true, message: 'Deployment completed successfully!' });
    } catch (error) {
        event.reply('deployment-status', { success: false, message: `Deployment failed: ${error.message}` });
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