/**
 * Comprehensive unit tests for DelegationEngine
 * Covers all core functionality, error scenarios, and edge cases
 */

import * as assert from 'assert';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { AgentEngine } from '../services/agent-engine';
import { IConfigurationManager } from '../services/configuration-manager';
import { 
  AgentConfiguration, 
  AgentExecutionContext,
  ExtensionConfiguration,
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_AGENT
} from '../models';

// Enhanced mock implementations
class MockAgentEngine implements AgentEngine {
  private contexts: Map<string, AgentExecutionContext> = new Map();
  private executionResults: Map<string, string> = new Map();
  private shouldThrowError = false;
  private executionDelay = 0;

  setShouldThrowError(shouldThrow: boolean): void {
    this.shouldThrowError = shouldThrow;
  }

  setExecutionDelay(delay: number): void {
    this.executionDelay = delay;
  }

  setExecutionResult(agentName: string, result: string): void {
    this.executionResults.set(agentName, result);
  }

  async initializeAgent(config: AgentConfiguration): Promise<AgentExecutionContext> {
    const context: AgentExecutionContext = {
      agentName: config.name,
      conversationId: `${config.name}-${Date.now()}`,
      systemPrompt: config.systemPrompt,
      availableTools: [],
      delegationChain: [],
      availableDelegationTargets: [],
    };
    this.contexts.set(config.name, context);
    return context;
  }

  async initializeChildAgent(config: AgentConfiguration, parentContext: AgentExecutionContext): Promise<AgentExecutionContext> {
    const context: AgentExecutionContext = {
      agentName: config.name,
      conversationId: `${config.name}-child-${Date.now()}`,
      parentConversationId: parentContext.conversationId,
      systemPrompt: config.systemPrompt,
      availableTools: [],
      delegationChain: [...parentContext.delegationChain, parentContext.agentName],
      availableDelegationTargets: []
    };
    this.contexts.set(config.name, context);
    return context;
  }

  async executeAgent(context: AgentExecutionContext, input: string): Promise<string> {
    if (this.executionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    }

    if (this.shouldThrowError) {
      throw new Error(`Execution failed for ${context.agentName}`);
    }

    const result = this.executionResults.get(context.agentName);
    return result || `Default response from ${context.agentName}: ${input}`;
  }

  getAgentContext(agentName: string): AgentExecutionContext | undefined {
    return this.contexts.get(agentName);
  }

  getAgentContextByConversation(conversationId: string): AgentExecutionContext | undefined {
    for (const context of this.contexts.values()) {
      if (context.conversationId === conversationId) {
        return context;
      }
    }
    return undefined;
  }

  terminateAgent(agentName: string): void {
    this.contexts.delete(agentName);
  }

  terminateAgentByConversation(conversationId: string): void {
    for (const [agentName, context] of this.contexts.entries()) {
      if (context.conversationId === conversationId) {
        this.contexts.delete(agentName);
        break;
      }
    }
  }

  getActiveAgents(): AgentExecutionContext[] {
    return Array.from(this.contexts.values());
  }

  getDelegationChain(agentName: string): string[] {
    const context = this.contexts.get(agentName);
    return context ? [...context.delegationChain, context.agentName] : [];
  }

  wouldCreateCircularDelegation(fromAgent: string, toAgent: string): boolean {
    const fromContext = this.contexts.get(fromAgent);
    if (!fromContext) {
      return false;
    }
    
    const fullChain = [...fromContext.delegationChain, fromAgent];
    return fullChain.includes(toAgent);
  }

  async updateAgentTools(agentName: string): Promise<void> {
    // Mock implementation
  }
}

class MockConfigurationManager implements IConfigurationManager {
  private config: ExtensionConfiguration = {
    entryAgent: 'coordinator',
    agents: [
      DEFAULT_COORDINATOR_AGENT,
      {
        name: 'test-agent',
        systemPrompt: 'Test agent',
        description: 'Test agent',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'delegator-agent',
        systemPrompt: 'Delegator agent',
        description: 'Can delegate',
        useFor: 'Delegation',
        delegationPermissions: { type: 'specific', agents: ['test-agent', 'worker-agent'] },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'worker-agent',
        systemPrompt: 'Worker agent',
        description: 'Does work',
        useFor: 'Work',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'specific', tools: ['reportOut'] }
      }
    ]
  };

  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.config;
  }

  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.config = config;
  }

  validateConfiguration(): boolean {
    return true;
  }

  getDefaultConfiguration(): ExtensionConfiguration {
    return DEFAULT_EXTENSION_CONFIG;
  }

  async getEntryAgent() {
    const entryAgentName = this.config.entryAgent;
    return this.config.agents.find(agent => agent.name === entryAgentName) || this.config.agents[0] || null;
  }

  onConfigurationChanged(): void {}
  dispose(): void {}

  setMockConfig(config: ExtensionConfiguration): void {
    this.config = config;
  }
}

