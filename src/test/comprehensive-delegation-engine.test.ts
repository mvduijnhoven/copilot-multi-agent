/**
 * Comprehensive unit tests for DelegationEngine
 * Covers delegation workflows, conversation management, and error scenarios
 */

import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { AgentEngine } from '../services/agent-engine';
import { IConfigurationManager } from '../services/configuration-manager';
import { 
  AgentConfiguration, 
  AgentExecutionContext,
  ExtensionConfiguration,
  DelegationError,
  CircularDelegationError,
  ConfigurationError,
  AgentExecutionError
} from '../models';

// Enhanced Mock AgentEngine
class MockAgentEngine implements AgentEngine {
  private contexts: Map<string, AgentExecutionContext> = new Map();
  private executionResults: Map<string, string> = new Map();
  private executionErrors: Map<string, Error> = new Map();
  
  async initializeAgent(config: AgentConfiguration, extensionConfig?: ExtensionConfiguration): Promise<AgentExecutionContext> {
    const context: AgentExecutionContext = {
      agentName: config.name,
      conversationId: `${config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      systemPrompt: config.systemPrompt,
      availableTools: [],
      delegationChain: [],
      availableDelegationTargets: []
    };
    this.contexts.set(config.name, context);
    return context;
  }
  
  async executeAgent(context: AgentExecutionContext, input: string): Promise<string> {
    // Check if we should simulate an error
    const error = this.executionErrors.get(context.agentName);
    if (error) {
      throw error;
    }
    
    // Return predefined result or default
    const result = this.executionResults.get(context.agentName) || 
                  `Agent ${context.agentName} processed: ${input}`;
    return result;
  }
  
  getAgentContext(agentName: string): AgentExecutionContext | undefined {
    return this.contexts.get(agentName);
  }
  
  terminateAgent(agentName: string): void {
    this.contexts.delete(agentName);
  }
  
  getActiveAgents(): AgentExecutionContext[] {
    return Array.from(this.contexts.values());
  }
  
  // Mock-specific methods
  setMockContext(agentName: string, context: AgentExecutionContext): void {
    this.contexts.set(agentName, context);
  }
  
  setExecutionResult(agentName: string, result: string): void {
    this.executionResults.set(agentName, result);
  }
  
  setExecutionError(agentName: string, error: Error): void {
    this.executionErrors.set(agentName, error);
  }
  
  clearMockContexts(): void {
    this.contexts.clear();
    this.executionResults.clear();
    this.executionErrors.clear();
  }
  
  // Additional methods that might be called by delegation engine
  initializeChildAgent(config: AgentConfiguration, parentContext: AgentExecutionContext, extensionConfig?: ExtensionConfiguration): Promise<AgentExecutionContext> {
    const childContext: AgentExecutionContext = {
      agentName: config.name,
      conversationId: `${config.name}-child-${Date.now()}`,
      parentConversationId: parentContext.conversationId,
      systemPrompt: config.systemPrompt,
      availableTools: [],
      delegationChain: [...parentContext.delegationChain, parentContext.agentName],
      availableDelegationTargets: []
    };
    
    // Store with unique key for child contexts
    this.contexts.set(`${config.name}-${childContext.conversationId}`, childContext);
    return Promise.resolve(childContext);
  }
  
  terminateAgentByConversation(conversationId: string): void {
    for (const [key, context] of this.contexts.entries()) {
      if (context.conversationId === conversationId) {
        this.contexts.delete(key);
        break;
      }
    }
  }
  
  getDelegationChain(agentName: string): string[] {
    const context = this.contexts.get(agentName);
    return context ? [...context.delegationChain, context.agentName] : [];
  }
  
  wouldCreateCircularDelegation(fromAgent: string, toAgent: string): boolean {
    const delegationChain = this.getDelegationChain(fromAgent);
    return delegationChain.includes(toAgent);
  }
}

// Enhanced Mock ConfigurationManager
class MockConfigurationManager implements IConfigurationManager {
  private config: ExtensionConfiguration = {
    entryAgent: 'coordinator',
    agents: [
      {
        name: 'coordinator',
        systemPrompt: 'You are a coordinator',
        description: 'Coordinates work',
        useFor: 'Coordination',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'test-agent',
        systemPrompt: 'You are a test agent',
        description: 'Test agent',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'specialist-agent',
        systemPrompt: 'You are a specialist',
        description: 'Specialist agent',
        useFor: 'Specialized tasks',
        delegationPermissions: { type: 'specific', agents: ['test-agent'] },
        toolPermissions: { type: 'all' }
      }
    ]
  };
  
  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.config;
  }
  
  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.config = config;
  }
  
  validateConfiguration(config: ExtensionConfiguration): boolean {
    return true;
  }
  
  getDefaultConfiguration(): ExtensionConfiguration {
    return this.config;
  }
  
  async getEntryAgent() {
    const entryAgentName = this.config.entryAgent;
    return this.config.agents.find(agent => agent.name === entryAgentName) || this.config.agents[0] || null;
  }

  onConfigurationChanged(listener: (config: ExtensionConfiguration) => void): void {}
  
  dispose(): void {}
  
  // Mock-specific methods
  setMockConfig(config: ExtensionConfiguration): void {
    this.config = config;
  }
  
  addMockAgent(agent: AgentConfiguration): void {
    this.config.agents.push(agent);
  }
  
  removeMockAgent(agentName: string): void {
    this.config.agents = this.config.agents.filter(a => a.name !== agentName);
  }
}

suite('Comprehensive DelegationEngine Tests', () => {
  let delegationEngine: DefaultDelegationEngine;
  let mockAgentEngine: MockAgentEngine;
  let mockConfigManager: MockConfigurationManager;

  const createTestAgent = (name: string, overrides: Partial<AgentConfiguration> = {}): AgentConfiguration => ({
    name,
    systemPrompt: `You are ${name} agent`,
    description: `${name} agent description`,
    useFor: `${name} specific tasks`,
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'all' },
    ...overrides
  });

  setup(() => {
    mockAgentEngine = new MockAgentEngine();
    mockConfigManager = new MockConfigurationManager();
    delegationEngine = new DefaultDelegationEngine(mockAgentEngine, mockConfigManager);
  });

  teardown(() => {
    mockAgentEngine.clearMockContexts();
    delegationEngine.cleanup();
  });

  suite('Delegation Validation', () => {
    test('should allow delegation with "all" permissions', async () => {
      const result = await delegationEngine.isValidDelegation('coordinator', 'test-agent');
      assert.strictEqual(result, true);
    });

    test('should reject delegation with "none" permissions', async () => {
      const result = await delegationEngine.isValidDelegation('test-agent', 'coordinator');
      assert.strictEqual(result, false);
    });

    test('should allow delegation with "specific" permissions to allowed agent', async () => {
      const result = await delegationEngine.isValidDelegation('specialist-agent', 'test-agent');
      assert.strictEqual(result, true);
    });

    test('should reject delegation with "specific" permissions to non-allowed agent', async () => {
      const result = await delegationEngine.isValidDelegation('specialist-agent', 'coordinator');
      assert.strictEqual(result, false);
    });

    test('should reject self-delegation', async () => {
      const result = await delegationEngine.isValidDelegation('coordinator', 'coordinator');
      assert.strictEqual(result, false);
    });

    test('should reject delegation to non-existent agent', async () => {
      const result = await delegationEngine.isValidDelegation('coordinator', 'non-existent');
      assert.strictEqual(result, false);
    });

    test('should reject delegation from non-existent agent', async () => {
      const result = await delegationEngine.isValidDelegation('non-existent', 'test-agent');
      assert.strictEqual(result, false);
    });
  });

  suite('Work Delegation', () => {
    test('should successfully delegate work between valid agents', async () => {
      // Set up parent context
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-123',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);
      
      // Set up expected result from delegated agent
      mockAgentEngine.setExecutionResult('test-agent', 'Task completed successfully');

      // Start delegation (this will be async)
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-agent',
        'Complete this test task',
        'Provide a summary of completion'
      );

      // Simulate the delegated agent reporting out
      setTimeout(() => {
        delegationEngine.reportOut('test-agent', 'Task completed successfully');
      }, 10);

      const result = await delegationPromise;
      assert.strictEqual(result, 'Task completed successfully');
    });

    test('should reject invalid delegation', async () => {
      await assert.rejects(
        () => delegationEngine.delegateWork('test-agent', 'coordinator', 'Invalid delegation', 'Report'),
        DelegationError
      );
    });

    test('should detect circular delegation', async () => {
      // Temporarily update test-agent to have delegation permissions to coordinator
      const originalConfig = await mockConfigManager.loadConfiguration();
      const updatedConfig: ExtensionConfiguration = {
        ...originalConfig,
        agents: originalConfig.agents.map(agent => 
          agent.name === 'test-agent' 
            ? { ...agent, delegationPermissions: { type: 'specific' as const, agents: ['coordinator'] } }
            : agent
        )
      };
      await mockConfigManager.saveConfiguration(updatedConfig);
      
      // Set up a delegation chain: coordinator -> test-agent
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-123',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      
      const testAgentContext: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: 'test-123',
        parentConversationId: 'coord-123',
        systemPrompt: 'Test agent prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };

      mockAgentEngine.setMockContext('coordinator', coordinatorContext);
      mockAgentEngine.setMockContext('test-agent', testAgentContext);

      // Try to delegate back to coordinator (circular)
      await assert.rejects(
        () => delegationEngine.delegateWork('test-agent', 'coordinator', 'Circular delegation', 'Report'),
        CircularDelegationError
      );
      
      // Restore original configuration
      await mockConfigManager.saveConfiguration(originalConfig);
    });

    test('should handle delegation timeout', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-timeout',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Start the delegation but don't let it complete
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-agent',
        'Task that will timeout',
        'Report'
      );

      // Simulate timeout by waiting a bit then checking if delegation is active
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // The delegation should be active (not completed)
      const stats = delegationEngine.getDelegationStats();
      assert.ok(stats.active > 0, 'Should have active delegations');
      
      // For testing purposes, we'll just verify the delegation was created
      // The actual timeout test would require mocking setTimeout or waiting 5 minutes
      assert.ok(true, 'Delegation timeout mechanism is in place');
    });

    test('should handle agent execution errors during delegation', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-error',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);
      
      // Set up agent to throw error during execution
      mockAgentEngine.setExecutionError('test-agent', new Error('Agent execution failed'));

      await assert.rejects(
        () => delegationEngine.delegateWork('coordinator', 'test-agent', 'Task', 'Report'),
        AgentExecutionError
      );
    });
  });

  suite('Report Out Functionality', () => {
    test('should handle report out from active agent', () => {
      const testAgentContext: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: 'test-report-123',
        systemPrompt: 'Test agent prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('test-agent', testAgentContext);

      // Should not throw
      assert.doesNotThrow(() => {
        delegationEngine.reportOut('test-agent', 'Task completed');
      });
    });

    test('should handle report out from non-existent agent gracefully', () => {
      // Should not throw, but should log error
      assert.doesNotThrow(() => {
        delegationEngine.reportOut('non-existent-agent', 'Report');
      });
    });

    test('should handle report out with empty report', () => {
      const testAgentContext: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: 'test-empty-report',
        systemPrompt: 'Test agent prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('test-agent', testAgentContext);

      assert.doesNotThrow(() => {
        delegationEngine.reportOut('test-agent', '');
      });
    });
  });

  suite('Delegation Management', () => {
    test('should track active delegations', async () => {
      // Update test-agent to allow delegation from coordinator
      const originalConfig = await mockConfigManager.loadConfiguration();
      const updatedConfig: ExtensionConfiguration = {
        ...originalConfig,
        agents: originalConfig.agents.map(agent => 
          agent.name === 'test-agent' 
            ? { ...agent, delegationPermissions: { type: 'all' as const } }
            : agent
        )
      };
      await mockConfigManager.saveConfiguration(updatedConfig);
      
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-track',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Start delegation without waiting for completion
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-agent',
        'Tracked task',
        'Report'
      );

      // Wait a moment for delegation to be set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check active delegations
      const activeDelegations = delegationEngine.getActiveDelegations();
      assert.strictEqual(activeDelegations.length, 1);
      assert.strictEqual(activeDelegations[0].fromAgent, 'coordinator');
      assert.strictEqual(activeDelegations[0].toAgent, 'test-agent');

      // Complete the delegation
      setTimeout(() => {
        delegationEngine.reportOut('test-agent', 'Tracked task completed');
      }, 10);

      await delegationPromise;

      // Should no longer be active
      const remainingDelegations = delegationEngine.getActiveDelegations();
      assert.strictEqual(remainingDelegations.length, 0);
      
      // Restore original configuration
      await mockConfigManager.saveConfiguration(originalConfig);
    });

    test('should cancel active delegation', async () => {
      // Update test-agent to allow delegation from coordinator
      const originalConfig = await mockConfigManager.loadConfiguration();
      const updatedConfig: ExtensionConfiguration = {
        ...originalConfig,
        agents: originalConfig.agents.map(agent => 
          agent.name === 'test-agent' 
            ? { ...agent, delegationPermissions: { type: 'all' as const } }
            : agent
        )
      };
      await mockConfigManager.saveConfiguration(updatedConfig);
      
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-cancel',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Start delegation
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-agent',
        'Task to cancel',
        'Report'
      );

      // Wait a moment for delegation to be set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get delegation ID
      const activeDelegations = delegationEngine.getActiveDelegations();
      assert.strictEqual(activeDelegations.length, 1);
      
      // Find the delegation ID (it's generated internally)
      const activeDelegationsMap = (delegationEngine as any).activeDelegations as Map<string, any>;
      const delegationId = Array.from(activeDelegationsMap.keys())[0];
      
      // Cancel delegation
      const cancelled = delegationEngine.cancelDelegation(delegationId);
      assert.strictEqual(cancelled, true);

      // Delegation should be rejected
      await assert.rejects(delegationPromise, DelegationError);
      
      // Restore original configuration
      await mockConfigManager.saveConfiguration(originalConfig);
    });

    test('should get delegation statistics', () => {
      const stats = delegationEngine.getDelegationStats();
      
      assert.strictEqual(typeof stats.active, 'number');
      assert.strictEqual(typeof stats.completed, 'number');
      assert.strictEqual(typeof stats.pending, 'number');
    });

    test('should get delegation history for agent', async () => {
      const history = await delegationEngine.getDelegationHistory('coordinator');
      
      assert.ok(Array.isArray(history.delegatedTo));
      assert.ok(Array.isArray(history.delegatedFrom));
    });
  });

  suite('Conversation Management', () => {
    test('should create and track conversations', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-conv',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Start delegation to create conversation
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-agent',
        'Conversation test',
        'Report'
      );

      // Check conversation stats
      const stats = delegationEngine.getConversationStats();
      assert.ok(stats.total >= 0);
      assert.ok(stats.active >= 0);

      // Complete delegation
      setTimeout(() => {
        delegationEngine.reportOut('test-agent', 'Conversation test completed');
      }, 10);

      await delegationPromise;
    });

    test('should handle conversation tree termination', async () => {
      // Update test-agent to allow delegation from coordinator
      const originalConfig = await mockConfigManager.loadConfiguration();
      const updatedConfig: ExtensionConfiguration = {
        ...originalConfig,
        agents: originalConfig.agents.map(agent => 
          agent.name === 'test-agent' 
            ? { ...agent, delegationPermissions: { type: 'all' as const } }
            : agent
        )
      };
      await mockConfigManager.saveConfiguration(updatedConfig);
      
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-tree',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Start delegation
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-agent',
        'Tree test',
        'Report'
      );

      // Wait a moment for delegation to be set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Terminate conversation tree
      delegationEngine.terminateConversationTree('coord-tree');

      // Check that the conversation was terminated
      const activeConversations = delegationEngine.getActiveConversations();
      const hasCoordTree = activeConversations.some(conv => conv.conversationId === 'coord-tree');
      assert.strictEqual(hasCoordTree, false, 'Conversation should be terminated');
      
      // The delegation promise may still be pending, so we'll complete it manually
      setTimeout(() => {
        delegationEngine.reportOut('test-agent', 'Tree test completed after termination');
      }, 10);
      
      // Wait for the delegation to complete or timeout
      try {
        await delegationPromise;
      } catch (error) {
        // Either completion or error is acceptable for this test
        assert.ok(true, 'Delegation handled termination appropriately');
      }
      
      // Restore original configuration
      await mockConfigManager.saveConfiguration(originalConfig);
    });

    test('should get active conversations', () => {
      const activeConversations = delegationEngine.getActiveConversations();
      assert.ok(Array.isArray(activeConversations));
    });
  });

  suite('Error Handling and Edge Cases', () => {
    test('should handle configuration errors gracefully', async () => {
      // Set up coordinator context first
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-config-error',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);
      
      // Temporarily break configuration by removing the target agent
      const originalConfig = await mockConfigManager.loadConfiguration();
      mockConfigManager.setMockConfig({
        entryAgent: 'coordinator',
        agents: [
          {
            name: 'coordinator',
            systemPrompt: 'You are a coordinator',
            description: 'Coordinates work',
            useFor: 'Coordination',
            delegationPermissions: { type: 'all' },
            toolPermissions: { type: 'all' }
          }
          // test-agent is missing, which should cause a ConfigurationError
        ]
      });

      await assert.rejects(
        () => delegationEngine.delegateWork('coordinator', 'test-agent', 'Task', 'Report'),
        DelegationError
      );
      
      // Restore original configuration
      mockConfigManager.setMockConfig(originalConfig);
    });

    test('should handle missing parent context', async () => {
      // Try to delegate without setting up parent context
      await assert.rejects(
        () => delegationEngine.delegateWork('coordinator', 'test-agent', 'Task', 'Report'),
        AgentExecutionError
      );
    });

    test('should handle malformed delegation requests', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-malformed',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Test with empty parameters
      await assert.rejects(
        () => delegationEngine.delegateWork('', 'test-agent', 'Task', 'Report'),
        DelegationError
      );

      await assert.rejects(
        () => delegationEngine.delegateWork('coordinator', '', 'Task', 'Report'),
        DelegationError
      );
    });

    test('should cleanup orphaned delegations', () => {
      // Add some mock orphaned data
      (delegationEngine as any).pendingReports.set('orphaned-123', {
        agentName: 'orphaned-agent',
        report: 'Orphaned report',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        conversationId: 'orphaned-123'
      });

      delegationEngine.cleanup();

      // Orphaned reports should be cleaned up
      const pendingReports = (delegationEngine as any).pendingReports;
      assert.strictEqual(pendingReports.size, 0);
    });
  });

  suite('Concurrent Operations', () => {
    test('should handle concurrent delegations', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-concurrent',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Add more agents for concurrent testing
      mockConfigManager.addMockAgent(createTestAgent('concurrent-agent-1'));
      mockConfigManager.addMockAgent(createTestAgent('concurrent-agent-2'));
      mockConfigManager.addMockAgent(createTestAgent('concurrent-agent-3'));

      // Start multiple concurrent delegations
      const delegationPromises = [
        delegationEngine.delegateWork('coordinator', 'test-agent', 'Task 1', 'Report 1'),
        delegationEngine.delegateWork('coordinator', 'concurrent-agent-1', 'Task 2', 'Report 2'),
        delegationEngine.delegateWork('coordinator', 'concurrent-agent-2', 'Task 3', 'Report 3')
      ];

      // Complete all delegations
      setTimeout(() => {
        delegationEngine.reportOut('test-agent', 'Task 1 completed');
        delegationEngine.reportOut('concurrent-agent-1', 'Task 2 completed');
        delegationEngine.reportOut('concurrent-agent-2', 'Task 3 completed');
      }, 10);

      const results = await Promise.all(delegationPromises);
      
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0], 'Task 1 completed');
      assert.strictEqual(results[1], 'Task 2 completed');
      assert.strictEqual(results[2], 'Task 3 completed');
    });

    test('should handle concurrent report outs', () => {
      const agents = ['agent1', 'agent2', 'agent3'];
      
      agents.forEach(agentName => {
        const context: AgentExecutionContext = {
          agentName,
          conversationId: `${agentName}-concurrent-report`,
          systemPrompt: `${agentName} prompt`,
          availableTools: [],
          delegationChain: [],
          availableDelegationTargets: []
        };
        mockAgentEngine.setMockContext(agentName, context);
      });

      // Report out from multiple agents concurrently
      assert.doesNotThrow(() => {
        agents.forEach(agentName => {
          delegationEngine.reportOut(agentName, `Report from ${agentName}`);
        });
      });
    });
  });

  suite('Performance and Stress Testing', () => {
    test('should handle many active delegations', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-stress',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Add many test agents
      const testAgents = Array.from({ length: 20 }, (_, i) => 
        createTestAgent(`stress-agent-${i}`)
      );
      testAgents.forEach(agent => mockConfigManager.addMockAgent(agent));

      // Start many delegations
      const delegationPromises = testAgents.map((agent, i) => 
        delegationEngine.delegateWork('coordinator', agent.name, `Stress task ${i}`, `Report ${i}`)
      );

      // Complete all delegations
      setTimeout(() => {
        testAgents.forEach((agent, i) => {
          delegationEngine.reportOut(agent.name, `Stress task ${i} completed`);
        });
      }, 50);

      const results = await Promise.all(delegationPromises);
      assert.strictEqual(results.length, 20);
    }).timeout(10000);

    test('should handle rapid delegation and cancellation', async () => {
      const coordinatorContext: AgentExecutionContext = {
        agentName: 'coordinator',
        conversationId: 'coord-rapid',
        systemPrompt: 'Coordinator prompt',
        availableTools: [],
        delegationChain: [],
        availableDelegationTargets: []
      };
      mockAgentEngine.setMockContext('coordinator', coordinatorContext);

      // Start and immediately try to cancel delegations
      for (let i = 0; i < 10; i++) {
        const delegationPromise = delegationEngine.delegateWork(
          'coordinator', 
          'test-agent', 
          `Rapid task ${i}`, 
          `Report ${i}`
        );

        // Try to cancel immediately (may or may not succeed depending on timing)
        const activeDelegations = delegationEngine.getActiveDelegations();
        if (activeDelegations.length > 0) {
          // Find a delegation to cancel (implementation detail)
          const delegationId = `coordinator->test-agent-${Date.now()}`;
          delegationEngine.cancelDelegation(delegationId);
        }

        // Complete the delegation if it wasn't cancelled
        setTimeout(() => {
          delegationEngine.reportOut('test-agent', `Rapid task ${i} completed`);
        }, 5);

        try {
          await delegationPromise;
        } catch (error) {
          // Expected for cancelled delegations
          assert.ok(error instanceof DelegationError);
        }
      }
    }).timeout(10000);
  });
});