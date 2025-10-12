/**
 * Unit tests for AgentEngine service
 */

import * as assert from 'assert';
import { DefaultAgentEngine } from '../services/agent-engine';
import { DefaultToolFilter } from '../services/tool-filter';
import { IConfigurationManager } from '../services/configuration-manager';
import { 
  AgentConfiguration, 
  AgentExecutionContext, 
  AgentExecutionError,
  DEFAULT_EXTENSION_CONFIG 
} from '../models';

// Mock ConfigurationManager for testing
class MockConfigurationManager implements IConfigurationManager {
  private config = {
    ...DEFAULT_EXTENSION_CONFIG,
    customAgents: [
      {
        name: 'test-agent',
        systemPrompt: 'You are a test agent for unit testing.',
        description: 'Test agent for unit tests',
        useFor: 'Testing purposes',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'all' as const }
      },
      {
        name: 'agent1',
        systemPrompt: 'Agent 1',
        description: 'Agent 1',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'all' as const }
      },
      {
        name: 'agent2',
        systemPrompt: 'Agent 2',
        description: 'Agent 2',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'all' as const }
      },
      {
        name: 'agent3',
        systemPrompt: 'Agent 3',
        description: 'Agent 3',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'all' as const }
      },
      {
        name: 'child-agent',
        systemPrompt: 'Child agent',
        description: 'Child agent',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' as const },
        toolPermissions: { type: 'all' as const }
      }
    ]
  };

  async loadConfiguration() {
    return this.config;
  }

  async saveConfiguration(config: any) {
    this.config = { ...this.config, ...config };
  }

  validateConfiguration(config: any) {
    return true;
  }

  getDefaultConfiguration() {
    return DEFAULT_EXTENSION_CONFIG;
  }

  onConfigurationChanged(callback: (config: any) => void) {
    // Mock implementation
  }

  dispose() {
    // Mock implementation
  }
}

