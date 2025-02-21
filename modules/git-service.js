const axios = require('axios');
const configManager = require('./config-manager');

class GitService {
    constructor() {
        this.config = null;
    }

    async initialize() {
        const config = configManager.getStore().get('config');
        this.config = config.gitConfig;

        this.axiosInstance = axios.create({
                                              baseURL: this.config.bitbucketUrl,
                                              auth: {
                                                  username: this.config.username,
                                                  password: this.config.apiToken
                                              },
                                              headers: {
                                                  'Content-Type': 'application/json'
                                              }
                                          });
    }

    async createPullRequest(sourceBranch, jiraTicket) {
        await this.initialize();

        try {
            const [owner, repo] = this.config.repository.split('/');

            const response = await this.axiosInstance.post(
                `/repositories/${owner}/${repo}/pullrequests`,
                {
                    title: `${jiraTicket.key}: ${jiraTicket.fields.summary}`,
                    description: `Automatic PR created for ${jiraTicket.key}.\n\nOriginal description: ${jiraTicket.fields.description}`,
                    source: {
                        branch: {
                            name: sourceBranch
                        }
                    },
                    destination: {
                        branch: {
                            name: this.config.targetBranch
                        }
                    },
                    close_source_branch: true
                }
            );

            return {
                id: response.data.id,
                url: response.data.links.html.href,
                hasConflicts: this.checkForConflicts(response.data)
            };
        } catch (error) {
            console.error(`Error creating PR for branch ${sourceBranch}:`, error.response?.data || error.message);
            throw new Error(`Failed to create PR: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    checkForConflicts(prData) {
        // Bitbucket API returns merge conflict info in different ways depending on version
        // This is a simplified check - adapt to your specific Bitbucket API
        return prData.state === 'OPEN' &&
               (prData.merge_error ||
                prData.merge_status === 'CONFLICTED' ||
                prData.reason === 'CONFLICTED');
    }

    async mergePullRequest(prId) {
        await this.initialize();

        try {
            const [owner, repo] = this.config.repository.split('/');

            const response = await this.axiosInstance.post(
                `/repositories/${owner}/${repo}/pullrequests/${prId}/merge`,
                {
                    close_source_branch: true,
                    merge_strategy: 'merge_commit'
                }
            );

            return {
                success: true,
                commitId: response.data.hash
            };
        } catch (error) {
            console.error(`Error merging PR ${prId}:`, error.response?.data || error.message);
            throw new Error(`Failed to merge PR: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}

module.exports = new GitService();