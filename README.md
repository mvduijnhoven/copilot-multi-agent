# Copilot Multi-Agent

Enhance GitHub Copilot Chat with sophisticated multi-agent capabilities. Configure specialized AI agents for different development tasks and enable advanced task delegation workflows within VS Code.

## Features

- **Multi-Agent Coordination**: Configure a coordinator agent that orchestrates work between specialized agents
- **Custom Agent Configuration**: Create and configure multiple specialized agents for different development tasks
- **Intelligent Task Delegation**: Agents can delegate work to other agents using built-in delegation tools
- **Flexible Tool Permissions**: Control which GitHub Copilot tools each agent can access
- **Seamless Integration**: Works within the existing GitHub Copilot Chat interface
- **User-Friendly Settings**: Configure agents through VS Code's settings interface

## Requirements

- **VS Code**: Version 1.105.0 or higher
- **GitHub Copilot Chat**: This extension requires the GitHub Copilot Chat extension to be installed and active
- **GitHub Copilot Subscription**: A valid GitHub Copilot subscription is required

## Installation

1. Install the extension from the VS Code Marketplace
2. Ensure GitHub Copilot Chat is installed and configured
3. Reload VS Code to activate the extension
4. Configure your agents through VS Code settings (see Configuration section below)

## Quick Start

1. **Open Settings**: Go to VS Code Settings (Cmd/Ctrl + ,) and search for "Copilot Multi-Agent"

2. **Configure Coordinator**: The coordinator agent is pre-configured but can be customized:
   ```json
   {
     "copilotMultiAgent.coordinator": {
       "systemPrompt": "You are a coordinator agent responsible for orchestrating tasks...",
       "description": "Coordinates work between specialized agents",
       "useFor": "Task orchestration and delegation"
     }
   }
   ```

3. **Add Custom Agents**: Create specialized agents for your workflow:
   ```json
   {
     "copilotMultiAgent.customAgents": [
       {
         "name": "code-reviewer",
         "systemPrompt": "You are a code review specialist...",
         "description": "Specialized in code review and quality analysis",
         "useFor": "Code review, security analysis, best practices"
       }
     ]
   }
   ```

4. **Start Chatting**: Use `@multi-agent` in GitHub Copilot Chat to interact with your multi-agent system

## Configuration

### Coordinator Agent

The coordinator agent orchestrates work between specialized agents. Configure it in VS Code settings:

> **Note**: Do not include a "name" property in the coordinator configuration. The extension automatically sets the name to "coordinator".

| Setting | Description | Default |
|---------|-------------|---------|
| `systemPrompt` | Defines the coordinator's behavior and capabilities | Pre-configured delegation prompt |
| `description` | Brief description of the coordinator's purpose | "Coordinates work between specialized agents" |
| `useFor` | Description of tasks the coordinator handles | "Task orchestration and delegation" |
| `delegationPermissions` | Controls which agents can be delegated to | `{"type": "all"}` |
| `toolPermissions` | Controls which tools the coordinator can access | Delegation tools enabled |

### Custom Agents

Create specialized agents for different development tasks:

| Setting | Description | Required |
|---------|-------------|----------|
| `name` | Unique identifier (letters, numbers, hyphens, underscores) | Yes |
| `systemPrompt` | Defines the agent's expertise and behavior | Yes |
| `description` | Brief description of the agent's purpose | Yes |
| `useFor` | Tasks or domains the agent specializes in | Yes |
| `delegationPermissions` | Controls delegation capabilities | Yes |
| `toolPermissions` | Controls tool access | Yes |

### Permission Types

Both delegation and tool permissions support three types:

- **`all`**: Access to all agents/tools
- **`none`**: No access to agents/tools  
- **`specific`**: Access to specified agents/tools only

Example specific permissions:
```json
{
  "delegationPermissions": {
    "type": "specific",
    "agents": ["code-reviewer", "documentation-writer"]
  },
  "toolPermissions": {
    "type": "specific", 
    "tools": ["reportOut", "workspace"]
  }
}
```

## Example Agent Configurations

### Code Review Specialist
```json
{
  "name": "code-reviewer",
  "systemPrompt": "You are a senior code reviewer with expertise in software engineering best practices, security, and code quality. Focus on identifying potential issues, suggesting improvements, and ensuring code follows established patterns and conventions.",
  "description": "Specialized in code review and quality analysis",
  "useFor": "Code review, security analysis, best practices, refactoring suggestions",
  "delegationPermissions": {"type": "none"},
  "toolPermissions": {"type": "specific", "tools": ["reportOut", "workspace"]}
}
```

