# Copilot Multi-Agent API Documentation

This document provides detailed API information for advanced users, extension developers, and those who want to integrate with or extend the Copilot Multi-Agent system.

## Table of Contents

- [Extension Architecture](#extension-architecture)
- [Configuration API](#configuration-api)
- [Chat Participant API](#chat-participant-api)
- [Tool System](#tool-system)
- [Event System](#event-system)
- [Extension Points](#extension-points)
- [Integration Examples](#integration-examples)
- [Development Guidelines](#development-guidelines)

## Extension Architecture

### Core Components

The Copilot Multi-Agent extension is built using a modular architecture with the following core components:

```typescript
// Core interfaces and types
interface ExtensionConfiguration {
  entryAgent: string;
  agents: AgentConfiguration[];
}

interface AgentConfiguration {
  name: string;
  systemPrompt: string;
  description: string;
  useFor: string;
  delegationPermissions: DelegationPermissions;
  toolPermissions: ToolPermissions;
}
```

### Component Hierarchy

```
Extension Activation
├── Configuration Manager
│   ├── Configuration Validator
│   └── Entry Agent Manager
├── Chat Participant
│   ├── Agent Engine
│   ├── Tool Filter
│   └── System Prompt Builder
├── Delegation Engine
│   ├── Conversation Manager
│   └── Delegation Tools
└── Error Handler
```

## Configuration API

### Accessing Configuration

```typescript
import * as vscode from 'vscode';

// Get current configuration
const config = vscode.workspace.getConfiguration('copilotMultiAgent');

// Get entry agent setting
const entryAgent: string = config.get('entryAgent', '');

// Get agents array
const agents: AgentConfiguration[] = config.get('agents', []);
```

### Updating Configuration

```typescript
// Update entry agent
await config.update('entryAgent', 'new-agent-name', vscode.ConfigurationTarget.Global);

// Update agents array
const newAgents: AgentConfiguration[] = [
  {
    name: 'new-agent',
    systemPrompt: 'You are a new agent...',
    description: 'A new specialized agent',
    useFor: 'Specific tasks',
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'specific', tools: ['reportOut'] }
  }
];
await config.update('agents', newAgents, vscode.ConfigurationTarget.Global);
```

### Configuration Schema

The extension uses JSON Schema validation for configuration:

```json
{
  "type": "object",
  "properties": {
    "entryAgent": {
      "type": "string",
      "description": "Name of the agent to handle initial conversations"
    },
    "agents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9_-]+$",
            "description": "Unique agent identifier"
          },
          "systemPrompt": {
            "type": "string",
            "minLength": 1,
            "description": "Agent's system prompt"
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "description": "Brief description of the agent"
          },
          "useFor": {
            "type": "string",
            "minLength": 1,
            "description": "Tasks the agent specializes in"
          },
          "delegationPermissions": {
            "oneOf": [
              { "type": "object", "properties": { "type": { "const": "all" } } },
              { "type": "object", "properties": { "type": { "const": "none" } } },
              {
                "type": "object",
                "properties": {
                  "type": { "const": "specific" },
                  "agents": { "type": "array", "items": { "type": "string" } }
                }
              }
            ]
          },
          "toolPermissions": {
            "oneOf": [
              { "type": "object", "properties": { "type": { "const": "all" } } },
              { "type": "object", "properties": { "type": { "const": "none" } } },
              {
                "type": "object",
                "properties": {
                  "type": { "const": "specific" },
                  "tools": { "type": "array", "items": { "type": "string" } }
                }
              }
            ]
          }
        },
        "required": ["name", "systemPrompt", "description", "useFor", "delegationPermissions", "toolPermissions"]
      }
    }
  }
}
```

### Configuration Events

Listen for configuration changes:

```typescript
// Listen for configuration changes
vscode.workspace.onDidChangeConfiguration((event) => {
  if (event.affectsConfiguration('copilotMultiAgent')) {
    // Configuration changed - reload agents
    console.log('Multi-agent configuration changed');
  }
});
```

## Chat Participant API

### Chat Participant Registration

The extension registers a chat participant with VS Code's Chat API:

```typescript
// Chat participant registration
const participant = vscode.chat.createChatParticipant(
  'copilot-multi-agent.coordinator',
  requestHandler
);

participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');
```

### Request Handler Interface

```typescript
interface ChatRequestHandler {
  (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult>;
}
```

### Chat Request Processing

```typescript
async function requestHandler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  try {
    // 1. Get entry agent configuration
    const entryAgent = getEntryAgent();
    
    // 2. Build system prompt with delegation information
    const systemPrompt = buildSystemPrompt(entryAgent);
    
    // 3. Filter available tools based on permissions
    const availableTools = filterTools(entryAgent.toolPermissions);
    
    // 4. Execute agent with GitHub Copilot Chat
    const result = await executeAgent(
      entryAgent,
      request,
      context,
      stream,
      availableTools,
      token
    );
    
    return result;
  } catch (error) {
    // Handle errors gracefully
    return handleError(error, stream);
  }
}
```

## Tool System

### Custom Tool Implementation

The extension implements two custom tools for multi-agent coordination:

#### delegateWork Tool

```typescript
class DelegateWorkTool implements vscode.LanguageModelTool {
  name = 'delegateWork';
  
  description = 'Delegate work to another specialized agent';
  
  parametersSchema = {
    type: 'object',
    properties: {
      agentName: {
        type: 'string',
        description: 'Name of the agent to delegate work to'
      },
      workDescription: {
        type: 'string',
        description: 'Description of the work to be done'
      },
      reportExpectations: {
        type: 'string',
        description: 'What should be included in the report back'
      }
    },
    required: ['agentName', 'workDescription', 'reportExpectations']
  };
  
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { agentName, workDescription, reportExpectations } = options.parameters;
    
    // Validate delegation permissions
    if (!canDelegate(options.context.agentName, agentName)) {
      throw new Error(`Agent ${options.context.agentName} cannot delegate to ${agentName}`);
    }
    
    // Execute delegation
    const result = await delegationEngine.delegateWork(
      options.context.agentName,
      agentName,
      workDescription,
      reportExpectations
    );
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(result)
    ]);
  }
}
```

#### reportOut Tool

```typescript
class ReportOutTool implements vscode.LanguageModelTool {
  name = 'reportOut';
  
  description = 'Report results back to the delegating agent and end current agent execution';
  
  parametersSchema = {
    type: 'object',
    properties: {
      report: {
        type: 'string',
        description: 'The report content to send back to the delegating agent'
      }
    },
    required: ['report']
  };
  
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { report } = options.parameters;
    
    // Report back to delegating agent
    delegationEngine.reportOut(options.context.agentName, report);
    
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart('Report submitted successfully.')
    ]);
  }
}
```

### Tool Registration

```typescript
// Register custom tools with VS Code
const delegateWorkTool = new DelegateWorkTool();
const reportOutTool = new ReportOutTool();

context.subscriptions.push(
  vscode.lm.registerTool('delegateWork', delegateWorkTool),
  vscode.lm.registerTool('reportOut', reportOutTool)
);
```

### Tool Filtering

```typescript
interface ToolFilter {
  filterTools(
    allTools: vscode.LanguageModelTool[],
    permissions: ToolPermissions
  ): vscode.LanguageModelTool[];
}

class ToolFilterImpl implements ToolFilter {
  filterTools(
    allTools: vscode.LanguageModelTool[],
    permissions: ToolPermissions
  ): vscode.LanguageModelTool[] {
    switch (permissions.type) {
      case 'all':
        return allTools;
      case 'none':
        return [];
      case 'specific':
        return allTools.filter(tool => permissions.tools.includes(tool.name));
      default:
        return [];
    }
  }
}
```

## Event System

### Extension Events

The extension provides several events for monitoring and integration:

```typescript
// Event emitters
export const onConfigurationChanged = new vscode.EventEmitter<ExtensionConfiguration>();
export const onAgentExecutionStarted = new vscode.EventEmitter<AgentExecutionContext>();
export const onAgentExecutionCompleted = new vscode.EventEmitter<AgentExecutionResult>();
export const onDelegationStarted = new vscode.EventEmitter<DelegationContext>();
export const onDelegationCompleted = new vscode.EventEmitter<DelegationResult>();
export const onError = new vscode.EventEmitter<MultiAgentError>();
```

### Event Subscription

```typescript
// Subscribe to events
const configSubscription = onConfigurationChanged.event((config) => {
  console.log('Configuration changed:', config);
});

const executionSubscription = onAgentExecutionStarted.event((context) => {
  console.log('Agent execution started:', context.agentName);
});

// Dispose subscriptions when done
context.subscriptions.push(configSubscription, executionSubscription);
```

## Extension Points

### Custom Agent Types

While the current version uses configuration-based agents, the architecture supports custom agent implementations:

```typescript
interface CustomAgent {
  name: string;
  description: string;
  useFor: string;
  
  execute(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult>;
  
  canDelegate(targetAgent: string): boolean;
  getAvailableTools(): vscode.LanguageModelTool[];
}
```

### Custom Tool Development

Developers can create custom tools for specific use cases:

```typescript
class CustomTool implements vscode.LanguageModelTool {
  name = 'customTool';
  description = 'A custom tool for specific functionality';
  
  parametersSchema = {
    type: 'object',
    properties: {
      // Define parameters
    }
  };
  
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Implement custom functionality
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart('Custom tool result')
    ]);
  }
}
```

### Configuration Providers

Custom configuration providers can be implemented for advanced scenarios:

```typescript
interface ConfigurationProvider {
  getConfiguration(): Promise<ExtensionConfiguration>;
  validateConfiguration(config: ExtensionConfiguration): ValidationResult;
  onConfigurationChanged: vscode.Event<ExtensionConfiguration>;
}
```

## Integration Examples

### Programmatic Configuration

```typescript
import * as vscode from 'vscode';

async function setupDevelopmentTeam() {
  const config = vscode.workspace.getConfiguration('copilotMultiAgent');
  
  const agents: AgentConfiguration[] = [
    {
      name: 'coordinator',
      systemPrompt: 'You are a development coordinator...',
      description: 'Coordinates development tasks',
      useFor: 'Task orchestration and delegation',
      delegationPermissions: { type: 'all' },
      toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
    },
    {
      name: 'code-reviewer',
      systemPrompt: 'You are a code review specialist...',
      description: 'Specialized in code review',
      useFor: 'Code quality and best practices',
      delegationPermissions: { type: 'none' },
      toolPermissions: { type: 'specific', tools: ['reportOut', 'workspace'] }
    }
  ];
  
  await config.update('entryAgent', 'coordinator', vscode.ConfigurationTarget.Global);
  await config.update('agents', agents, vscode.ConfigurationTarget.Global);
}
```

### Monitoring Agent Activity

```typescript
class AgentMonitor {
  private executionCount = new Map<string, number>();
  private delegationCount = new Map<string, number>();
  
  constructor() {
    onAgentExecutionStarted.event((context) => {
      const count = this.executionCount.get(context.agentName) || 0;
      this.executionCount.set(context.agentName, count + 1);
    });
    
    onDelegationStarted.event((context) => {
      const count = this.delegationCount.get(context.fromAgent) || 0;
      this.delegationCount.set(context.fromAgent, count + 1);
    });
  }
  
  getStats() {
    return {
      executions: Object.fromEntries(this.executionCount),
      delegations: Object.fromEntries(this.delegationCount)
    };
  }
}
```

### Custom Error Handling

```typescript
class CustomErrorHandler {
  constructor() {
    onError.event((error) => {
      this.handleError(error);
    });
  }
  
  private handleError(error: MultiAgentError) {
    switch (error.type) {
      case 'configuration_error':
        this.handleConfigurationError(error);
        break;
      case 'delegation_error':
        this.handleDelegationError(error);
        break;
      default:
        this.handleGenericError(error);
    }
  }
  
  private handleConfigurationError(error: MultiAgentError) {
    vscode.window.showErrorMessage(
      `Configuration Error: ${error.message}`,
      'Open Settings'
    ).then((selection) => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'copilotMultiAgent');
      }
    });
  }
}
```

## Development Guidelines

### Extension Development

When developing extensions that integrate with Copilot Multi-Agent:

1. **Check Extension Availability**:
   ```typescript
   const multiAgentExtension = vscode.extensions.getExtension('copilot-multi-agent');
   if (multiAgentExtension?.isActive) {
     // Extension is available and active
   }
   ```

2. **Respect Configuration**:
   - Don't modify multi-agent configuration without user consent
   - Use the configuration API for programmatic changes
   - Validate configuration changes before applying

3. **Handle Dependencies**:
   - Declare multi-agent extension as a dependency if required
   - Provide graceful degradation if extension is not available
   - Test with and without the extension installed

### Best Practices

#### Configuration Management
- Always validate configuration before use
- Provide meaningful error messages for validation failures
- Use TypeScript interfaces for type safety
- Implement configuration migration for breaking changes

#### Error Handling
- Use the extension's error handling system
- Provide context-specific error messages
- Implement graceful degradation for failures
- Log errors appropriately for debugging

#### Performance Considerations
- Cache configuration when possible
- Avoid blocking operations in event handlers
- Use cancellation tokens for long-running operations
- Monitor memory usage with large agent configurations

#### Testing
- Test with various configuration scenarios
- Validate error handling paths
- Test integration with GitHub Copilot Chat
- Verify performance with multiple agents

### API Stability

The extension follows semantic versioning for API stability:

- **Major Version Changes**: Breaking API changes
- **Minor Version Changes**: New features, backward compatible
- **Patch Version Changes**: Bug fixes, no API changes

Current API version: `1.0.0`

### Contributing

To contribute to the extension development:

1. **Fork the Repository**: [GitHub Repository](https://github.com/mvduijnhoven/copilot-multi-agent)
2. **Follow Development Guidelines**: Use TypeScript, follow existing patterns
3. **Add Tests**: Include unit and integration tests for new features
4. **Update Documentation**: Keep API documentation current
5. **Submit Pull Request**: Include detailed description of changes

### Support and Feedback

- **Issues**: [GitHub Issues](https://github.com/mvduijnhoven/copilot-multi-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mvduijnhoven/copilot-multi-agent/discussions)
- **API Questions**: Tag issues with "api" label for API-related questions