# API Documentation

This document provides technical details about the Copilot Multi-Agent extension's API and extension points for advanced users and developers.

## Extension Architecture

### Core Components

The extension is built around several key components:

- **Chat Participant**: Integrates with VS Code's Chat API
- **Configuration Manager**: Handles agent configuration persistence
- **Agent Engine**: Manages agent execution contexts
- **Delegation Engine**: Orchestrates work delegation between agents
- **Tool Filter**: Controls tool access based on permissions

### Extension Activation

The extension activates on VS Code startup (`onStartupFinished`) and registers:
- Chat participant with ID `copilot-multi-agent.coordinator`
- Configuration schema for agent settings
- Custom delegation tools

## Configuration API

### Programmatic Configuration Access

```typescript
import * as vscode from 'vscode';

// Get current configuration
const config = vscode.workspace.getConfiguration('copilotMultiAgent');

// Access coordinator configuration
const coordinator = config.get<CoordinatorConfiguration>('coordinator');

// Access custom agents
const customAgents = config.get<AgentConfiguration[]>('customAgents');

// Update configuration
await config.update('customAgents', newAgentsArray, vscode.ConfigurationTarget.Global);
```

### Configuration Schema

#### CoordinatorConfiguration
```typescript
interface CoordinatorConfiguration {
  systemPrompt: string;           // 1-5000 characters
  description: string;            // 1-200 characters  
  useFor: string;                // 1-200 characters
  delegationPermissions: DelegationPermissions;
  toolPermissions: ToolPermissions;
}
```

#### AgentConfiguration
```typescript
interface AgentConfiguration {
  name: string;                   // 1-50 chars, alphanumeric + hyphens/underscores
  systemPrompt: string;           // 1-5000 characters
  description: string;            // 1-200 characters
  useFor: string;                // 1-200 characters
  delegationPermissions: DelegationPermissions;
  toolPermissions: ToolPermissions;
}
```

#### Permission Types
```typescript
type DelegationPermissions = 
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'specific'; agents: string[] };

type ToolPermissions = 
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'specific'; tools: string[] };
```

### Configuration Validation

The extension validates configurations using JSON Schema. Common validation rules:

- Agent names must be unique (including 'coordinator')
- Names can only contain letters, numbers, hyphens, and underscores
- All required fields must be present
- String fields must meet length requirements
- Delegation permissions must reference existing agents

## Chat Participant API

### Registration

The extension registers a chat participant with VS Code's Chat API:

```typescript
const participant = vscode.chat.createChatParticipant(
  'copilot-multi-agent.coordinator',
  requestHandler
);

participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');
participant.followupProvider = {
  provideFollowups: (result, context, token) => {
    // Provide contextual follow-up suggestions
  }
};
```

### Request Handling

The chat participant processes requests through the coordinator agent:

```typescript
async function requestHandler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext, 
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  // Route request through coordinator agent
  // Apply tool filtering based on permissions
  // Handle delegation if requested
  // Stream response back to chat interface
}
```

### Response Streaming

Responses are streamed back to the chat interface using VS Code's streaming API:

```typescript
// Stream markdown content
stream.markdown('Response content...');

// Stream progress updates
stream.progress('Processing request...');

// Stream references
stream.reference(vscode.Uri.file('/path/to/file'));

// Stream buttons for follow-up actions
stream.button({
  command: 'extension.command',
  title: 'Action Button',
  arguments: [arg1, arg2]
});
```

## Delegation System API

### Custom Tools

The extension implements two custom tools for delegation:

#### delegateWork Tool
```typescript
interface DelegateWorkParameters {
  agentName: string;              // Target agent name
  workDescription: string;        // Task description
  reportExpectations: string;     // Expected report format
}

class DelegateWorkTool implements vscode.LanguageModelTool {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DelegateWorkParameters>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Validate delegation permissions
    // Create new agent conversation
    // Execute delegated work
    // Return results
  }
}
```

#### reportOut Tool
```typescript
interface ReportOutParameters {
  report: string;                 // Report content to return
}

class ReportOutTool implements vscode.LanguageModelTool {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReportOutParameters>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    // Capture report content
    // Terminate current agent execution
    // Return report to delegating agent
  }
}
```

### Delegation Engine

The delegation engine manages work delegation between agents:

```typescript
interface DelegationEngine {
  // Delegate work from one agent to another
  delegateWork(
    fromAgent: string,
    toAgent: string, 
    workDescription: string,
    reportExpectations: string
  ): Promise<string>;

  // Report results back from delegated agent
  reportOut(agentName: string, report: string): void;

  // Check if delegation is allowed
  isValidDelegation(fromAgent: string, toAgent: string): boolean;

  // Get delegation chain to prevent loops
  getDelegationChain(agentName: string): string[];
}
```

### Conversation Management

Each delegation creates a new conversation context:

```typescript
interface AgentExecutionContext {
  agentName: string;
  conversationId: string;
  parentConversationId?: string;
  systemPrompt: string;
  availableTools: vscode.LanguageModelTool[];
  delegationChain: string[];
}
```

## Tool System API

### Tool Filtering

The tool filter controls which tools agents can access:

```typescript
interface ToolFilter {
  // Get available tools for a specific agent
  getAvailableTools(agentName: string): vscode.LanguageModelTool[];

  // Filter tools based on permissions
  filterTools(
    allTools: vscode.LanguageModelTool[],
    permissions: ToolPermissions
  ): vscode.LanguageModelTool[];

  // Check if agent has access to specific tool
  hasToolAccess(agentName: string, toolName: string): boolean;
}
```