### Documentation Writer
```json
{
  "name": "documentation-writer", 
  "systemPrompt": "You are a technical documentation specialist. Create clear, comprehensive documentation including README files, API docs, code comments, and user guides. Focus on clarity, completeness, and accessibility.",
  "description": "Specialized in creating technical documentation",
  "useFor": "README files, API documentation, code comments, user guides",
  "delegationPermissions": {"type": "none"},
  "toolPermissions": {"type": "specific", "tools": ["reportOut", "workspace"]}
}
```

### Test Engineer
```json
{
  "name": "test-engineer",
  "systemPrompt": "You are a test automation specialist with expertise in unit testing, integration testing, and test-driven development. Create comprehensive test suites, identify edge cases, and ensure proper test coverage.",
  "description": "Specialized in test creation and automation",
  "useFor": "Unit tests, integration tests, test automation, TDD",
  "delegationPermissions": {"type": "specific", "agents": ["code-reviewer"]},
  "toolPermissions": {"type": "specific", "tools": ["reportOut", "workspace", "delegateWork"]}
}
```

### DevOps Engineer
```json
{
  "name": "devops-engineer",
  "systemPrompt": "You are a DevOps specialist with expertise in CI/CD, containerization, infrastructure as code, and deployment automation. Focus on scalable, secure, and maintainable infrastructure solutions.",
  "description": "Specialized in DevOps and infrastructure",
  "useFor": "CI/CD pipelines, Docker, Kubernetes, infrastructure automation",
  "delegationPermissions": {"type": "specific", "agents": ["security-specialist"]},
  "toolPermissions": {"type": "all"}
}
```

### Security Specialist
```json
{
  "name": "security-specialist",
  "systemPrompt": "You are a cybersecurity expert specializing in application security, vulnerability assessment, and secure coding practices. Identify security risks, suggest mitigations, and ensure compliance with security standards.",
  "description": "Specialized in security analysis and secure coding",
  "useFor": "Security audits, vulnerability assessment, secure coding practices",
  "delegationPermissions": {"type": "none"},
  "toolPermissions": {"type": "specific", "tools": ["reportOut", "workspace"]}
}
```

## Usage Examples

### Basic Usage
```
@multi-agent Review this code for potential issues and suggest improvements
```

### Complex Task Delegation
```
@multi-agent I need to prepare this project for production. Please review the code, update documentation, add tests, and set up CI/CD pipeline
```

The coordinator will analyze the request and delegate appropriate tasks to specialized agents.

### Direct Agent Interaction
While the coordinator handles most interactions, you can reference specific agents:
```
@multi-agent Have the code-reviewer focus on security aspects of this authentication module
```

## Troubleshooting

### Common Issues

#### Extension Not Loading
**Problem**: Multi-agent chat participant doesn't appear in Copilot Chat

**Solutions**:
1. Ensure GitHub Copilot Chat extension is installed and active
2. Check VS Code version (requires 1.105.0+)
3. Reload VS Code window (Cmd/Ctrl + Shift + P → "Developer: Reload Window")
4. Check the Output panel for error messages (View → Output → "Copilot Multi-Agent")

#### Configuration Errors
**Problem**: Settings validation errors or agents not working as expected

**Solutions**:
1. Verify agent names use only letters, numbers, hyphens, and underscores
2. Ensure all required fields are filled
3. Check that delegation permissions reference existing agent names
4. Validate JSON syntax in settings
5. Reset to default configuration if needed

#### Delegation Not Working
**Problem**: Agents cannot delegate work to other agents

**Solutions**:
1. Verify coordinator has delegation permissions set to "all" or includes target agents
2. Check that target agents exist in custom agents configuration
3. Ensure delegating agent has "delegateWork" tool permission
4. Check for circular delegation (Agent A → Agent B → Agent A)

#### Tool Access Issues
**Problem**: Agents cannot access expected GitHub Copilot tools

**Solutions**:
1. Verify tool permissions are set correctly ("all", "none", or specific tools)
2. Check that tool names are spelled correctly in specific permissions
3. Ensure GitHub Copilot Chat is functioning normally
4. Try setting tool permissions to "all" temporarily for debugging

### Performance Issues

#### Slow Response Times
**Solutions**:
1. Reduce complexity of system prompts
2. Limit delegation chain depth
3. Use specific tool permissions instead of "all"
4. Check network connectivity to GitHub Copilot services

#### Memory Usage
**Solutions**:
1. Limit number of custom agents (recommended: 5-10)
2. Keep system prompts concise but effective
3. Restart VS Code if memory usage becomes excessive

