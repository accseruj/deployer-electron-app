const jiraService = require('./jira-service');
const gitService = require('./git-service');
const deploymentService = require('./deployment-service');
const notificationService = require('./notification-service');
const configManager = require('./config-manager');
const jenkinsBuildMonitor = require('./jenkins-build-monitor');

class DeploymentOrchestrator {
    async orchestrateDeployment(statusCallback) {
        try {
            const config = configManager.getStore().get('config');

            // Step 1: Collect tickets from Jira
            statusCallback({
                               success: true,
                               message: `Collecting tickets from Jira column "${config.jiraConfig.columnName}"...`,
                               inProgress: true
                           });

            const tickets = await jiraService.getTicketsFromColumn(config.jiraConfig.columnName);

            if (tickets.length === 0) {
                statusCallback({
                                   success: false,
                                   message: `No tickets found in column "${config.jiraConfig.columnName}"`,
                                   inProgress: false
                               });
                return { success: false };
            }

            // Step 2: Send ticket list to Slack
            statusCallback({
                               success: true,
                               message: `Found ${tickets.length} tickets. Sending notification to Slack...`,
                               inProgress: true
                           });

            await notificationService.sendTicketsToBeDeployedNotification(tickets);

            // Step 3-6: Process each ticket - extract branch, create PR, check conflicts
            statusCallback({
                               success: true,
                               message: `Processing tickets and creating pull requests...`,
                               inProgress: true
                           });

            const results = [];
            let allMerged = true;

            for (const ticket of tickets) {
                try {
                    // Extract branch from description
                    const branch = jiraService.extractBranchFromDescription(ticket.fields.description);

                    if (!branch) {
                        results.push({
                                         ticket: ticket.key,
                                         success: false,
                                         message: 'No branch information found in ticket description'
                                     });
                        allMerged = false;
                        continue;
                    }

                    // Create and process PR
                    const pr = await gitService.createPullRequest(branch, ticket);

                    if (pr.hasConflicts) {
                        results.push({
                                         ticket: ticket.key,
                                         success: false,
                                         message: 'Pull request has conflicts',
                                         prUrl: pr.url
                                     });
                        allMerged = false;
                    } else {
                        // Merge the PR
                        const mergeResult = await gitService.mergePullRequest(pr.id);

                        results.push({
                                         ticket: ticket.key,
                                         success: true,
                                         message: 'Pull request merged successfully',
                                         prUrl: pr.url,
                                         commitId: mergeResult.commitId
                                     });
                    }

                    // Send PR status notification to Slack
                    await notificationService.sendPrStatusNotification(ticket.key, {
                        hasConflicts: pr.hasConflicts,
                        url: pr.url
                    });

                } catch (error) {
                    results.push({
                                     ticket: ticket.key,
                                     success: false,
                                     message: `Error: ${error.message}`
                                 });
                    allMerged = false;
                }
            }

            // Step 7: If all merged successfully, wait for Jenkins build
            if (allMerged && config.deploymentConfig.waitForJenkinsBuild) {
                statusCallback({
                                   success: true,
                                   message: `All branches merged successfully. Waiting for Jenkins build to complete...`,
                                   inProgress: true
                               });

                const buildNumber = await jenkinsBuildMonitor.waitForBuildToComplete();

                if (buildNumber && config.deploymentConfig.autoDeploySuccessfulBuild) {
                    statusCallback({
                                       success: true,
                                       message: `Jenkins build #${buildNumber} completed successfully. Starting deployment...`,
                                       inProgress: true
                                   });

                    // Proceed with existing deployment logic
                    return await deploymentService.performDeployment(buildNumber, statusCallback);
                } else {
                    statusCallback({
                                       success: true,
                                       message: `Jenkins build #${buildNumber} completed. Please proceed with manual deployment.`,
                                       inProgress: false
                                   });
                    return { success: true, buildNumber };
                }
            } else {
                // Not all PRs were merged successfully
                const successCount = results.filter(r => r.success).length;

                statusCallback({
                                   success: false,
                                   message: `Deployment preparation completed with issues. ${successCount}/${tickets.length} tickets processed successfully.`,
                                   inProgress: false,
                                   details: results
                               });

                return { success: false, results };
            }

        } catch (error) {
            statusCallback({
                               success: false,
                               message: `Orchestration error: ${error.message}`,
                               inProgress: false
                           });
            return { success: false, error: error.message };
        }
    }
}

module.exports = new DeploymentOrchestrator();