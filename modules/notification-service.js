const https = require('https');
const url = require('url');
const os = require('os');
const configManager = require('./config-manager');

/**
 * Handles notifications including Slack messages
 */
class NotificationService {
    /**
     * Send a message to Slack
     * @param {string} webhookUrl - Slack webhook URL
     * @param {Object} message - Message payload
     * @returns {Promise<string>} Response data
     */
    sendSlackMessage(webhookUrl, message) {
        return new Promise((resolve, reject) => {
            try {
                const parsedUrl = url.parse(webhookUrl);
                const data = JSON.stringify(message);

                const options = {
                    hostname: parsedUrl.hostname,
                    path: parsedUrl.path,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': data.length
                    }
                };

                const req = https.request(options, (res) => {
                    let responseData = '';

                    res.on('data', (chunk) => {
                        responseData += chunk;
                    });

                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(responseData);
                        } else {
                            reject(new Error(`Slack API responded with status code ${res.statusCode}: ${responseData}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    reject(error);
                });

                req.write(data);
                req.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Send deployment start notification
     * @param {string} buildNumber - Build number being deployed
     * @returns {Promise<Object>} Notification result
     */
    async sendDeploymentStartNotification(buildNumber) {
        try {
            const config = configManager.getStore().get('config');
            const currentEnvConfig = config.environments[config.currentEnv];

            if (!currentEnvConfig.enableSlack || !currentEnvConfig.slackWebhookUrl) {
                return { success: false, message: 'Slack notifications not enabled' };
            }

            const deploymentStartMessage = {
                channel: currentEnvConfig.slackChannel,
                username: currentEnvConfig.slackUsername || 'Deployment Bot',
                icon_emoji: ':rocket:',
                text: `:rocket: Deployment Started for ${config.currentEnv.toUpperCase()} - Build ${buildNumber}`,
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: `:rocket: Deployment Started`,
                            emoji: true
                        }
                    },
                    {
                        type: "section",
                        fields: [
                            {
                                type: "mrkdwn",
                                text: `*Environment:*\n${config.currentEnv.toUpperCase()}`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Build Number:*\n${buildNumber}`
                            }
                        ]
                    },
                    {
                        type: "context",
                        elements: [
                            {
                                type: "mrkdwn",
                                text: `Initiated by ${os.userInfo().username} at ${new Date().toLocaleString()}`
                            }
                        ]
                    }
                ]
            };

            await this.sendSlackMessage(currentEnvConfig.slackWebhookUrl, deploymentStartMessage);
            console.log('Sent deployment start notification to Slack');
            return { success: true };
        } catch (error) {
            console.error('Failed to send Slack notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send deployment completion notification
     * @param {string} buildNumber - Build number that was deployed
     * @returns {Promise<Object>} Notification result
     */
    async sendDeploymentCompleteNotification(buildNumber) {
        try {
            const config = configManager.getStore().get('config');
            const currentEnvConfig = config.environments[config.currentEnv];

            if (!currentEnvConfig.enableSlack || !currentEnvConfig.slackWebhookUrl) {
                return { success: false, message: 'Slack notifications not enabled' };
            }

            const deploymentCompleteMessage = {
                channel: currentEnvConfig.slackChannel,
                username: currentEnvConfig.slackUsername || 'Deployment Bot',
                icon_emoji: ':white_check_mark:',
                text: `:white_check_mark: Deployment Completed Successfully - ${config.currentEnv.toUpperCase()} Build ${buildNumber}`,
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: `:rocket: Deployment Completed`,
                            emoji: true
                        }
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `:white_check_mark: *Deployment Completed Successfully*\n Environment: *${config.currentEnv.toUpperCase()}*\n Build Number: *${buildNumber}*`
                        }
                    },
                    {
                        type: "context",
                        elements: [
                            {
                                type: "mrkdwn",
                                text: `Completed at ${new Date().toLocaleString()}`
                            }
                        ]
                    }
                ]
            };

            await this.sendSlackMessage(currentEnvConfig.slackWebhookUrl, deploymentCompleteMessage);
            console.log('Sent deployment completion notification to Slack');
            return { success: true };
        } catch (error) {
            console.error('Failed to send Slack notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send deployment failure notification
     * @param {string} buildNumber - Build number that failed
     * @param {string} errorMessage - Error details
     * @returns {Promise<Object>} Notification result
     */
    async sendDeploymentFailureNotification(buildNumber, errorMessage) {
        try {
            const config = configManager.getStore().get('config');
            const currentEnvConfig = config.environments[config.currentEnv];

            if (!currentEnvConfig.enableSlack || !currentEnvConfig.slackWebhookUrl) {
                return { success: false, message: 'Slack notifications not enabled' };
            }

            const deploymentFailedMessage = {
                channel: currentEnvConfig.slackChannel,
                username: currentEnvConfig.slackUsername || 'Deployment Bot',
                icon_emoji: ':x:',
                text: `:x: Deployment Failed - ${config.currentEnv.toUpperCase()} Build ${buildNumber}`,
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: `:rocket: Deployment Failed`,
                            emoji: true
                        }
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `:x: *Deployment Failed*\n Environment: *${config.currentEnv.toUpperCase()}*\n Build Number: *${buildNumber}*\n Error: \`${errorMessage}\``
                        }
                    },
                    {
                        type: "context",
                        elements: [
                            {
                                type: "mrkdwn",
                                text: `Failed at ${new Date().toLocaleString()}`
                            }
                        ]
                    }
                ]
            };

            await this.sendSlackMessage(currentEnvConfig.slackWebhookUrl, deploymentFailedMessage);
            console.log('Sent deployment failure notification to Slack');
            return { success: true };
        } catch (error) {
            console.error('Failed to send Slack notification:', error);
            return { success: false, error: error.message };
        }
    }

    async sendTicketsToBeDeployedNotification(tickets) {
        const config = configManager.getStore().get('config');
        const currentEnvConfig = config.environments[config.currentEnv];

        if (!currentEnvConfig.enableSlack) return;

        const ticketList = tickets.map(ticket =>
                                           `• <${this.config.jiraUrl}/browse/${ticket.key}|${ticket.key}> - ${ticket.fields.summary}`
        ).join('\n');

        const message = {
            text: `*Tickets to be deployed to ${config.currentEnv}*\n${ticketList}`,
            channel: currentEnvConfig.slackChannel,
            username: 'Deployment Bot',
            icon_emoji: ':rocket:'
        };

        await this.sendSlackMessage(message);
    }

    async sendPrStatusNotification(ticketKey, prResult) {
        const config = configManager.getStore().get('config');
        const currentEnvConfig = config.environments[config.currentEnv];

        if (!currentEnvConfig.enableSlack) return;

        let color, title, text;

        if (prResult.hasConflicts) {
            color = 'danger';
            title = `⚠️ Merge Conflicts: ${ticketKey}`;
            text = `Pull request has conflicts and cannot be automatically merged. Please resolve conflicts manually: ${prResult.url}`;
        } else {
            color = 'good';
            title = `✅ Successfully Merged: ${ticketKey}`;
            text = `Pull request was successfully merged into ${config.gitConfig.targetBranch}`;
        }

        const message = {
            attachments: [{
                color: color,
                title: title,
                title_link: prResult.url,
                text: text,
                footer: `Target branch: ${config.gitConfig.targetBranch}`
            }],
            channel: currentEnvConfig.slackChannel,
            username: 'Deployment Bot',
            icon_emoji: ':git:'
        };

        await this.sendSlackMessage(message);
    }
}

module.exports = new NotificationService();