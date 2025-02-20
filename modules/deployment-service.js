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

    // Add inside the DeploymentService class
    async getLatestBuildNumber() {
        try {
            const config = configManager.getStore().get('config');
            const currentEnvConfig = config.environments[config.currentEnv];

            // Extract job name from the Jenkins job URL
            const jobUrlParts = currentEnvConfig.jenkinsJobUrl.split('/');
            const jobIndex = jobUrlParts.findIndex(part => part === 'job');
            const jobName = jobUrlParts[jobIndex + 1];

            // Construct the API URL to get the latest build info
            const apiUrl = `${currentEnvConfig.jenkinsJobUrl}/lastSuccessfulBuild/api/json`;

            // Use curl with appropriate options for authentication and handling redirects
            const curlCommand = `curl -s -L -u "${currentEnvConfig.jenkinsUsername}:${currentEnvConfig.jenkinsApiToken}" "${apiUrl}"`;
            console.log(`Executing: ${curlCommand.replace(currentEnvConfig.jenkinsApiToken, '****')}`);

            const output = await commandExecutor.execute(curlCommand);

            // Check if response starts with HTML doctype, which indicates an error
            if (output.trim().startsWith('<!DOCTYPE') || output.trim().startsWith('<html')) {
                throw new Error('Received HTML instead of JSON. Authentication may have failed.');
            }

            try {
                const buildInfo = JSON.parse(output);
                return buildInfo.number.toString();
            } catch (jsonError) {
                console.error('Failed to parse Jenkins response:', output.substring(0, 200) + '...');
                throw new Error('Received invalid JSON from Jenkins API');
            }
        } catch (error) {
            console.error('Error fetching latest build from Jenkins:', error);
            throw new Error(`Failed to get latest build: ${error.message}`);
        }
    }

    async testJenkinsConnection() {
        try {
            const config = configManager.getStore().get('config');
            const currentEnvConfig = config.environments[config.currentEnv];

            // Use a simple Jenkins API endpoint that requires minimal permissions
            const jenkinsBaseUrl = currentEnvConfig.jenkinsJobUrl.split('/job/')[0];
            const testUrl = `${jenkinsBaseUrl}/api/json?pretty=true`;

            // Execute curl command with verbose output to see what's happening
            const curlCommand = `curl -v -s -L -u "${currentEnvConfig.jenkinsUsername}:${currentEnvConfig.jenkinsApiToken}" "${testUrl}"`;
            console.log(`Testing Jenkins connection: ${curlCommand.replace(currentEnvConfig.jenkinsApiToken, '****')}`);

            const output = await commandExecutor.execute(curlCommand);

            // Log the first part of the response for debugging
            console.log("Jenkins API response (first 200 chars):", output.substring(0, 200));

            try {
                JSON.parse(output);
                return {
                    success: true,
                    message: "Successfully connected to Jenkins API"
                };
            } catch (jsonError) {
                return {
                    success: false,
                    message: "Connected to Jenkins but received invalid JSON response",
                    response: output.substring(0, 500)
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `Connection test failed: ${error.message}`
            };
        }
    }
}

module.exports = new DeploymentService();