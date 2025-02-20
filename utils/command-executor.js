const { exec } = require('child_process');

/**
 * Utility to execute shell commands
 */
class CommandExecutor {
    /**
     * Execute a shell command and return output
     * @param {string} command - Command to execute
     * @returns {Promise<string>} Command output
     */
    execute(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Command execution error: ${stderr}`);
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}

module.exports = new CommandExecutor();