/**
 * Comprehensive unit tests for AgentEngine
 * Covers agent lifecycle, context management, and error scenarios
 */

import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { DefaultAgentEngine } from '../services/agent-engine';
import { ToolFilter } from '../services/tool-filter';
import { ISystemPromptBuilder } from '../models/system-prompt-builder';
import { 
  AgentConfiguration, 
  AgentExecutionContext,
  ExtensionConfiguration,
  AgentExecutionError
} from '../models';

// Mock ToolFilter
class MockToolFilter implements ToolFilter {
  private mockTools: any[] = [
    { name: 'delegateWork', description: 'Delegate work to another agent' },
    { name: 'reportOut', description: 'Report completion of work' },
    { name: 'testTool', description: 'Test tool' }
  ];

  async getAvailableTools(agentName: string): Promise<any[]> {
    if (agentName === 'coordinator') {
      return this.mockTools.filter(t => ['delegateWork', 'reportOut'].includes(t.name));
    }
    if (agentName === 'test-agent') {
      return this.mockTools.filter(t => t.name === 'testTool');
    }
    if (agentName === 'no-tools-agent') {
      return [];
    }
    return this.mockTools;
  }

  filterTools(allTools: any[], permissions: any): any[] {
    return allTools;
  }

  hasToolAccess(agentName: string, toolName: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  getAllToolNames(): string[] {
    return this.mockTools.map(t => t.name);
  }

  validateToolPermissions(permissions: any): { isValid: boolean; errors: string[] } {
    return { isValid: true, errors: [] };
  }

  getAgentToolPermissions(agentName: string): Promise<any> {
    return Promise.resolve({ type: 'all' });
  }

  addCustomTool(name: string, tool: any): void {}
  removeCustomTool(name: string): void {}
  setAvailableTools(tools: any[]): void {}
}

// Mock SystemPromptBuilder
class MockSystemPromptBuilder implements ISystemPromptBuilder {
  buildSystemPrompt(basePrompt: string, agentName: string, config: ExtensionConfiguration): string {
    if (config && config.agents.length > 1) {
      return `${basePrompt}\n\n## Available Agents for Delegation\n- test-agent: Testing purposes`;
    }
    return basePrompt;
  }

  getDelegationTargets(agentName: string, config: ExtensionConfiguration): any[] {
    if (agentName === 'coordinator' && config) {
      return config.agents
        .filter(a => a.name !== agentName)
        .map(a => ({ name: a.name, useFor: a.useFor }));
    }
    return [];
  }

  formatDelegationSection(targets: any[]): string {
    if (targets.length === 0) {return '';}
    return `## Available Agents for Delegation\n${targets.map(t => `- ${t.name}: ${t.useFor}`).join('\n')}`;
  }

