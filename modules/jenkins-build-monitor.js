const axios = require('axios');
const configManager = require('./config-manager');

class JenkinsBuildMonitor {
    constructor() {
        this.pollingInterval = 30000; // 30 seconds
    }

    async initialize() {
        const config = configManager.getStore().get('config');
        const currentEnvConfig = config.environments[config.currentEnv];

        this.jenkinsUrl = currentEnvConfig.jenkinsJobUrl.split('/job/')[0];
        this.jobName = currentEnvConfig.jenkinsJobUrl.split('/job/')[1]?.replace(/\/$/, '');
        this.auth = {
            username: currentEnvConfig.jenkinsUsername,
            password: currentEnvConfig.jenkinsApiToken
        };
    }

    async getLatestBuildNumber() {
        await this.initialize();

        try {
            const response = await axios.get(
                `${this.jenkinsUrl}/job/${this.jobName}/lastBuild/api/json`,
                { auth: this.auth }
            );

            return response.data.number;
        } catch (error) {
            console.error('Error getting latest build number:', error);
            throw new Error('Failed to get latest build number from Jenkins');
        }
    }

    async getBuildStatus(buildNumber) {
        await this.initialize();

        try {
            const response = await axios.get(
                `${this.jenkinsUrl}/job/${this.jobName}/${buildNumber}/api/json`,
                { auth: this.auth }
            );

            return {
                building: response.data.building,
                result: response.data.result,
                number: response.data.number
            };
        } catch (error) {
            console.error(`Error getting build status for #${buildNumber}:`, error);
            throw new Error(`Failed to get status for build #${buildNumber}`);
        }
    }

    async waitForBuildToComplete() {
        await this.initialize();

        try {
            // Get the current build number to establish a baseline
            const latestBuildNumber = await this.getLatestBuildNumber();
            console.log(`Current latest build is #${latestBuildNumber}, waiting for newer builds...`);

            // Wait for a new build to start
            let newBuildNumber = latestBuildNumber;
            let attempts = 0;
            const maxAttempts = 20; // Maximum 10 minutes (20 * 30 seconds)

            while (newBuildNumber <= latestBuildNumber && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
                newBuildNumber = await this.getLatestBuildNumber();
                attempts++;
            }

            if (attempts >= maxAttempts) {
                throw new Error('Timeout waiting for a new build to start');
            }

            console.log(`New build #${newBuildNumber} detected. Waiting for completion...`);

            // Wait for build to complete
            let buildStatus = await this.getBuildStatus(newBuildNumber);

            while (buildStatus.building) {
                await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
                buildStatus = await this.getBuildStatus(newBuildNumber);
            }

            console.log(`Build #${newBuildNumber} completed with result: ${buildStatus.result}`);

            if (buildStatus.result === 'SUCCESS') {
                return newBuildNumber;
            } else {
                throw new Error(`Build #${newBuildNumber} failed with result: ${buildStatus.result}`);
            }
        } catch (error) {
            console.error('Error monitoring Jenkins build:', error);
            throw error;
        }
    }
}

module.exports = new JenkinsBuildMonitor();