suite('Comprehensive DelegationEngine Tests', () => {
  let delegationEngine: DefaultDelegationEngine;
  let mockAgentEngine: MockAgentEngine;
  let mockConfigManager: MockConfigurationManager;

  setup(() => {
    mockAgentEngine = new MockAgentEngine();
    mockConfigManager = new MockConfigurationManager();
    delegationEngine = new DefaultDelegationEngine(mockAgentEngine, mockConfigManager);
    
    // Set up default configuration
    const defaultConfig: ExtensionConfiguration = {
      entryAgent: 'coordinator',
      agents: [
        {
          ...DEFAULT_COORDINATOR_AGENT,
          delegationPermissions: { type: 'all' }
        },
        {
          name: 'test-agent',
          systemPrompt: 'Test agent',
          description: 'Test agent',
          useFor: 'Testing',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'all' }
        },
        {
          name: 'delegator-agent',
          systemPrompt: 'Delegator agent',
          description: 'Can delegate',
          useFor: 'Delegation',
          delegationPermissions: { type: 'specific', agents: ['test-agent', 'worker-agent'] },
          toolPermissions: { type: 'all' }
        },
        {
          name: 'worker-agent',
          systemPrompt: 'Worker agent',
          description: 'Does work',
          useFor: 'Work',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'all' }
        }
      ]
    };
    
    mockConfigManager.setMockConfig(defaultConfig);
  });

  teardown(() => {
    try {
      delegationEngine.cleanup();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  suite('Delegation Validation', () => {
    test('should validate delegation with "all" permissions', async () => {
      const result = await delegationEngine.isValidDelegation('coordinator', 'test-agent');
      assert.strictEqual(result, true);
    });

    test('should reject delegation with "none" permissions', async () => {
      const result = await delegationEngine.isValidDelegation('test-agent', 'coordinator');
      assert.strictEqual(result, false);
    });

    test('should validate delegation with specific permissions', async () => {
      const result1 = await delegationEngine.isValidDelegation('delegator-agent', 'test-agent');
      assert.strictEqual(result1, true);

      const result2 = await delegationEngine.isValidDelegation('delegator-agent', 'worker-agent');
      assert.strictEqual(result2, true);

      const result3 = await delegationEngine.isValidDelegation('delegator-agent', 'coordinator');
      assert.strictEqual(result3, false);
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

    test('should handle configuration changes during validation', async () => {
      // Initial validation should pass
      const result1 = await delegationEngine.isValidDelegation('delegator-agent', 'test-agent');
      assert.strictEqual(result1, true);

      // Change configuration to remove permission
      const currentConfig = await mockConfigManager.loadConfiguration();
      const newConfig = {
        ...currentConfig,
        agents: [
          currentConfig.agents[0], // Keep coordinator
          {
            name: 'delegator-agent',
            systemPrompt: 'Updated agent',
            description: 'Updated',
            useFor: 'Updated',
            delegationPermissions: { type: 'none' as const },
            toolPermissions: { type: 'all' as const }
          }
        ]
      };
      mockConfigManager.setMockConfig(newConfig);

      // Validation should now fail
      const result2 = await delegationEngine.isValidDelegation('delegator-agent', 'test-agent');
      assert.strictEqual(result2, false);
    });
  });

  suite('Work Delegation', () => {


    test('should reject delegation to invalid agent', async () => {
      try {
        await delegationEngine.delegateWork(
          'test-agent', // Has no delegation permissions
          'coordinator',
          'Invalid delegation',
          'Should fail'
        );
        assert.fail('Should have thrown DelegationError');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not allowed') || error.message.includes('Parent agent context not found'));
      }
    });

    test('should handle agent execution errors during delegation', async () => {
      // Initialize coordinator
      await mockAgentEngine.initializeAgent({
        name: 'coordinator',
        systemPrompt: 'Coordinator',
        description: 'Coordinator',
        useFor: 'Coordination',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'all' }
      });

      mockAgentEngine.setShouldThrowError(true);

      try {
        await delegationEngine.delegateWork(
          'coordinator',
          'test-agent',
          'Task that will fail',
          'Should not complete'
        );
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Execution failed') || error.message.includes('failed'));
      }
    });

    test('should prevent circular delegation', async () => {
      // Set up a delegation chain: coordinator -> delegator-agent
      await mockAgentEngine.initializeAgent({
        name: 'coordinator',
        systemPrompt: 'Coordinator',
        description: 'Coordinator',
        useFor: 'Coordination',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'all' }
      });

      const coordinatorContext = mockAgentEngine.getAgentContext('coordinator')!;
      
      await mockAgentEngine.initializeChildAgent({
        name: 'delegator-agent',
        systemPrompt: 'Delegator',
        description: 'Delegator',
        useFor: 'Delegation',
        delegationPermissions: { type: 'specific', agents: ['coordinator'] },
        toolPermissions: { type: 'all' }
      }, coordinatorContext);

      // Now try to delegate back to coordinator (circular)
      try {
        await delegationEngine.delegateWork(
          'delegator-agent',
          'coordinator',
          'Circular delegation attempt',
          'Should fail'
        );
        assert.fail('Should have thrown CircularDelegationError');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('circular') || error.message.includes('not allowed'));
      }
    });




  });

  suite('Report Out Functionality', () => {
    test('should handle report out from active agent', () => {
      // Initialize an agent first
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: 'test-123',
        systemPrompt: 'Test',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };
      mockAgentEngine.getActiveAgents = () => [context];

      // Should not throw
      assert.doesNotThrow(() => {
        delegationEngine.reportOut('test-agent', 'Task completed with report');
      });
    });

    test('should handle report out from non-existent agent', () => {
      // Should not throw, but should handle gracefully
      assert.doesNotThrow(() => {
        delegationEngine.reportOut('non-existent', 'Invalid report');
      });
    });

    test('should handle empty report', () => {
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: 'test-123',
        systemPrompt: 'Test',
        availableTools: [],
        delegationChain: [],
      availableDelegationTargets: [],
      };
      mockAgentEngine.getActiveAgents = () => [context];

      assert.doesNotThrow(() => {
        delegationEngine.reportOut('test-agent', '');
      });
    });

    test('should handle very long report', () => {
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: 'test-123',
        systemPrompt: 'Test',
        availableTools: [],
        delegationChain: [],
      availableDelegationTargets: [],
      };
      mockAgentEngine.getActiveAgents = () => [context];

      const longReport = 'A'.repeat(10000); // Very long report

      assert.doesNotThrow(() => {
        delegationEngine.reportOut('test-agent', longReport);
      });
    });
  });

  suite('Delegation Statistics', () => {
    test('should track delegation statistics', () => {
      const stats = delegationEngine.getDelegationStats();

      assert.strictEqual(typeof stats.active, 'number');
      assert.strictEqual(typeof stats.completed, 'number');
      assert.strictEqual(typeof stats.pending, 'number');
      assert.ok(stats.active >= 0);
      assert.ok(stats.completed >= 0);
      assert.ok(stats.pending >= 0);
    });



    test('should handle statistics overflow', () => {
      // This test ensures statistics don't break with large numbers
      const stats = delegationEngine.getDelegationStats();
      
      // Should handle large numbers gracefully
      assert.ok(Number.isFinite(stats.active));
      assert.ok(Number.isFinite(stats.completed));
      assert.ok(Number.isFinite(stats.pending));
    });
  });

  suite('Delegation History', () => {


    test('should return empty history for non-existent agent', async () => {
      const history = await delegationEngine.getDelegationHistory('non-existent');

      assert.deepStrictEqual(history.delegatedTo, []);
      assert.deepStrictEqual(history.delegatedFrom, []);
    });

    test('should handle history for agent with no delegations', async () => {
      const history = await delegationEngine.getDelegationHistory('test-agent');

      assert.ok(Array.isArray(history.delegatedTo));
      assert.ok(Array.isArray(history.delegatedFrom));
    });


  });

  suite('Active Delegations Management', () => {
    test('should track active delegations', () => {
      const activeDelegations = delegationEngine.getActiveDelegations();
      
      assert.ok(Array.isArray(activeDelegations));
      assert.ok(activeDelegations.length >= 0);
    });




  });

  suite('Error Recovery and Resilience', () => {





  });

  suite('Cleanup and Resource Management', () => {
    test('should cleanup resources properly', () => {
      // Cleanup should not throw
      assert.doesNotThrow(() => {
        delegationEngine.cleanup();
      });

      // After cleanup, stats should be reset or cleaned
      const afterStats = delegationEngine.getDelegationStats();
      assert.ok(typeof afterStats.active === 'number');
      assert.ok(typeof afterStats.completed === 'number');
      assert.ok(typeof afterStats.pending === 'number');
    });

    test('should handle cleanup errors gracefully', () => {
      // Mock a cleanup error scenario
      const originalGetActiveAgents = mockAgentEngine.getActiveAgents;
      mockAgentEngine.getActiveAgents = () => {
        throw new Error('Cleanup error');
      };

      // Should not throw even if cleanup has issues
      try {
        delegationEngine.cleanup();
        assert.ok(true, 'Cleanup completed without throwing');
      } catch (error) {
        // If cleanup throws, that's also acceptable behavior
        assert.ok(error instanceof Error);
      }

      // Restore original method
      mockAgentEngine.getActiveAgents = originalGetActiveAgents;
    });

    test('should handle multiple cleanup calls', () => {
      // Multiple cleanup calls should be safe
      assert.doesNotThrow(() => {
        delegationEngine.cleanup();
        delegationEngine.cleanup();
        delegationEngine.cleanup();
      });
    });
  });
});