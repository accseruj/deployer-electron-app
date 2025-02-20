const path = require('path');
const os = require('os');

/**
 * Configuration manager for deployment app
 */
class ConfigManager {
    constructor() {
        // Default configuration constants
        this.DEFAULT_ENV_CONFIG = {
            namespace: 'byredo-m2-dev',
            jenkinsUsername: '',
            jenkinsApiToken: '',
            sshKeyPath: '~/.ssh/byredo_rsa',
            jenkinsJobUrl: '',
            sshUser: '',
            sshHost: 'manager.byredo.akoova.cloud',
            sshPort: '12022',
            // Default Slack settings
            enableSlack: false,
            slackWebhookUrl: '',
            slackChannel: '#deployments',
            slackUsername: 'Deployment Bot',
        };

        this.DEFAULT_CONFIG = {
            currentEnv: 'uat',
            environments: {
                uat: {
                    ...this.DEFAULT_ENV_CONFIG,
                    jenkinsJobUrl: 'https://ci.vaimo.network/job/project/job/byredo/job/project_byredo-retainer-artefact/job/uat/',
                    sshUser: 'byredo-uat',
                },
                upgrade: {
                    ...this.DEFAULT_ENV_CONFIG,
                    jenkinsJobUrl: 'https://ci.vaimo.network/job/project/job/byredo/job/project_byredo-retainer-artefact/job/upgrade/',
                    sshUser: 'byredo-upgrade',
                }
            }
        };

        this.store = null;
    }

    async initialize() {
        try {
            const { default: Store } = await import('electron-store');
            this.store = new Store({
                                       name: 'deployment-config',
                                       defaults: this.DEFAULT_CONFIG
                                   });

            // Ensure the config structure is complete
            const currentConfig = this.store.get('config') || {};
            this.store.set('config', {
                ...this.DEFAULT_CONFIG,
                ...currentConfig,
                environments: {
                    ...this.DEFAULT_CONFIG.environments,
                    ...(currentConfig.environments || {})
                }
            });

            return this.store;
        } catch (error) {
            console.error('Store initialization error:', error);
            throw error;
        }
    }

    getStore() {
        return this.store;
    }

    getEnvironments() {
        const config = this.store.get('config');
        return {
            currentEnv: config.currentEnv || 'uat',
            environments: Object.keys(config.environments)
        };
    }

    getCurrentEnvConfig() {
        const config = this.store.get('config');
        const currentEnv = config.currentEnv || 'uat';
        return config.environments[currentEnv] || this.DEFAULT_CONFIG.environments.uat;
    }

    setCurrentEnv(envName) {
        const config = this.store.get('config');
        config.currentEnv = envName;
        this.store.set('config', config);
        return { success: true };
    }

    saveEnvConfig({ envName, envConfig }) {
        const config = this.store.get('config');
        config.environments[envName] = envConfig;
        this.store.set('config', config);
        return { success: true };
    }

    getEnvConfig(envName) {
        const config = this.store.get('config');
        if (!config || !config.environments || !config.environments[envName]) {
            return this.DEFAULT_CONFIG.environments[envName] || this.DEFAULT_ENV_CONFIG;
        }
        return config.environments[envName];
    }
}

module.exports = new ConfigManager();