suite('AgentEngine Tests', () => {
  let agentEngine: DefaultAgentEngine;
  let toolFilter: DefaultToolFilter;
  let configManager: MockConfigurationManager;

  const testAgentConfig: AgentConfiguration = {
    name: 'test-agent',
    systemPrompt: 'You are a test agent for unit testing.',
    description: 'Test agent for unit tests',
    useFor: 'Testing purposes',
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'all' }
  };

  setup(() => {
    configManager = new MockConfigurationManager();
    toolFilter = new DefaultToolFilter(configManager);
    agentEngine = new DefaultAgentEngine(toolFilter);
  });

  suite('Agent Initialization', () => {
    test('should initialize agent with valid configuration', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);

      assert.strictEqual(context.agentName, testAgentConfig.name);
      assert.strictEqual(context.systemPrompt, testAgentConfig.systemPrompt);
      assert.ok(context.conversationId);
      assert.ok(Array.isArray(context.availableTools));
      assert.ok(Array.isArray(context.delegationChain));
      assert.strictEqual(context.delegationChain.length, 0);
      assert.strictEqual(context.parentConversationId, undefined);
    });

    test('should store initialized agent context', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const retrievedContext = agentEngine.getAgentContext(testAgentConfig.name);

      assert.deepStrictEqual(retrievedContext, context);
    });

    test('should generate unique conversation IDs', async () => {
      const context1 = await agentEngine.initializeAgent(testAgentConfig);
      
      // Terminate first agent and create another with same name
      agentEngine.terminateAgent(testAgentConfig.name);
      const context2 = await agentEngine.initializeAgent(testAgentConfig);

      assert.notStrictEqual(context1.conversationId, context2.conversationId);
    });

    test('should handle initialization errors gracefully', async () => {
      // Create invalid config
      const invalidConfig = { ...testAgentConfig, name: '' };

      try {
        await agentEngine.initializeAgent(invalidConfig as AgentConfiguration);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof AgentExecutionError);
        assert.strictEqual(error.type, 'agent_execution_error');
      }
    });
  });

  suite('Child Agent Initialization', () => {
    test('should initialize child agent with parent context', async () => {
      const parentContext = await agentEngine.initializeAgent(testAgentConfig);
      
      const childConfig: AgentConfiguration = {
        ...testAgentConfig,
        name: 'child-agent'
      };

      const childContext = await agentEngine.initializeChildAgent(childConfig, parentContext);

      assert.strictEqual(childContext.agentName, 'child-agent');
      assert.strictEqual(childContext.parentConversationId, parentContext.conversationId);
      assert.deepStrictEqual(childContext.delegationChain, [testAgentConfig.name]);
      assert.notStrictEqual(childContext.conversationId, parentContext.conversationId);
    });

    test('should detect circular delegation', async () => {
      const parentContext = await agentEngine.initializeAgent(testAgentConfig);
      
      // Try to create child with same name as parent (circular delegation)
      try {
        await agentEngine.initializeChildAgent(testAgentConfig, parentContext);
        assert.fail('Should have thrown circular delegation error');
      } catch (error) {
        assert.ok(error instanceof AgentExecutionError);
        assert.ok(error.message.includes('Circular delegation detected'));
      }
    });

    test('should build delegation chain correctly', async () => {
      const agent1Config: AgentConfiguration = { ...testAgentConfig, name: 'agent1' };
      const agent2Config: AgentConfiguration = { ...testAgentConfig, name: 'agent2' };
      const agent3Config: AgentConfiguration = { ...testAgentConfig, name: 'agent3' };

      const context1 = await agentEngine.initializeAgent(agent1Config);
      const context2 = await agentEngine.initializeChildAgent(agent2Config, context1);
      const context3 = await agentEngine.initializeChildAgent(agent3Config, context2);

      assert.deepStrictEqual(context3.delegationChain, ['agent1', 'agent2']);
    });
  });

  suite('Agent Execution', () => {
    test('should execute agent with valid context', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const input = 'Test input message';

      const response = await agentEngine.executeAgent(context, input);

      assert.ok(typeof response === 'string');
      assert.ok(response.includes(context.agentName));
      assert.ok(response.includes(input));
    });

    test('should apply system prompt to input', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const input = 'Test input';

      const response = await agentEngine.executeAgent(context, input);

      assert.ok(response.includes(testAgentConfig.systemPrompt));
    });

    test('should handle execution errors', async () => {
      const invalidContext = {
        agentName: '',
        conversationId: '',
        systemPrompt: '',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      } as AgentExecutionContext;

      try {
        await agentEngine.executeAgent(invalidContext, 'test');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof AgentExecutionError);
      }
    });
  });

  suite('Agent Context Management', () => {
    test('should retrieve agent context by name', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const retrieved = agentEngine.getAgentContext(testAgentConfig.name);

      assert.deepStrictEqual(retrieved, context);
    });

    test('should return undefined for non-existent agent', () => {
      const retrieved = agentEngine.getAgentContext('non-existent');
      assert.strictEqual(retrieved, undefined);
    });

    test('should retrieve agent context by conversation ID', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const retrieved = agentEngine.getAgentContextByConversation(context.conversationId);

      assert.deepStrictEqual(retrieved, context);
    });

    test('should list all active agents', async () => {
      const config1: AgentConfiguration = { ...testAgentConfig, name: 'agent1' };
      const config2: AgentConfiguration = { ...testAgentConfig, name: 'agent2' };

      const context1 = await agentEngine.initializeAgent(config1);
      const context2 = await agentEngine.initializeAgent(config2);

      const activeAgents = agentEngine.getActiveAgents();

      assert.strictEqual(activeAgents.length, 2);
      assert.ok(activeAgents.some(agent => agent.agentName === 'agent1'));
      assert.ok(activeAgents.some(agent => agent.agentName === 'agent2'));
    });
  });

  suite('Agent Termination', () => {
    test('should terminate agent by name', async () => {
      await agentEngine.initializeAgent(testAgentConfig);
      
      agentEngine.terminateAgent(testAgentConfig.name);
      
      const retrieved = agentEngine.getAgentContext(testAgentConfig.name);
      assert.strictEqual(retrieved, undefined);
    });

    test('should terminate agent by conversation ID', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      
      agentEngine.terminateAgentByConversation(context.conversationId);
      
      const retrieved = agentEngine.getAgentContext(testAgentConfig.name);
      assert.strictEqual(retrieved, undefined);
    });

    test('should terminate child agents when parent is terminated', async () => {
      const parentContext = await agentEngine.initializeAgent(testAgentConfig);
      const childConfig: AgentConfiguration = { ...testAgentConfig, name: 'child-agent' };
      await agentEngine.initializeChildAgent(childConfig, parentContext);

      agentEngine.terminateAgent(testAgentConfig.name);

      const activeAgents = agentEngine.getActiveAgents();
      assert.strictEqual(activeAgents.length, 0);
    });
  });

  suite('Delegation Chain Management', () => {
    test('should get delegation chain for agent', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const chain = agentEngine.getDelegationChain(testAgentConfig.name);

      assert.deepStrictEqual(chain, [testAgentConfig.name]);
    });

    test('should detect circular delegation', async () => {
      const agent1Config: AgentConfiguration = { ...testAgentConfig, name: 'agent1' };
      const agent2Config: AgentConfiguration = { ...testAgentConfig, name: 'agent2' };

      const context1 = await agentEngine.initializeAgent(agent1Config);
      await agentEngine.initializeChildAgent(agent2Config, context1);

      const wouldBeCircular = agentEngine.wouldCreateCircularDelegation('agent2', 'agent1');
      assert.strictEqual(wouldBeCircular, true);

      const wouldNotBeCircular = agentEngine.wouldCreateCircularDelegation('agent2', 'agent3');
      assert.strictEqual(wouldNotBeCircular, false);
    });
  });

  suite('Tool Management', () => {
    test('should update agent tools', async () => {
      const context = await agentEngine.initializeAgent(testAgentConfig);
      const originalToolCount = context.availableTools.length;

      // Add a custom tool to the filter
      toolFilter.addCustomTool('testTool', { name: 'testTool' });
      
      await agentEngine.updateAgentTools(testAgentConfig.name);
      
      const updatedContext = agentEngine.getAgentContext(testAgentConfig.name);
      assert.ok(updatedContext);
      assert.ok(updatedContext.availableTools.length >= originalToolCount);
    });
  });
});