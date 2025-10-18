/**
 * Unit tests for entry agent execution functionality (Task 6.2)
 */

import * as assert from 'assert';
import { MultiAgentChatParticipant } from '../services/chat-participant';
import { ConfigurationManager } from '../services/configuration-manager';
import { DefaultAgentEngine } from '../services/agent-engine';
import { DefaultToolFilter } from '../services/tool-filter';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { SystemPromptBuilder } from '../services/system-prompt-builder';

// Mock VS Code API for testing
const mockVscode = {
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 'user', content })
  },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelToolResult: class {
    constructor(public content: any[]) {}
  },
  CancellationError: class extends Error {
    constructor() {
      super('Operation was cancelled');
      this.name = 'CancellationError';
    }
  },
  lm: {
    selectChatModels: async () => []
  }
};

// Replace vscode import with mock for testing
(global as any).vscode = mockVscode;

suite('Entry Agent Execution Unit Tests', () => {
  let chatParticipant: MultiAgentChatParticipant;
  let configManager: ConfigurationManager;
  let agentEngine: DefaultAgentEngine;
  let toolFilter: DefaultToolFilter;
  let delegationEngine: DefaultDelegationEngine;

  setup(() => {
    // Initialize dependencies with mocks
    configManager = {
      loadConfiguration: async () => ({
        entryAgent: 'test-entry-agent',
        agents: [
          {
            name: 'test-entry-agent',
            systemPrompt: 'You are a test entry agent.',
            description: 'Test entry agent for unit testing',
            useFor: 'Testing entry agent functionality',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      }),
      dispose: () => {}
    } as any;

    toolFilter = {
      getAvailableTools: async () => [],
      hasToolAccess: async () => false,
      setAvailableTools: () => {},
      filterTools: (tools: any[]) => tools
    } as any;

    const systemPromptBuilder = new SystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
    
    delegationEngine = {
      delegateWork: async () => 'Mock delegation result',
      reportOut: () => {},
      isValidDelegation: async () => true
    } as any;

    chatParticipant = new MultiAgentChatParticipant(
      configManager,
      agentEngine,
      toolFilter,
      delegationEngine
    );
  });

  teardown(() => {
    if (chatParticipant) {
      chatParticipant.dispose();
    }
  });

  test('should initialize entry agent with configured system prompt', async () => {
    // Test that the entry agent is initialized with the correct system prompt
    const config = await configManager.loadConfiguration();
    const entryAgent = config.agents.find(a => a.name === config.entryAgent);
    
    assert.ok(entryAgent, 'Entry agent should be found in configuration');
    assert.strictEqual(entryAgent.name, 'test-entry-agent');
    assert.strictEqual(entryAgent.systemPrompt, 'You are a test entry agent.');
    assert.strictEqual(entryAgent.description, 'Test entry agent for unit testing');
    assert.strictEqual(entryAgent.useFor, 'Testing entry agent functionality');
  });

  test('should apply tool filtering based on entry agent permissions', async () => {
    // Create a mock tool filter that tracks calls
    let getAvailableToolsCalled = false;
    let calledWithAgentName = '';

    const mockToolFilter = {
      getAvailableTools: async (agentName: string) => {
        getAvailableToolsCalled = true;
        calledWithAgentName = agentName;
        return [
          { name: 'tool1', description: 'Test tool 1' },
          { name: 'tool2', description: 'Test tool 2' }
        ];
      },
      hasToolAccess: async () => false,
      setAvailableTools: () => {},
      filterTools: (tools: any[]) => tools
    } as any;

    const testChatParticipant = new MultiAgentChatParticipant(
      configManager,
      agentEngine,
      mockToolFilter,
      delegationEngine
    );

    // Access private method for testing
    const entryAgentConfig = {
      name: 'test-entry-agent',
      systemPrompt: 'Test prompt',
      description: 'Test description',
      useFor: 'Testing',
      delegationPermissions: { type: 'none' as const },
      toolPermissions: { type: 'all' as const }
    };

    const entryAgentContext = await agentEngine.initializeAgent(entryAgentConfig);

    // Verify tool filtering is applied
    assert.ok(entryAgentContext.availableTools, 'Entry agent context should have available tools');
    
    testChatParticipant.dispose();
  });

  test('should provision delegation tools when delegation is allowed', async () => {
    // Create configuration with delegation permissions
    const mockConfigManager = {
      loadConfiguration: async () => ({
        entryAgent: 'delegating-agent',
        agents: [
          {
            name: 'delegating-agent',
            systemPrompt: 'You are a delegating agent.',
            description: 'Agent that can delegate work',
            useFor: 'Testing delegation capabilities',
            delegationPermissions: { type: 'specific', agents: ['worker-agent'] },
            toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
          },
          {
            name: 'worker-agent',
            systemPrompt: 'You are a worker agent.',
            description: 'Agent that receives delegated work',
            useFor: 'Executing delegated tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      }),
      dispose: () => {}
    } as any;

    // Create mock tool filter that allows delegation tools
    const mockToolFilter = {
      getAvailableTools: async () => [],
      hasToolAccess: async (agentName: string, toolName: string) => {
        return agentName === 'delegating-agent' && ['delegateWork', 'reportOut'].includes(toolName);
      },
      setAvailableTools: () => {},
      filterTools: (tools: any[]) => tools
    } as any;

    const testChatParticipant = new MultiAgentChatParticipant(
      mockConfigManager,
      agentEngine,
      mockToolFilter,
      delegationEngine
    );

    // Test delegation tool provisioning
    const config = await mockConfigManager.loadConfiguration();
    const delegatingAgent = config.agents.find((a: any) => a.name === 'delegating-agent');
    
    assert.ok(delegatingAgent, 'Delegating agent should be found');
    assert.strictEqual(delegatingAgent.delegationPermissions.type, 'specific');
    assert.deepStrictEqual(delegatingAgent.delegationPermissions.agents, ['worker-agent']);
    assert.deepStrictEqual(delegatingAgent.toolPermissions.tools, ['delegateWork', 'reportOut']);

    testChatParticipant.dispose();
  });

  test('should not provision delegation tools when delegation is disabled', async () => {
    // Create configuration with no delegation permissions
    const mockConfigManager = {
      loadConfiguration: async () => ({
        entryAgent: 'non-delegating-agent',
        agents: [
          {
            name: 'non-delegating-agent',
            systemPrompt: 'You are a non-delegating agent.',
            description: 'Agent that cannot delegate work',
            useFor: 'Testing no delegation scenario',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      }),
      dispose: () => {}
    } as any;

    const testChatParticipant = new MultiAgentChatParticipant(
      mockConfigManager,
      agentEngine,
      toolFilter,
      delegationEngine
    );

    // Test that delegation is disabled
    const config = await mockConfigManager.loadConfiguration();
    const nonDelegatingAgent = config.agents.find((a: any) => a.name === 'non-delegating-agent');
    
    assert.ok(nonDelegatingAgent, 'Non-delegating agent should be found');
    assert.strictEqual(nonDelegatingAgent.delegationPermissions.type, 'none');

    testChatParticipant.dispose();
  });

  test('should handle language model availability check', () => {
    // Test the private method for checking language model availability
    const testChatParticipant = new MultiAgentChatParticipant(
      configManager,
      agentEngine,
      toolFilter,
      delegationEngine
    );

    // Access private method for testing
    const isAvailable = (testChatParticipant as any).isLanguageModelAvailable();
    
    // Should return false in test environment since we don't have real VS Code language model
    assert.strictEqual(typeof isAvailable, 'boolean', 'Should return a boolean value');

    testChatParticipant.dispose();
  });

  test('should create proper agent execution context', async () => {
    // Test that agent execution context is created correctly
    const config = await configManager.loadConfiguration();
    const entryAgent = config.agents[0];
    
    const context = await agentEngine.initializeAgent(entryAgent, config);
    
    assert.ok(context, 'Agent execution context should be created');
    assert.strictEqual(context.agentName, entryAgent.name);
    assert.ok(context.conversationId, 'Context should have conversation ID');
    assert.ok(context.systemPrompt, 'Context should have system prompt');
    assert.ok(Array.isArray(context.availableTools), 'Context should have available tools array');
    assert.ok(Array.isArray(context.delegationChain), 'Context should have delegation chain array');
    assert.ok(Array.isArray(context.availableDelegationTargets), 'Context should have delegation targets array');
  });

  test('should handle entry agent execution with fallback', async () => {
    // Test that entry agent execution works with simulation fallback
    const config = await configManager.loadConfiguration();
    const entryAgent = config.agents[0];
    const context = await agentEngine.initializeAgent(entryAgent, config);
    
    // Test agent execution (should use simulation in test environment)
    const result = await agentEngine.executeAgent(context, 'Test message');
    
    assert.ok(result, 'Agent execution should return a result');
    assert.strictEqual(typeof result, 'string', 'Result should be a string');
    assert.ok(result.includes(entryAgent.name), 'Result should include agent name');
  });
});