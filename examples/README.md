# Copilot Multi-Agent Examples

This directory contains example configurations and use cases for the Copilot Multi-Agent extension.

## Configuration Examples

### Basic Setup
- [minimal-setup.json](./configurations/minimal-setup.json) - Simple single-agent setup with entry agent configuration
- [standard-setup.json](./configurations/standard-setup.json) - Recommended configuration with common agents and entry agent
- [advanced-setup.json](./configurations/advanced-setup.json) - Complex setup with delegation chains and specialized entry agent

### Configuration Structure

All examples use the new configuration structure with:
- `copilotMultiAgent.entryAgent`: Specifies which agent handles initial conversations
- `copilotMultiAgent.agents`: Array of all configured agents (including the entry agent)

### Quick Start Templates
- [frontend-team.json](./templates/frontend-team.json) - Ready-to-use configuration for frontend development teams
- [backend-team.json](./templates/backend-team.json) - Configuration for backend/API development teams
- [fullstack-team.json](./templates/fullstack-team.json) - Comprehensive full-stack development setup

## How to Use Examples

1. **Choose a Configuration**: Select an example that matches your development needs
2. **Copy Configuration**: Copy the JSON content from the example file
3. **Open VS Code Settings**: Go to Settings (Cmd/Ctrl + ,) and search for "copilotMultiAgent"
4. **Paste Configuration**: Paste the JSON into the appropriate settings fields
5. **Customize**: Modify agent names, system prompts, and permissions as needed

## Configuration Tips

### Entry Agent Selection
- Choose an agent that can handle general conversations and coordinate work
- Ensure the entry agent has appropriate delegation permissions
- The entry agent should have access to delegation tools if coordination is needed

### Agent Naming
- Use descriptive, kebab-case names (e.g., "code-reviewer", "frontend-coordinator")
- Keep names short but clear
- Avoid spaces and special characters

### Permission Configuration
- Start with restrictive permissions and expand as needed
- Use "specific" permissions for better control and security
- Ensure delegation permissions don't create circular references

## Example Scenarios

### Scenario 1: Solo Developer
Use [minimal-setup.json](./configurations/minimal-setup.json) with a single coordinator agent that can handle all tasks directly.

### Scenario 2: Small Team
Use [standard-setup.json](./configurations/standard-setup.json) with a coordinator and 2-3 specialized agents for common tasks.

### Scenario 3: Large Team
Use [advanced-setup.json](./configurations/advanced-setup.json) with multiple specialized agents and complex delegation chains.

### Scenario 4: Frontend Focus
Use [frontend-team.json](./templates/frontend-team.json) for teams primarily working on user interfaces and frontend applications.

### Scenario 5: Backend Focus
Use [backend-team.json](./templates/backend-team.json) for teams working on APIs, databases, and server-side applications.

### Scenario 6: Full-Stack Development
Use [fullstack-team.json](./templates/fullstack-team.json) for teams working across the entire application stack.

## Customization Guidelines

### System Prompts
- Be specific about the agent's role and expertise
- Include examples of tasks the agent should handle
- Mention collaboration patterns with other agents
- Keep prompts focused but comprehensive

### Delegation Permissions
- **"all"**: Agent can delegate to any other agent
- **"none"**: Agent cannot delegate (good for leaf/specialist agents)
- **"specific"**: Agent can only delegate to listed agents (recommended for controlled workflows)

### Tool Permissions
- **"all"**: Agent has access to all available tools
- **"none"**: Agent has no tool access (rarely used)
- **"specific"**: Agent has access to listed tools only (recommended for security)

## Testing Your Configuration

1. **Start Simple**: Begin with a minimal configuration and add complexity gradually
2. **Test Basic Functionality**: Verify the entry agent responds to simple requests
3. **Test Delegation**: Try requests that should trigger delegation to other agents
4. **Monitor Performance**: Watch for slow responses or errors in the Output panel
5. **Iterate**: Refine system prompts and permissions based on actual usage

## Troubleshooting

If you encounter issues with example configurations:

1. **Validation Errors**: Check that all required fields are present and properly formatted
2. **Entry Agent Issues**: Verify the entry agent name matches an agent in the agents array
3. **Delegation Problems**: Ensure delegation permissions reference existing agents
4. **Tool Access Issues**: Check that tool names are spelled correctly in permissions

For detailed troubleshooting, see the [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) guide.