### Tool Registration

Tools are registered with VS Code's Language Model API:

```typescript
// Register custom delegation tools
const delegateWorkTool = vscode.lm.registerTool('delegateWork', new DelegateWorkTool());
const reportOutTool = vscode.lm.registerTool('reportOut', new ReportOutTool());

// Tools are automatically available to agents based on permissions
```

## Error Handling API

### Error Types

The extension defines specific error types:

```typescript
enum MultiAgentErrorType {
  CONFIGURATION_ERROR = 'configuration_error',
  DELEGATION_ERROR = 'delegation_error', 
  TOOL_ACCESS_ERROR = 'tool_access_error',
  AGENT_EXECUTION_ERROR = 'agent_execution_error',
  CIRCULAR_DELEGATION = 'circular_delegation'
}

interface MultiAgentError extends Error {
  type: MultiAgentErrorType;
  agentName?: string;
  details?: Record<string, any>;
}
```

### Error Handler

Centralized error handling with graceful degradation:

```typescript
interface ErrorHandler {
  // Handle and classify errors
  handleError(error: Error, context?: string): MultiAgentError;

  // Log errors with appropriate level
  logError(error: MultiAgentError): void;

  // Show user notifications for critical errors
  notifyUser(error: MultiAgentError): void;

  // Provide fallback responses
  getFallbackResponse(error: MultiAgentError): string;
}
```

## Extension Integration

### Depending on the Extension

To integrate with Copilot Multi-Agent in your extension:

```json
// package.json
{
  "extensionDependencies": [
    "copilot-multi-agent"
  ]
}
```

### Accessing Extension API

```typescript
// Get extension instance
const extension = vscode.extensions.getExtension('copilot-multi-agent');
if (extension?.isActive) {
  const api = extension.exports;
  // Use extension API
}
```

### Configuration Integration

Listen for configuration changes:

```typescript
vscode.workspace.onDidChangeConfiguration(event => {
  if (event.affectsConfiguration('copilotMultiAgent')) {
    // Handle configuration changes
  }
});
```

## Events and Lifecycle

### Extension Events

The extension emits events for key lifecycle moments:

```typescript
// Extension activation
context.subscriptions.push(
  vscode.extensions.onDidChange(() => {
    // Handle extension changes
  })
);

// Configuration changes
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('copilotMultiAgent')) {
      // Reload agent configurations
      // Update chat participant
      // Refresh tool permissions
    }
  })
);
```

### Chat Participant Lifecycle

```typescript
// Participant registration
const participant = vscode.chat.createChatParticipant(id, handler);

// Cleanup on deactivation
context.subscriptions.push(participant);
```

## Development and Testing

### Mock Objects

For testing, the extension provides mock implementations:

```typescript
// Mock VS Code API for testing
const mockVSCode = {
  workspace: {
    getConfiguration: jest.fn(),
    onDidChangeConfiguration: jest.fn()
  },
  chat: {
    createChatParticipant: jest.fn()
  }
};
```

### Test Utilities

```typescript
// Test configuration factory
function createTestConfiguration(overrides?: Partial<AgentConfiguration>): AgentConfiguration {
  return {
    name: 'test-agent',
    systemPrompt: 'Test prompt',
    description: 'Test agent',
    useFor: 'Testing',
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'specific', tools: ['reportOut'] },
    ...overrides
  };
}

// Test delegation scenarios
function createDelegationTest(fromAgent: string, toAgent: string): DelegationTest {
  // Create test scenario for delegation
}
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**: Configurations are loaded on demand
2. **Caching**: Tool filtering results are cached
3. **Context Pooling**: Conversation contexts are reused when possible
4. **Streaming**: Responses are streamed for better UX

### Memory Management

```typescript
// Cleanup conversation contexts
function cleanupContext(contextId: string): void {
  // Remove from active contexts
  // Clear cached data
  // Release resources
}

// Monitor memory usage
function getMemoryUsage(): MemoryUsage {
  return {
    activeContexts: contexts.size,
    cachedTools: toolCache.size,
    totalMemory: process.memoryUsage()
  };
}
```

## Security Considerations

### Input Validation

All user inputs are validated:

```typescript
function validateAgentName(name: string): boolean {
  return /^[a-zA-Z0-9-_]+$/.test(name) && name.length <= 50;
}

function sanitizeSystemPrompt(prompt: string): string {
  // Remove potentially dangerous content
  // Limit length
  // Escape special characters
}
```

### Permission Enforcement

Tool and delegation permissions are strictly enforced:

```typescript
function enforceToolPermissions(agentName: string, toolName: string): boolean {
  const agent = getAgentConfiguration(agentName);
  return hasToolAccess(agent.toolPermissions, toolName);
}

function enforceDelegationPermissions(fromAgent: string, toAgent: string): boolean {
  const agent = getAgentConfiguration(fromAgent);
  return canDelegate(agent.delegationPermissions, toAgent);
}
```

## Future Extension Points

### Plugin Architecture

Future versions may support:

- Custom tool plugins
- Agent template system
- External agent integrations
- Webhook support for external triggers

### API Expansion

Planned API additions:

- Agent performance metrics
- Conversation analytics
- Custom delegation strategies
- Integration with external AI services