  getEnumeratedAgentNames(agentName: string, config: ExtensionConfiguration): string[] {
    return this.getDelegationTargets(agentName, config).map(t => t.name);
  }
}

suite('Comprehensive AgentEngine Tests', () => {
  let agentEngine: DefaultAgentEngine;
  let mockToolFilter: MockToolFilter;
  let mockSystemPromptBuilder: MockSystemPromptBuilder;

  const createTestAgent = (name: string, overrides: Partial<AgentConfiguration> = {}): AgentConfiguration => ({
    name,
    systemPrompt: `You are ${name} agent`,
    description: `${name} agent description`,
    useFor: `${name} specific tasks`,
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'all' },
    ...overrides
  });

  const createTestConfig = (agents: AgentConfiguration[]): ExtensionConfiguration => ({
    entryAgent: agents[0]?.name || 'coordinator',
    agents
  });

  setup(() => {
    mockToolFilter = new MockToolFilter();
    mockSystemPromptBuilder = new MockSystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(mockToolFilter, mockSystemPromptBuilder);
  });

  teardown(() => {
    // Clean up any active agents
    const activeAgents = agentEngine.getActiveAgents();
    activeAgents.forEach(agent => agentEngine.terminateAgent(agent.agentName));
  });

  suite('Agent Initialization', () => {
    test('should initialize agent with basic configuration', async () => {
      const agentConfig = createTestAgent('test-agent');
      
      const context = await agentEngine.initializeAgent(agentConfig);

      assert.strictEqual(context.agentName, 'test-agent');
      assert.ok(context.conversationId);
      assert.strictEqual(context.systemPrompt, 'You are test-agent agent');
      assert.ok(Array.isArray(context.availableTools));
      assert.ok(Array.isArray(context.delegationChain));
      assert.strictEqual(context.delegationChain.length, 0);
    });

    test('should initialize agent with extended system prompt when extension config provided', async () => {
      const coordinatorConfig = createTestAgent('coordinator', {
        delegationPermissions: { type: 'all' }
      });
      const testAgentConfig = createTestAgent('test-agent');
      const extensionConfig = createTestConfig([coordinatorConfig, testAgentConfig]);

      const context = await agentEngine.initializeAgent(coordinatorConfig, extensionConfig);

      assert.ok(context.systemPrompt.includes('Available Agents for Delegation'));
      assert.ok(context.availableDelegationTargets.length > 0);
      assert.strictEqual(context.availableDelegationTargets[0].name, 'test-agent');
    });

    test('should initialize agent with appropriate tools', async () => {
      const coordinatorConfig = createTestAgent('coordinator');
      
      const context = await agentEngine.initializeAgent(coordinatorConfig);

      assert.ok(context.availableTools.some(tool => tool.name === 'delegateWork'));
      assert.ok(context.availableTools.some(tool => tool.name === 'reportOut'));
    });

    test('should handle initialization errors gracefully', async () => {
      const invalidConfig = null as any;

      await assert.rejects(
        () => agentEngine.initializeAgent(invalidConfig),
        AgentExecutionError
      );
    });

    test('should generate unique conversation IDs', async () => {
      const agentConfig = createTestAgent('test-agent');
      
      const context1 = await agentEngine.initializeAgent(agentConfig);
      const context2 = await agentEngine.initializeAgent(agentConfig);

      assert.notStrictEqual(context1.conversationId, context2.conversationId);
    });
  });

  suite('Child Agent Initialization', () => {
    test('should initialize child agent with delegation chain', async () => {
      const parentConfig = createTestAgent('parent-agent');
      const childConfig = createTestAgent('child-agent');
      const extensionConfig = createTestConfig([parentConfig, childConfig]);

      // Initialize parent first
      const parentContext = await agentEngine.initializeAgent(parentConfig, extensionConfig);
      
      // Initialize child agent
      const childContext = await (agentEngine as any).initializeChildAgent(
        childConfig, 
        parentContext, 
        extensionConfig
      );

      assert.strictEqual(childContext.agentName, 'child-agent');
      assert.strictEqual(childContext.parentConversationId, parentContext.conversationId);
      assert.strictEqual(childContext.delegationChain.length, 1);
      assert.strictEqual(childContext.delegationChain[0], 'parent-agent');
    });

    test('should detect circular delegation in child initialization', async () => {
      const agentConfig = createTestAgent('circular-agent');
      const extensionConfig = createTestConfig([agentConfig]);

      // Create a context that already has the agent in delegation chain
      const parentContext: AgentExecutionContext = {
        agentName: 'parent-agent',
        conversationId: 'parent-123',
        systemPrompt: 'Parent prompt',
        availableTools: [],
        delegationChain: ['circular-agent'], // Agent already in chain
        availableDelegationTargets: []
      };

      await assert.rejects(
        () => (agentEngine as any).initializeChildAgent(agentConfig, parentContext, extensionConfig),
        AgentExecutionError
      );
    });

    test('should handle deep delegation chains', async () => {
      const agents = [
        createTestAgent('agent1'),
        createTestAgent('agent2'),
        createTestAgent('agent3'),
        createTestAgent('agent4')
      ];
      const extensionConfig = createTestConfig(agents);

      // Create a deep delegation chain
      let currentContext = await agentEngine.initializeAgent(agents[0], extensionConfig);
      
      for (let i = 1; i < agents.length; i++) {
        currentContext = await (agentEngine as any).initializeChildAgent(
          agents[i], 
          currentContext, 
          extensionConfig
        );
      }

      assert.strictEqual(currentContext.delegationChain.length, 3);
      assert.deepStrictEqual(currentContext.delegationChain, ['agent1', 'agent2', 'agent3']);
    });
  });

  suite('Agent Execution', () => {
    test('should execute agent with valid context', async () => {
      const agentConfig = createTestAgent('test-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const result = await agentEngine.executeAgent(context, 'Test input');

      assert.ok(result.includes('test-agent'));
      assert.ok(result.includes('Test input'));
    });

    test('should reject execution with invalid context', async () => {
      const invalidContext = {
        agentName: '',
        conversationId: '',
        systemPrompt: '',
        availableTools: null,
        delegationChain: null,
        availableDelegationTargets: []
      } as any;

      await assert.rejects(
        () => agentEngine.executeAgent(invalidContext, 'Test input'),
        AgentExecutionError
      );
    });

    test('should apply system prompt and context isolation', async () => {
      const agentConfig = createTestAgent('test-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const result = await agentEngine.executeAgent(context, 'Test input');

      // Result should include context information
      assert.ok(result.includes('test-agent'));
    });

    test('should handle execution errors gracefully', async () => {
      const agentConfig = createTestAgent('error-agent');
      const context = await agentEngine.initializeAgent(agentConfig);
      
      // Simulate execution error by corrupting context
      context.agentName = null as any;

      await assert.rejects(
        () => agentEngine.executeAgent(context, 'Test input'),
        AgentExecutionError
      );
    });
  });

  suite('Context Management', () => {
    test('should store and retrieve agent contexts', async () => {
      const agentConfig = createTestAgent('stored-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const retrievedContext = agentEngine.getAgentContext('stored-agent');

      assert.deepStrictEqual(retrievedContext, context);
    });

    test('should return undefined for non-existent agent context', () => {
      const context = agentEngine.getAgentContext('non-existent-agent');
      assert.strictEqual(context, undefined);
    });

    test('should retrieve context by conversation ID', async () => {
      const agentConfig = createTestAgent('conversation-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const retrievedContext = (agentEngine as any).getAgentContextByConversation(context.conversationId);

      assert.deepStrictEqual(retrievedContext, context);
    });

    test('should list all active agents', async () => {
      const agent1Config = createTestAgent('agent1');
      const agent2Config = createTestAgent('agent2');

      await agentEngine.initializeAgent(agent1Config);
      await agentEngine.initializeAgent(agent2Config);

      const activeAgents = agentEngine.getActiveAgents();

      assert.strictEqual(activeAgents.length, 2);
      assert.ok(activeAgents.some(a => a.agentName === 'agent1'));
      assert.ok(activeAgents.some(a => a.agentName === 'agent2'));
    });
  });

  suite('Agent Termination', () => {
    test('should terminate agent and remove context', async () => {
      const agentConfig = createTestAgent('terminate-agent');
      await agentEngine.initializeAgent(agentConfig);

      agentEngine.terminateAgent('terminate-agent');

      const context = agentEngine.getAgentContext('terminate-agent');
      assert.strictEqual(context, undefined);
    });

    test('should terminate agent by conversation ID', async () => {
      const agentConfig = createTestAgent('conversation-terminate');
      const context = await agentEngine.initializeAgent(agentConfig);

      (agentEngine as any).terminateAgentByConversation(context.conversationId);

      const retrievedContext = agentEngine.getAgentContext('conversation-terminate');
      assert.strictEqual(retrievedContext, undefined);
    });

    test('should terminate child agents when parent is terminated', async () => {
      const parentConfig = createTestAgent('parent-agent');
      const childConfig = createTestAgent('child-agent');
      const extensionConfig = createTestConfig([parentConfig, childConfig]);

      const parentContext = await agentEngine.initializeAgent(parentConfig, extensionConfig);
      await (agentEngine as any).initializeChildAgent(childConfig, parentContext, extensionConfig);

      // Terminate parent
      agentEngine.terminateAgent('parent-agent');

      // Both parent and child should be terminated
      assert.strictEqual(agentEngine.getAgentContext('parent-agent'), undefined);
      assert.strictEqual(agentEngine.getAgentContext('child-agent'), undefined);
    });

    test('should handle termination of non-existent agent gracefully', () => {
      assert.doesNotThrow(() => {
        agentEngine.terminateAgent('non-existent-agent');
      });
    });
  });

  suite('Delegation Chain Management', () => {
    test('should track delegation chains correctly', async () => {
      const parentConfig = createTestAgent('parent');
      const childConfig = createTestAgent('child');
      const extensionConfig = createTestConfig([parentConfig, childConfig]);

      const parentContext = await agentEngine.initializeAgent(parentConfig, extensionConfig);
      const childContext = await (agentEngine as any).initializeChildAgent(childConfig, parentContext, extensionConfig);

      const delegationChain = (agentEngine as any).getDelegationChain('child');

      assert.deepStrictEqual(delegationChain, ['parent', 'child']);
    });

    test('should detect circular delegation attempts', async () => {
      const agent1Config = createTestAgent('agent1');
      const agent2Config = createTestAgent('agent2');
      const extensionConfig = createTestConfig([agent1Config, agent2Config]);

      // Create delegation chain: agent1 -> agent2
      const agent1Context = await agentEngine.initializeAgent(agent1Config, extensionConfig);
      await (agentEngine as any).initializeChildAgent(agent2Config, agent1Context, extensionConfig);

      // Try to delegate back to agent1 (circular)
      const wouldBeCircular = (agentEngine as any).wouldCreateCircularDelegation('agent2', 'agent1');

      assert.strictEqual(wouldBeCircular, true);
    });

    test('should allow valid delegation that does not create circles', async () => {
      const agent1Config = createTestAgent('agent1');
      const agent2Config = createTestAgent('agent2');
      const agent3Config = createTestAgent('agent3');
      const extensionConfig = createTestConfig([agent1Config, agent2Config, agent3Config]);

      // Create delegation chain: agent1 -> agent2
      const agent1Context = await agentEngine.initializeAgent(agent1Config, extensionConfig);
      await (agentEngine as any).initializeChildAgent(agent2Config, agent1Context, extensionConfig);

      // Try to delegate to agent3 (not circular)
      const wouldBeCircular = (agentEngine as any).wouldCreateCircularDelegation('agent2', 'agent3');

      assert.strictEqual(wouldBeCircular, false);
    });
  });

  suite('Tool Management', () => {
    test('should update agent tools dynamically', async () => {
      const agentConfig = createTestAgent('tool-update-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const originalToolCount = context.availableTools.length;

      await (agentEngine as any).updateAgentTools('tool-update-agent');

      const updatedContext = agentEngine.getAgentContext('tool-update-agent');
      assert.ok(updatedContext);
      assert.strictEqual(updatedContext.availableTools.length, originalToolCount);
    });

    test('should handle tool updates for non-existent agents gracefully', async () => {
      await assert.doesNotReject(() => 
        (agentEngine as any).updateAgentTools('non-existent-agent')
      );
    });
  });

  suite('Context Validation', () => {
    test('should validate complete context as valid', async () => {
      const agentConfig = createTestAgent('valid-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const isValid = (agentEngine as any).isValidContext(context);

      assert.strictEqual(isValid, true);
    });

    test('should validate incomplete context as invalid', () => {
      const incompleteContext = {
        agentName: 'test-agent',
        conversationId: '',
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: []
      } as any;

      const isValid = (agentEngine as any).isValidContext(incompleteContext);

      assert.strictEqual(isValid, false);
    });

    test('should validate null context as invalid', () => {
      const isValid = (agentEngine as any).isValidContext(null);

      assert.strictEqual(isValid, false);
    });
  });

  suite('System Prompt Application', () => {
    test('should apply system prompt with context information', async () => {
      const agentConfig = createTestAgent('prompt-agent');
      const context = await agentEngine.initializeAgent(agentConfig);

      const enhancedInput = (agentEngine as any).applySystemPrompt(context, 'Test input');

      assert.ok(enhancedInput.includes('System: You are prompt-agent agent'));
      assert.ok(enhancedInput.includes('Agent: prompt-agent'));
      assert.ok(enhancedInput.includes('Conversation: ' + context.conversationId));
      assert.ok(enhancedInput.includes('User Input: Test input'));
    });

    test('should include delegation chain in system prompt when present', async () => {
      const parentConfig = createTestAgent('parent');
      const childConfig = createTestAgent('child');
      const extensionConfig = createTestConfig([parentConfig, childConfig]);

      const parentContext = await agentEngine.initializeAgent(parentConfig, extensionConfig);
      const childContext = await (agentEngine as any).initializeChildAgent(childConfig, parentContext, extensionConfig);

      const enhancedInput = (agentEngine as any).applySystemPrompt(childContext, 'Test input');

      assert.ok(enhancedInput.includes('Delegation Chain: parent'));
      assert.ok(enhancedInput.includes('Parent Conversation: ' + parentContext.conversationId));
    });

    test('should include available tools in system prompt', async () => {
      const agentConfig = createTestAgent('coordinator');
      const context = await agentEngine.initializeAgent(agentConfig);

      const enhancedInput = (agentEngine as any).applySystemPrompt(context, 'Test input');

      assert.ok(enhancedInput.includes('Available Tools:'));
      assert.ok(enhancedInput.includes('delegateWork'));
      assert.ok(enhancedInput.includes('reportOut'));
    });
  });

  suite('Error Scenarios', () => {
    test('should handle tool filter errors during initialization', async () => {
      // Create a mock that throws an error
      const errorToolFilter = {
        getAvailableTools: sinon.stub().rejects(new Error('Tool filter error'))
      } as any;

      const errorAgentEngine = new DefaultAgentEngine(errorToolFilter, mockSystemPromptBuilder);
      const agentConfig = createTestAgent('error-agent');

      await assert.rejects(
        () => errorAgentEngine.initializeAgent(agentConfig),
        AgentExecutionError
      );
    });

    test('should handle system prompt builder errors during initialization', async () => {
      // Create a mock that throws an error
      const errorSystemPromptBuilder = {
        buildSystemPrompt: sinon.stub().throws(new Error('System prompt error')),
        getDelegationTargets: sinon.stub().returns([])
      } as any;

      const errorAgentEngine = new DefaultAgentEngine(mockToolFilter, errorSystemPromptBuilder);
      const agentConfig = createTestAgent('error-agent');
      const extensionConfig = createTestConfig([agentConfig]);

      await assert.rejects(
        () => errorAgentEngine.initializeAgent(agentConfig, extensionConfig),
        AgentExecutionError
      );
    });

    test('should handle memory pressure with many agents', async () => {
      const manyAgents = Array.from({ length: 100 }, (_, i) => 
        createTestAgent(`agent-${i}`)
      );

      // Initialize many agents
      for (const agentConfig of manyAgents) {
        await agentEngine.initializeAgent(agentConfig);
      }

      const activeAgents = agentEngine.getActiveAgents();
      assert.strictEqual(activeAgents.length, 100);

      // Terminate all agents
      for (const agentConfig of manyAgents) {
        agentEngine.terminateAgent(agentConfig.name);
      }

      const remainingAgents = agentEngine.getActiveAgents();
      assert.strictEqual(remainingAgents.length, 0);
    });
  });

  suite('Concurrent Operations', () => {
    test('should handle concurrent agent initialization', async () => {
      const agents = Array.from({ length: 10 }, (_, i) => 
        createTestAgent(`concurrent-agent-${i}`)
      );

      const initPromises = agents.map(agent => 
        agentEngine.initializeAgent(agent)
      );

      const contexts = await Promise.all(initPromises);

      assert.strictEqual(contexts.length, 10);
      contexts.forEach((context, i) => {
        assert.strictEqual(context.agentName, `concurrent-agent-${i}`);
      });
    });

    test('should handle concurrent agent termination', async () => {
      const agents = Array.from({ length: 10 }, (_, i) => 
        createTestAgent(`terminate-concurrent-${i}`)
      );

      // Initialize all agents
      await Promise.all(agents.map(agent => 
        agentEngine.initializeAgent(agent)
      ));

      // Terminate all agents concurrently
      const terminatePromises = agents.map(agent => 
        Promise.resolve(agentEngine.terminateAgent(agent.name))
      );

      await Promise.all(terminatePromises);

      const remainingAgents = agentEngine.getActiveAgents();
      assert.strictEqual(remainingAgents.length, 0);
    });
  });
});