### Configuration Validation

The extension validates configurations on startup. Common validation errors:

- **Duplicate agent names**: Each agent must have a unique name
- **Invalid characters in names**: Use only letters, numbers, hyphens, underscores
- **Missing required fields**: All configuration fields are required
- **Invalid delegation references**: Delegation permissions must reference existing agents
- **Circular delegation**: Agents cannot create delegation loops

## FAQ

### General Questions

**Q: How many custom agents can I create?**
A: The extension supports up to 20 custom agents, though 5-10 is recommended for optimal performance.

**Q: Can agents delegate to multiple other agents?**
A: Yes, agents can delegate to multiple agents either through "all" permissions or by specifying multiple agents in "specific" permissions.

**Q: Do I need to restart VS Code after changing agent configurations?**
A: No, configuration changes are applied immediately. However, ongoing conversations may use the previous configuration until restarted.

**Q: Can I export and share agent configurations?**
A: Yes, agent configurations are stored in VS Code settings and can be exported via Settings Sync or by copying the JSON configuration.

### Technical Questions

**Q: How does the delegation system prevent infinite loops?**
A: The system tracks delegation chains and prevents circular delegation (A → B → A). It also limits delegation depth to prevent excessive nesting.

**Q: What happens if a delegated agent fails?**
A: The system handles agent failures gracefully, returning error information to the delegating agent so it can continue or try alternative approaches.

**Q: Can I use custom tools with agents?**
A: Currently, agents can access GitHub Copilot's built-in tools plus the delegation tools (delegateWork, reportOut). Custom tool support may be added in future versions.

**Q: How are conversations managed between agents?**
A: Each delegation creates a new conversation context, maintaining isolation between agents while preserving the ability to report results back to the delegating agent.

### Best Practices

**Q: How should I structure my agent system?**
A: Start with a coordinator that can delegate to 3-5 specialized agents. Avoid deep delegation chains and ensure clear separation of responsibilities.

**Q: What makes a good system prompt?**
A: Effective system prompts are specific about the agent's role, expertise, and expected behavior. Include examples of tasks the agent should handle and how it should respond.

**Q: Should all agents have delegation permissions?**
A: Not necessarily. Leaf agents (those that perform specific tasks) often work best with "none" delegation permissions, while coordinator-type agents benefit from delegation capabilities.

## API and Extension Points

### For Advanced Users

The extension provides several extension points for advanced customization:

#### Configuration Schema
The extension uses VS Code's configuration API with JSON Schema validation. You can programmatically access and modify configurations:

```typescript
import * as vscode from 'vscode';

// Get current configuration
const config = vscode.workspace.getConfiguration('copilotMultiAgent');
const coordinator = config.get('coordinator');
const customAgents = config.get('customAgents');

// Update configuration
await config.update('customAgents', newAgentsArray, vscode.ConfigurationTarget.Global);
```

#### Chat Participant Integration
The extension registers a chat participant with ID `copilot-multi-agent.coordinator`. Other extensions can interact with it through VS Code's Chat API.

#### Tool System
The extension implements two custom tools:
- `delegateWork`: Delegates tasks to other agents
- `reportOut`: Returns results from delegated agents

#### Event Handling
The extension responds to configuration changes in real-time and provides error handling through VS Code's notification system.

### Extension Development

If you're developing extensions that integrate with Copilot Multi-Agent:

1. **Dependency**: Add `copilot-multi-agent` to your extension dependencies
2. **API Access**: Use VS Code's Chat API to interact with the multi-agent system
3. **Configuration**: Respect the extension's configuration schema
4. **Error Handling**: Handle cases where the extension is not installed or configured

### Contributing

The extension is open source and welcomes contributions:

- **Repository**: [GitHub Repository](https://github.com/mvduijnhoven/copilot-multi-agent)
- **Issues**: Report bugs and request features through GitHub Issues
- **Pull Requests**: Submit improvements and fixes via pull requests
- **Documentation**: Help improve documentation and examples

## Release Notes

### 0.1.0 (Initial Release)

- Multi-agent coordination system with configurable coordinator
- Custom agent creation and configuration
- Task delegation with delegateWork and reportOut tools
- Flexible permission system for tools and delegation
- VS Code settings integration with validation
- Comprehensive error handling and graceful degradation
- Full integration with GitHub Copilot Chat

---

## Support

- **Documentation**: This README and inline help in VS Code settings
- **Issues**: [GitHub Issues](https://github.com/mvduijnhoven/copilot-multi-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mvduijnhoven/copilot-multi-agent/discussions)

## License

This extension is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.