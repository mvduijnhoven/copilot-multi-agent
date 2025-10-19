/**
 * Integration tests for system prompt extension functionality
 * Tests the integration between SystemPromptBuilder and AgentEngine
 */

import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { DefaultAgentEngine } from '../services/agent-engine';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { DefaultToolFilter } from '../services/tool-filter';
import { 
  AgentConfiguration, 
  ExtensionConfiguration,
  AgentExecutionContext
} from '../models';
import { 
  setupTestEnvironment, 
  cleanupTestEnvironment,
  createTestAgent,
  createTestConfiguration,
  mockVscode
} from './test-setup';

// Mock ConfigurationManager for ToolFilter
class MockConfigurationManager {
  private config: ExtensionConfiguration;

  constructor(config: ExtensionConfiguration) {
    this.config = config;
  }

  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.config;
  }

  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.config = config;
  }

  validateConfiguration(): boolean { return true; }
  getDefaultConfiguration(): ExtensionConfiguration { return this.config; }
  async getEntryAgent() { return this.config.agents[0] || null; }
  onConfigurationChanged(): void {}
  dispose(): void {}
}

suite('System Prompt Integration Tests', () => {
  let agentEngine: DefaultAgentEngine;
  let systemPromptBuilder: SystemPromptBuilder;
  let toolFilter: DefaultToolFilter;
  let mockConfigManager: MockConfigurationManager;

  setup(() => {
    setupTestEnvironment();
    systemPromptBuilder = new SystemPromptBuilder();
    
    // Create a basic configuration for the mock
    const basicConfig = createTestConfiguration([
      createTestAgent('coordinator', 'Coordination and delegation', { type: 'all' })
    ]);
    
    mockConfigManager = new MockConfigurationManager(basicConfig);
    toolFilter = new DefaultToolFilter(mockConfigManager);
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
  });

  teardown(() => {
    // Clean up any active agents
    try {
      const activeAgents = agentEngine.getActiveAgents();
      activeAgents.forEach(agent => agentEngine.terminateAgent(agent.agentName));
    } catch (error) {
      // Ignore cleanup errors in tests
    }
    cleanupTestEnvironment();
  });

  suite('Agent Initialization with Extended System Prompts', () => {
    test('should initialize agent with extended system prompt when delegation targets available', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination and delegation', { type: 'all' }),
        createTestAgent('code-reviewer', 'Code review and security analysis'),
        createTestAgent('test-engineer', 'Unit testing and integration testing')
      ];
      const config = createTestConfiguration(agents);

      const context = await agentEngine.initializeAgent(agents[0], config);

      // System prompt should be extended with delegation information
      assert.ok(context.systemPrompt.includes('You are coordinator agent with comprehensive capabilities'));
      assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(context.systemPrompt.includes('- **code-reviewer**: Code review and security analysis'));
      assert.ok(context.systemPrompt.includes('- **test-engineer**: Unit testing and integration testing'));
      assert.ok(context.systemPrompt.includes('When using the delegateWork tool, use one of these agent names: code-reviewer, test-engineer'));
      
      // Available delegation targets should be populated
      assert.strictEqual(context.availableDelegationTargets.length, 2);
      assert.ok(context.availableDelegationTargets.some(t => t.name === 'code-reviewer'));
      assert.ok(context.availableDelegationTargets.some(t => t.name === 'test-engineer'));
    });

    test('should initialize agent with base system prompt when no delegation permissions', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('restricted-agent', 'Restricted tasks', { type: 'none' })
      ];
      const config = createTestConfiguration(agents);
      
      // Add agents to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      const context = await agentEngine.initializeAgent(agents[1], config);

      // System prompt should not be extended
      assert.strictEqual(context.systemPrompt, 'You are restricted-agent agent with comprehensive capabilities for Restricted tasks');
      assert.ok(!context.systemPrompt.includes('## Available Agents for Delegation'));
      
      // Available delegation targets should be empty
      assert.strictEqual(context.availableDelegationTargets.length, 0);
    });

    test('should initialize agent with specific delegation targets', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('specialist', 'Specialized tasks', { type: 'specific', agents: ['test-engineer'] }),
        createTestAgent('test-engineer', 'Unit testing and integration testing'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);
      
      // Add agents to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      const context = await agentEngine.initializeAgent(agents[1], config);

      // System prompt should include only specific delegation targets
      assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(context.systemPrompt.includes('- **test-engineer**: Unit testing and integration testing'));
      assert.ok(!context.systemPrompt.includes('other-agent'));
      assert.ok(context.systemPrompt.includes('When using the delegateWork tool, use one of these agent names: test-engineer'));
      
      // Available delegation targets should contain only allowed agents
      assert.strictEqual(context.availableDelegationTargets.length, 1);
      assert.strictEqual(context.availableDelegationTargets[0].name, 'test-engineer');
    });

    test('should handle agent initialization without extension configuration', async () => {
      const agentConfig = createTestAgent('standalone-agent', 'Standalone tasks', { type: 'all' });
      
      // Add agent to configuration for tool filter
      const config = createTestConfiguration([agentConfig]);
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      const context = await agentEngine.initializeAgent(agentConfig);

      // System prompt should not be extended without extension configuration
      assert.strictEqual(context.systemPrompt, 'You are standalone-agent agent with comprehensive capabilities for Standalone tasks');
      assert.ok(!context.systemPrompt.includes('## Available Agents for Delegation'));
      
      // Available delegation targets should be empty
      assert.strictEqual(context.availableDelegationTargets.length, 0);
    });
  });

  suite('Child Agent Initialization with Extended System Prompts', () => {
    test('should initialize child agent with extended system prompt', async () => {
      const agents = [
        createTestAgent('parent-agent', 'Parent tasks', { type: 'all' }),
        createTestAgent('child-agent', 'Child tasks', { type: 'specific', agents: ['other-agent'] }),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);
      
      // Add agents to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      // Initialize parent first
      const parentContext = await agentEngine.initializeAgent(agents[0], config);
      
      // Initialize child agent
      const childContext = await (agentEngine as any).initializeChildAgent(
        agents[1], 
        parentContext, 
        config
      );

      // Child system prompt should be extended with its delegation targets
      assert.ok(childContext.systemPrompt.includes('You are child-agent agent with comprehensive capabilities'));
      assert.ok(childContext.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(childContext.systemPrompt.includes('- **other-agent**: Other tasks'));
      assert.ok(childContext.systemPrompt.includes('When using the delegateWork tool, use one of these agent names: other-agent'));
      
      // Available delegation targets should be populated
      assert.strictEqual(childContext.availableDelegationTargets.length, 1);
      assert.strictEqual(childContext.availableDelegationTargets[0].name, 'other-agent');
    });

    test('should initialize child agent without delegation extension when no permissions', async () => {
      const agents = [
        createTestAgent('parent-agent', 'Parent tasks', { type: 'all' }),
        createTestAgent('child-agent', 'Child tasks', { type: 'none' })
      ];
      const config = createTestConfiguration(agents);
      
      // Add agents to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      const parentContext = await agentEngine.initializeAgent(agents[0], config);
      const childContext = await (agentEngine as any).initializeChildAgent(
        agents[1], 
        parentContext, 
        config
      );

      // Child system prompt should not be extended
      assert.strictEqual(childContext.systemPrompt, 'You are child-agent agent with comprehensive capabilities for Child tasks');
      assert.ok(!childContext.systemPrompt.includes('## Available Agents for Delegation'));
      
      // Available delegation targets should be empty
      assert.strictEqual(childContext.availableDelegationTargets.length, 0);
    });
  });

  suite('System Prompt Application in Agent Execution', () => {
    test('should apply extended system prompt during agent execution', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination and delegation', { type: 'all' }),
        createTestAgent('test-agent', 'Testing tasks')
      ];
      const config = createTestConfiguration(agents);

      const context = await agentEngine.initializeAgent(agents[0], config);
      
      // Execute agent to trigger system prompt application
      const result = await agentEngine.executeAgent(context, 'Test input');

      // Result should include the extended system prompt information
      assert.ok(result.includes('coordinator'));
      assert.ok(result.includes('Test input'));
      
      // The applied system prompt should include delegation information
      const enhancedInput = (agentEngine as any).applySystemPrompt(context, 'Test input');
      assert.ok(enhancedInput.includes('System: You are coordinator agent with comprehensive capabilities'));
      assert.ok(enhancedInput.includes('## Available Agents for Delegation'));
    });

    test('should include delegation targets in execution context', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('specialist', 'Specialized tasks')
      ];
      const config = createTestConfiguration(agents);

      const context = await agentEngine.initializeAgent(agents[0], config);

      // Delegation targets should be available in context
      assert.strictEqual(context.availableDelegationTargets.length, 1);
      assert.strictEqual(context.availableDelegationTargets[0].name, 'specialist');
      assert.strictEqual(context.availableDelegationTargets[0].useFor, 'Specialized tasks');
    });
  });

  suite('Dynamic Configuration Changes', () => {
    test('should handle configuration changes affecting delegation targets', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('agent1', 'Agent 1 tasks')
      ];
      let config = createTestConfiguration(agents);

      // Initialize agent with initial configuration
      let context = await agentEngine.initializeAgent(agents[0], config);
      assert.strictEqual(context.availableDelegationTargets.length, 1);

      // Add more agents to configuration
      agents.push(createTestAgent('agent2', 'Agent 2 tasks'));
      agents.push(createTestAgent('agent3', 'Agent 3 tasks'));
      config = createTestConfiguration(agents);

      // Re-initialize agent with updated configuration
      agentEngine.terminateAgent('coordinator');
      context = await agentEngine.initializeAgent(agents[0], config);
      
      // Should now have more delegation targets
      assert.strictEqual(context.availableDelegationTargets.length, 3);
      assert.ok(context.availableDelegationTargets.some(t => t.name === 'agent1'));
      assert.ok(context.availableDelegationTargets.some(t => t.name === 'agent2'));
      assert.ok(context.availableDelegationTargets.some(t => t.name === 'agent3'));
    });

    test('should handle delegation permission changes', async () => {
      const agents = [
        createTestAgent('dynamic-agent', 'Dynamic tasks', { type: 'none' }),
        createTestAgent('target-agent', 'Target tasks')
      ];
      let config = createTestConfiguration(agents);
      
      // Add agents to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      // Initialize with no delegation permissions
      let context = await agentEngine.initializeAgent(agents[0], config);
      assert.strictEqual(context.availableDelegationTargets.length, 0);
      assert.ok(!context.systemPrompt.includes('## Available Agents for Delegation'));

      // Change to all delegation permissions
      agents[0].delegationPermissions = { type: 'all' };
      config = createTestConfiguration(agents);
      
      // Update mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      agentEngine.terminateAgent('dynamic-agent');
      context = await agentEngine.initializeAgent(agents[0], config);
      
      // Should now have delegation targets
      assert.strictEqual(context.availableDelegationTargets.length, 1);
      assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(context.systemPrompt.includes('target-agent'));
    });
  });

  suite('Error Handling in System Prompt Extension', () => {
    test('should handle SystemPromptBuilder errors gracefully', async () => {
      // Create a mock that throws an error
      const errorSystemPromptBuilder = {
        buildSystemPrompt: sinon.stub().throws(new Error('System prompt error')),
        getDelegationTargets: sinon.stub().returns([])
      } as any;

      const errorAgentEngine = new DefaultAgentEngine(toolFilter, errorSystemPromptBuilder);
      const agentConfig = createTestAgent('error-agent');
      const config = createTestConfiguration([agentConfig]);

      await assert.rejects(
        () => errorAgentEngine.initializeAgent(agentConfig, config),
        Error
      );
    });

    test('should handle malformed delegation targets gracefully', async () => {
      // Create a mock that returns malformed targets
      const malformedSystemPromptBuilder = {
        buildSystemPrompt: sinon.stub().returns('Extended prompt'),
        getDelegationTargets: sinon.stub().returns([
          { name: 'valid-target', useFor: 'Valid tasks' },
          null, // Invalid target
          { name: '', useFor: 'Empty name' }, // Invalid target
          { name: 'another-valid', useFor: 'More tasks' }
        ])
      } as any;

      const agentConfig = createTestAgent('test-agent');
      const config = createTestConfiguration([agentConfig]);
      
      // Add agent to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      const malformedToolFilter = new DefaultToolFilter(mockConfigManager);
      const malformedAgentEngine = new DefaultAgentEngine(malformedToolFilter, malformedSystemPromptBuilder);

      const context = await malformedAgentEngine.initializeAgent(agentConfig, config);
      
      // Should handle malformed targets gracefully
      assert.ok(context);
      assert.ok(Array.isArray(context.availableDelegationTargets));
    });

    test('should handle empty delegation targets gracefully', async () => {
      const emptySystemPromptBuilder = {
        buildSystemPrompt: sinon.stub().returns('Base prompt'),
        getDelegationTargets: sinon.stub().returns([])
      } as any;

      const agentConfig = createTestAgent('empty-agent');
      const config = createTestConfiguration([agentConfig]);
      
      // Add agent to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      const emptyToolFilter = new DefaultToolFilter(mockConfigManager);
      const emptyAgentEngine = new DefaultAgentEngine(emptyToolFilter, emptySystemPromptBuilder);

      const context = await emptyAgentEngine.initializeAgent(agentConfig, config);
      
      assert.strictEqual(context.systemPrompt, 'Base prompt');
      assert.strictEqual(context.availableDelegationTargets.length, 0);
    });
  });

  suite('Performance and Memory', () => {
    test('should handle large numbers of delegation targets efficiently', async () => {
      const manyAgents = Array.from({ length: 20 }, (_, i) => 
        createTestAgent(`agent-${i}`, `Agent ${i} tasks`)
      );
      manyAgents[0].delegationPermissions = { type: 'all' };
      
      const config = createTestConfiguration(manyAgents);
      
      // Add agents to mock configuration manager
      mockConfigManager = new MockConfigurationManager(config);
      toolFilter = new DefaultToolFilter(mockConfigManager);
      agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);

      const startTime = Date.now();
      const context = await agentEngine.initializeAgent(manyAgents[0], config);
      const endTime = Date.now();

      // Should complete in reasonable time (less than 1 second)
      assert.ok(endTime - startTime < 1000);
      
      // Should have all delegation targets
      assert.strictEqual(context.availableDelegationTargets.length, 19);
      
      // System prompt should include all targets
      assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
    });

    test('should not leak memory with repeated initializations', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);

      // Initialize and terminate many agents
      for (let i = 0; i < 100; i++) {
        const context = await agentEngine.initializeAgent(agents[0], config);
        assert.ok(context);
        agentEngine.terminateAgent('coordinator');
      }

      // Should not have any active agents
      const activeAgents = agentEngine.getActiveAgents();
      assert.strictEqual(activeAgents.length, 0);
    });
  });

  suite('Consistency and Determinism', () => {
    test('should produce consistent system prompts across multiple initializations', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);

      // Initialize multiple times
      const contexts = [];
      for (let i = 0; i < 5; i++) {
        const context = await agentEngine.initializeAgent(agents[0], config);
        contexts.push(context);
        agentEngine.terminateAgent('coordinator');
      }

      // All system prompts should be identical
      const firstPrompt = contexts[0].systemPrompt;
      contexts.forEach(context => {
        assert.strictEqual(context.systemPrompt, firstPrompt);
      });

      // All delegation targets should be identical
      const firstTargets = contexts[0].availableDelegationTargets;
      contexts.forEach(context => {
        assert.deepStrictEqual(context.availableDelegationTargets, firstTargets);
      });
    });

    test('should maintain delegation target order consistently', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('zebra-agent', 'Zebra tasks'),
        createTestAgent('alpha-agent', 'Alpha tasks'),
        createTestAgent('beta-agent', 'Beta tasks')
      ];
      const config = createTestConfiguration(agents);

      // Initialize multiple times
      const targetOrders = [];
      for (let i = 0; i < 5; i++) {
        const context = await agentEngine.initializeAgent(agents[0], config);
        targetOrders.push(context.availableDelegationTargets.map(t => t.name));
        agentEngine.terminateAgent('coordinator');
      }

      // All orders should be identical
      const firstOrder = targetOrders[0];
      targetOrders.forEach(order => {
        assert.deepStrictEqual(order, firstOrder);
      });
    });
  });
});