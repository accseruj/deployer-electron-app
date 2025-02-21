const axios = require('axios');
const configManager = require('./config-manager');

class JiraService {
    constructor() {
        this.config = null;
    }

    async initialize() {
        const config = configManager.getStore().get('config');
        this.config = config.jiraConfig;

        this.axiosInstance = axios.create({
                                              baseURL: this.config.url,
                                              auth: {
                                                  username: this.config.username,
                                                  password: this.config.apiToken
                                              },
                                              headers: {
                                                  'Content-Type': 'application/json',
                                                  'Accept': 'application/json'
                                              }
                                          });
    }

    async getTicketsFromColumn(columnName) {
        await this.initialize();
        try {
            // First, get all columns from the board
            const boardResponse = await this.axiosInstance.get(
                `/rest/agile/1.0/board/${this.config.boardId}/configuration`
            );

            const columns = boardResponse.data.columnConfig.columns;
            const targetColumn = columns.find(col => col.name === columnName);

            if (!targetColumn) {
                throw new Error(`Column "${columnName}" not found on board ${this.config.boardId}`);
            }

            // Get issues from the column
            const issuesResponse = await this.axiosInstance.get(
                `/rest/agile/1.0/board/${this.config.boardId}/issue`, {
                    params: {
                        jql: `project = ${this.config.project} AND status = "${columnName}"`,
                        fields: 'key,summary,description,status'
                    }
                }
            );

            return issuesResponse.data.issues;
        } catch (error) {
            console.error('Error fetching Jira tickets:', error);
            throw new Error(`Failed to fetch tickets from Jira: ${error.message}`);
        }
    }

    extractBranchFromDescription(description) {
        if (!description) return null;

        const branchRegex = /Branch:\s*([^\s\n]+)/i;
        const match = description.match(branchRegex);

        return match ? match[1] : null;
    }
}

module.exports = new JiraService();