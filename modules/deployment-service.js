const configManager = require('./config-manager');
const commandExecutor = require('../utils/command-executor');
const notificationService = require('./notification-service');
const os = require('os');

/**
 * Handles deployment operations
 */
class DeploymentService {
    /**
     * Get the target Kubernetes pod name
     * @returns {Promise<string>} Pod name
     */
    async getPodName() {
        const config = configManager.getStore().get('config');
        const currentEnvConfig = config.environments[config.currentEnv];

        try {
            const command = `kubectl get pods -n ${currentEnvConfig.namespace}`;
            const output = await commandExecutor.execute(command);

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

    /**
     * Perform deployment of a specific build
     * @param {string} buildNumber - Jenkins build number to deploy
     * @param {Function} statusCallback - Callback for updating deployment status
     * @returns {Promise<Object>} Deployment result
     */
    async performDeployment(buildNumber, statusCallback) {
        const config = configManager.getStore().get('config');
        const currentEnvConfig = config.environments[config.currentEnv];

        try {
            statusCallback({
                               success: true,
                               message: `Starting deployment for ${config.currentEnv} environment...\nDetecting pod name...`,
                               inProgress: true
                           });

            // Send Slack notification if enabled
            if (currentEnvConfig.enableSlack) {
                await notificationService.sendDeploymentStartNotification(buildNumber);
            }

            const podName = await this.getPodName();

            statusCallback({
                               success: true,
                               message: `Pod detected: ${podName}\nStarting deployment...`,
                               inProgress: true
                           });

            await commandExecutor.execute(`kubectl cp ${currentEnvConfig.sshKeyPath} ${currentEnvConfig.namespace}/${podName}:/tmp`);

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
                await commandExecutor.execute(`kubectl exec -it ${podName} -n ${currentEnvConfig.namespace} -- sh -c "${command}"`);
                console.log(`Executed command: ${command}`);
            }

            const successMessage = `Deployment to ${config.currentEnv} completed successfully!`;
            statusCallback({
                               success: true,
                               message: successMessage,
                               inProgress: false
                           });

            // Send Slack completion notification if enabled
            if (currentEnvConfig.enableSlack) {
                await notificationService.sendDeploymentCompleteNotification(buildNumber);
            }

            return { success: true };
        } catch (error) {
            const errorMessage = `Deployment failed: ${error.message}`;
            statusCallback({
                               success: false,
                               message: errorMessage,
                               inProgress: false
                           });

            // Send Slack failure notification if enabled
            if (currentEnvConfig.enableSlack) {
                await notificationService.sendDeploymentFailureNotification(buildNumber, error.message);
            }

            return { success: false, error: error.message };
        }
    }
}

module.exports = new DeploymentService();