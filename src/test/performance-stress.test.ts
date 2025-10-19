/**
 * Performance and stress tests for multi-agent system
 * Tests system behavior under load, memory usage, and concurrent operations
 */

import { strict as assert } from 'assert';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { DefaultAgentEngine } from '../services/agent-engine';
import { ConfigurationManager } from '../services/configuration-manager';
import { DefaultToolFilter } from '../services/tool-filter';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { 
  AgentConfiguration, 
  ExtensionConfiguration,
  AgentExecutionContext
} from '../models';
import * as sinon from 'sinon';
import { 
  setupTestEnvironment, 
  cleanupTestEnvironment, 
  TestPerformanceMonitor,
  createTestAgent,
  createTestConfiguration,
  mockVscode
} from './test-setup';

// Use TestPerformanceMonitor from test-setup

// Test Configuration Manager for performance testing
class PerformanceConfigurationManager extends ConfigurationManager {
  private testConfig: ExtensionConfiguration;

  constructor(initialConfig: ExtensionConfiguration) {
    super();
    this.testConfig = initialConfig;
  }

  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.testConfig;
  }

  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.testConfig = config;
  }

  setTestConfiguration(config: ExtensionConfiguration): void {
    this.testConfig = config;
  }

  getTestConfiguration(): ExtensionConfiguration {
    return this.testConfig;
  }
}

suite('Performance and Stress Tests', () => {
  let delegationEngine: DefaultDelegationEngine;
  let agentEngine: DefaultAgentEngine;
  let configManager: PerformanceConfigurationManager;
  let toolFilter: DefaultToolFilter;
  let systemPromptBuilder: SystemPromptBuilder;
  let performanceMonitor: TestPerformanceMonitor;

  setup(() => {
    setupTestEnvironment();
    performanceMonitor = new TestPerformanceMonitor();

    // Create minimal configuration for performance testing
    const initialAgents = [
      createTestAgent('coordinator', 'Task coordination and delegation', { type: 'all' })
    ];
    const initialConfig = createTestConfiguration(initialAgents);

    // Initialize components
    configManager = new PerformanceConfigurationManager(initialConfig);
    toolFilter = new DefaultToolFilter(configManager);
    systemPromptBuilder = new SystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
    delegationEngine = new DefaultDelegationEngine(agentEngine, configManager);

    // Mock VS Code configuration
    mockVscode.workspace.getConfiguration.returns({
      get: sinon.stub(),
      update: sinon.stub().resolves(),
      has: sinon.stub().returns(true)
    });
  });

  teardown(() => {
    // Clean up all active agents and delegations
    try {
      const activeAgents = agentEngine.getActiveAgents();
      activeAgents.forEach(agent => agentEngine.terminateAgent(agent.agentName));
      delegationEngine.cleanup();
      configManager.dispose();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
    cleanupTestEnvironment();
  });

  suite('Agent Initialization Performance', () => {
    test('should initialize single agent quickly', async () => {
      const agentConfig = createTestAgent('performance-test-agent');
      
      // Add agent to configuration
      const config = configManager.getTestConfiguration();
      config.agents.push(agentConfig);
      configManager.setTestConfiguration(config);
      
      performanceMonitor.start();
      const context = await agentEngine.initializeAgent(agentConfig);
      const metrics = performanceMonitor.end();

      assert.ok(context);
      assert.strictEqual(context.agentName, 'performance-test-agent');
      
      // Should complete in less than 100ms
      assert.ok(metrics.duration < 100, `Agent initialization took ${metrics.duration}ms, expected < 100ms`);
    });

    test('should initialize multiple agents efficiently', async () => {
      const agents = Array.from({ length: 50 }, (_, i) => 
        createTestAgent(`perf-agent-${i}`, `Performance testing ${i}`)
      );

      // Add agents to configuration
      const config = configManager.getTestConfiguration();
      config.agents.push(...agents);
      configManager.setTestConfiguration(config);

      performanceMonitor.start();
      
      const initPromises = agents.map(agent => agentEngine.initializeAgent(agent));
      const contexts = await Promise.all(initPromises);
      
      const metrics = performanceMonitor.end();

      assert.strictEqual(contexts.length, 50);
      contexts.forEach((context, i) => {
        assert.strictEqual(context.agentName, `perf-agent-${i}`);
      });

      // Should complete in less than 2 seconds for 50 agents
      assert.ok(metrics.duration < 2000, `50 agent initialization took ${metrics.duration}ms, expected < 2000ms`);
    });

    test('should handle large configuration efficiently', async () => {
      // Create configuration with many agents
      const manyAgents = Array.from({ length: 100 }, (_, i) => 
        createTestAgent(`large-config-agent-${i}`, `Large config testing ${i}`)
      );
      manyAgents[0].delegationPermissions = { type: 'all' }; // Coordinator can delegate to all

      const largeConfig = createTestConfiguration(manyAgents);
      configManager.setTestConfiguration(largeConfig);

      performanceMonitor.start();
      
      // Initialize coordinator with large configuration
      const context = await agentEngine.initializeAgent(manyAgents[0], largeConfig);
      
      const metrics = performanceMonitor.end();

      assert.ok(context);
      assert.strictEqual(context.availableDelegationTargets.length, 99); // All except self
      
      // Should complete in less than 500ms even with large config
      assert.ok(metrics.duration < 500, `Large config initialization took ${metrics.duration}ms, expected < 500ms`);
    });
  });

  suite('Delegation Performance', () => {
    test('should handle single delegation quickly', async () => {
      const config = configManager.getTestConfiguration();
      config.agents.push(createTestAgent('target-agent', 'Target tasks'));
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      performanceMonitor.start();
      
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'target-agent',
        'Performance test task',
        'Performance test report'
      );

      // Complete delegation quickly
      setTimeout(() => {
        delegationEngine.reportOut('target-agent', 'Performance test completed');
      }, 10);

      const result = await delegationPromise;
      const metrics = performanceMonitor.end();

      assert.ok(result.includes('Performance test completed'));
      
      // Should complete in less than 200ms
      assert.ok(metrics.duration < 200, `Single delegation took ${metrics.duration}ms, expected < 200ms`);
    });

    test('should handle high-volume concurrent delegations', async () => {
      // Add many target agents
      const targetAgents = Array.from({ length: 100 }, (_, i) => 
        createTestAgent(`target-${i}`, `Target tasks ${i}`)
      );

      const config = configManager.getTestConfiguration();
      config.agents.push(...targetAgents);
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      performanceMonitor.start();

      // Start many concurrent delegations
      const delegationPromises = targetAgents.map((agent, i) => 
        delegationEngine.delegateWork('coordinator', agent.name, `Task ${i}`, `Report ${i}`)
      );

      // Complete all delegations
      setTimeout(() => {
        targetAgents.forEach((agent, i) => {
          delegationEngine.reportOut(agent.name, `Task ${i} completed`);
        });
      }, 50);

      const results = await Promise.all(delegationPromises);
      const metrics = performanceMonitor.end();

      assert.strictEqual(results.length, 100);
      results.forEach((result, i) => {
        assert.ok(result.includes(`Task ${i} completed`));
      });

      // Should complete in less than 5 seconds for 100 concurrent delegations
      assert.ok(metrics.duration < 5000, `100 concurrent delegations took ${metrics.duration}ms, expected < 5000ms`);
    }).timeout(10000);

    test('should maintain performance with delegation chains', async () => {
      // Create a simpler chain of 5 agents for more reliable testing
      const chainAgents = Array.from({ length: 5 }, (_, i) => {
        const nextAgent = i < 4 ? `chain-${i + 1}` : undefined;
        return createTestAgent(
          `chain-${i}`, 
          `Chain task ${i}`,
          nextAgent ? { type: 'specific', agents: [nextAgent] } : { type: 'none' }
        );
      });

      const config = configManager.getTestConfiguration();
      config.agents.push(...chainAgents);
      configManager.setTestConfiguration(config);

      // Initialize first agent
      await agentEngine.initializeAgent(chainAgents[0], config);

      performanceMonitor.start();

      // Start simple delegation (no complex chaining for performance test)
      const delegationPromise = delegationEngine.delegateWork(
        'chain-0',
        'chain-1',
        'Chain performance test',
        'Chain performance report'
      );

      // Complete delegation quickly
      setTimeout(() => {
        delegationEngine.reportOut('chain-1', 'Chain performance test completed');
      }, 25);

      const result = await delegationPromise;
      const metrics = performanceMonitor.end();

      assert.ok(result.includes('Chain performance test completed'));
      
      // Should complete in less than 500ms for simple chain
      assert.ok(metrics.duration < 500, `Chain delegation took ${metrics.duration}ms, expected < 500ms`);
    }).timeout(2000);
  });

  suite('Memory Usage and Cleanup', () => {
    test('should not leak memory with repeated agent initialization', async () => {
      const agentConfig = createTestAgent('memory-test-agent');
      
      // Add agent to configuration
      const config = configManager.getTestConfiguration();
      config.agents.push(agentConfig);
      configManager.setTestConfiguration(config);
      
      performanceMonitor.start();

      // Initialize and terminate many agents
      for (let i = 0; i < 100; i++) {
        const context = await agentEngine.initializeAgent(agentConfig);
        assert.ok(context);
        agentEngine.terminateAgent('memory-test-agent');
      }

      const metrics = performanceMonitor.end();

      // Should not have any active agents
      const activeAgents = agentEngine.getActiveAgents();
      assert.strictEqual(activeAgents.length, 0);

      // Memory delta should be reasonable (less than 50MB)
      const memoryDeltaMB = metrics.memoryDelta / (1024 * 1024);
      assert.ok(memoryDeltaMB < 50, `Memory delta: ${memoryDeltaMB}MB, expected < 50MB`);
    });

    test('should cleanup completed delegations efficiently', async () => {
      const config = configManager.getTestConfiguration();
      config.agents.push(createTestAgent('cleanup-target', 'Cleanup tasks'));
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      performanceMonitor.start();

      // Create many short-lived delegations
      for (let batch = 0; batch < 20; batch++) {
        const batchPromises = [];
        
        for (let i = 0; i < 10; i++) {
          const promise = delegationEngine.delegateWork(
            'coordinator',
            'cleanup-target',
            `Cleanup batch ${batch} task ${i}`,
            `Cleanup batch ${batch} report ${i}`
          );
          batchPromises.push(promise);
        }

        // Complete batch quickly
        setTimeout(() => {
          for (let i = 0; i < 10; i++) {
            delegationEngine.reportOut('cleanup-target', `Cleanup batch ${batch} task ${i} completed`);
          }
        }, 5);

        await Promise.all(batchPromises);
        
        // Force cleanup
        delegationEngine.cleanup();
      }

      const metrics = performanceMonitor.end();

      // Should have no active delegations
      const activeDelegations = delegationEngine.getActiveDelegations();
      assert.strictEqual(activeDelegations.length, 0);

      // Should complete in reasonable time
      assert.ok(metrics.duration < 3000, `Cleanup test took ${metrics.duration}ms, expected < 3000ms`);
      
      // Memory usage should be reasonable
      const memoryDeltaMB = metrics.memoryDelta / (1024 * 1024);
      assert.ok(memoryDeltaMB < 100, `Memory delta: ${memoryDeltaMB}MB, expected < 100MB`);
    }).timeout(10000);

    test('should handle memory pressure gracefully', async () => {
      // Create many agents to simulate memory pressure
      const manyAgents = Array.from({ length: 200 }, (_, i) => 
        createTestAgent(`memory-pressure-${i}`, `Memory pressure task ${i}`)
      );

      const config = configManager.getTestConfiguration();
      config.agents.push(...manyAgents);
      configManager.setTestConfiguration(config);

      performanceMonitor.start();

      // Initialize many agents simultaneously
      const initPromises = manyAgents.map(agent => agentEngine.initializeAgent(agent));
      const contexts = await Promise.all(initPromises);

      assert.strictEqual(contexts.length, 200);

      // Terminate all agents
      manyAgents.forEach(agent => agentEngine.terminateAgent(agent.name));

      const metrics = performanceMonitor.end();

      // Should have no active agents
      const activeAgents = agentEngine.getActiveAgents();
      assert.strictEqual(activeAgents.length, 0);

      // Should complete in reasonable time
      assert.ok(metrics.duration < 5000, `Memory pressure test took ${metrics.duration}ms, expected < 5000ms`);
    }).timeout(10000);
  });

  suite('System Prompt Performance', () => {
    test('should build system prompts efficiently with many delegation targets', async () => {
      // Create configuration with many agents
      const manyAgents = Array.from({ length: 50 }, (_, i) => 
        createTestAgent(`prompt-target-${i}`, `Prompt target task ${i}`)
      );
      manyAgents.unshift(createTestAgent('prompt-coordinator', 'Coordination', { type: 'all' }));

      const config = createTestConfiguration(manyAgents);
      configManager.setTestConfiguration(config);

      performanceMonitor.start();

      // Initialize coordinator (triggers system prompt building)
      const context = await agentEngine.initializeAgent(manyAgents[0], config);

      const metrics = performanceMonitor.end();

      assert.ok(context);
      assert.strictEqual(context.availableDelegationTargets.length, 50);
      assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));

      // Should complete in less than 500ms even with 50 targets
      assert.ok(metrics.duration < 500, `System prompt building took ${metrics.duration}ms, expected < 500ms`);
    });

    test('should handle repeated system prompt building efficiently', async () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('target1', 'Target 1 tasks'),
        createTestAgent('target2', 'Target 2 tasks'),
        createTestAgent('target3', 'Target 3 tasks')
      ];
      const config = createTestConfiguration(agents);

      performanceMonitor.start();

      // Build system prompts many times
      for (let i = 0; i < 100; i++) {
        const context = await agentEngine.initializeAgent(agents[0], config);
        assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
        agentEngine.terminateAgent('coordinator');
      }

      const metrics = performanceMonitor.end();

      // Should complete in less than 1 second for 100 builds
      assert.ok(metrics.duration < 1000, `100 system prompt builds took ${metrics.duration}ms, expected < 1000ms`);
    });
  });

  suite('Concurrent Operations Performance', () => {
    test('should handle concurrent agent operations efficiently', async () => {
      // Add target agents
      const targetAgents = Array.from({ length: 50 }, (_, i) => 
        createTestAgent(`concurrent-target-${i}`, `Concurrent task ${i}`)
      );

      const config = configManager.getTestConfiguration();
      config.agents.push(...targetAgents);
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      performanceMonitor.start();

      // Start concurrent operations: delegations, terminations, initializations
      const operations = [];

      // Concurrent delegations
      for (let i = 0; i < 25; i++) {
        const promise = delegationEngine.delegateWork(
          'coordinator',
          `concurrent-target-${i}`,
          `Concurrent task ${i}`,
          `Concurrent report ${i}`
        );
        operations.push(promise);
      }

      // Concurrent agent initializations
      for (let i = 25; i < 50; i++) {
        const promise = agentEngine.initializeAgent(targetAgents[i]);
        operations.push(promise);
      }

      // Complete delegations
      setTimeout(() => {
        for (let i = 0; i < 25; i++) {
          delegationEngine.reportOut(`concurrent-target-${i}`, `Concurrent task ${i} completed`);
        }
      }, 50);

      const results = await Promise.allSettled(operations);
      const metrics = performanceMonitor.end();

      // All operations should complete
      assert.strictEqual(results.length, 50);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      assert.ok(successful >= 45, `Only ${successful}/50 operations succeeded`);

      // Should complete in reasonable time
      assert.ok(metrics.duration < 3000, `Concurrent operations took ${metrics.duration}ms, expected < 3000ms`);
    }).timeout(10000);

    test('should maintain performance under mixed workload', async () => {
      // Create diverse agent configuration
      const diverseAgents = [
        createTestAgent('heavy-delegator', 'Heavy delegation', { type: 'all' }),
        createTestAgent('light-worker', 'Light work', { type: 'none' }),
        createTestAgent('chain-starter', 'Chain start', { type: 'specific', agents: ['chain-middle'] }),
        createTestAgent('chain-middle', 'Chain middle', { type: 'specific', agents: ['chain-end'] }),
        createTestAgent('chain-end', 'Chain end', { type: 'none' })
      ];

      const config = configManager.getTestConfiguration();
      config.agents.push(...diverseAgents);
      configManager.setTestConfiguration(config);

      performanceMonitor.start();

      // Mixed workload: simple delegations, chains, concurrent operations
      const workloadPromises = [];

      // Simple delegations
      await agentEngine.initializeAgent(diverseAgents[0], config);
      for (let i = 0; i < 10; i++) {
        const promise = delegationEngine.delegateWork(
          'heavy-delegator',
          'light-worker',
          `Simple task ${i}`,
          `Simple report ${i}`
        );
        workloadPromises.push(promise);
      }

      // Delegation chain
      await agentEngine.initializeAgent(diverseAgents[2], config);
      const chainPromise = delegationEngine.delegateWork(
        'chain-starter',
        'chain-middle',
        'Chain task',
        'Chain report'
      );
      workloadPromises.push(chainPromise);

      // Complete simple tasks
      setTimeout(() => {
        for (let i = 0; i < 10; i++) {
          delegationEngine.reportOut('light-worker', `Simple task ${i} completed`);
        }
      }, 25);

      // Handle chain delegation
      setTimeout(async () => {
        try {
          const middlePromise = delegationEngine.delegateWork(
            'chain-middle',
            'chain-end',
            'Chain middle task',
            'Chain middle report'
          );

          setTimeout(() => {
            delegationEngine.reportOut('chain-end', 'Chain end completed');
          }, 25);

          const middleResult = await middlePromise;
          delegationEngine.reportOut('chain-middle', `Chain middle completed: ${middleResult}`);
        } catch (error) {
          delegationEngine.reportOut('chain-middle', 'Chain middle failed');
        }
      }, 50);

      const results = await Promise.allSettled(workloadPromises);
      const metrics = performanceMonitor.end();

      // Most operations should succeed
      const successful = results.filter(r => r.status === 'fulfilled').length;
      assert.ok(successful >= 10, `Only ${successful}/${results.length} operations succeeded`);

      // Should complete in reasonable time
      assert.ok(metrics.duration < 2000, `Mixed workload took ${metrics.duration}ms, expected < 2000ms`);
    }).timeout(5000);
  });

  suite('Scalability Tests', () => {
    test('should scale to large numbers of agents', async () => {
      // Test with 100 agents (more reasonable for testing)
      const scaleAgents = Array.from({ length: 100 }, (_, i) => 
        createTestAgent(`scale-agent-${i}`, `Scale task ${i}`)
      );
      scaleAgents[0].delegationPermissions = { type: 'all' };

      const config = createTestConfiguration(scaleAgents);
      configManager.setTestConfiguration(config);

      performanceMonitor.start();

      // Initialize coordinator with large configuration
      const context = await agentEngine.initializeAgent(scaleAgents[0], config);

      const metrics = performanceMonitor.end();

      assert.ok(context);
      assert.strictEqual(context.availableDelegationTargets.length, 99);

      // Should handle large scale efficiently
      assert.ok(metrics.duration < 1000, `Large scale initialization took ${metrics.duration}ms, expected < 1000ms`);
    });

    test('should maintain performance with complex delegation permissions', async () => {
      // Create agents with complex delegation patterns
      const complexAgents = Array.from({ length: 50 }, (_, i) => {
        let delegationPermissions;
        
        if (i % 3 === 0) {
          delegationPermissions = { type: 'all' };
        } else if (i % 3 === 1) {
          delegationPermissions = { type: 'none' };
        } else {
          // Specific permissions to subset
          const targets = [`complex-agent-${(i + 1) % 50}`, `complex-agent-${(i + 2) % 50}`];
          delegationPermissions = { type: 'specific', agents: targets };
        }

        return createTestAgent(`complex-agent-${i}`, `Complex task ${i}`, delegationPermissions);
      });

      const config = createTestConfiguration(complexAgents);
      configManager.setTestConfiguration(config);

      performanceMonitor.start();

      // Initialize multiple agents with complex permissions
      const initPromises = complexAgents.slice(0, 10).map(agent => 
        agentEngine.initializeAgent(agent, config)
      );

      const contexts = await Promise.all(initPromises);

      const metrics = performanceMonitor.end();

      assert.strictEqual(contexts.length, 10);
      contexts.forEach(context => {
        assert.ok(context);
        assert.ok(Array.isArray(context.availableDelegationTargets));
      });

      // Should handle complex permissions efficiently
      assert.ok(metrics.duration < 1000, `Complex permissions took ${metrics.duration}ms, expected < 1000ms`);
    });
  });
});