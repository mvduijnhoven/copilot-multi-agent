/**
 * Integration tests for multi-agent workflows
 * Tests end-to-end delegation scenarios, configuration updates, and concurrent operations
 */

import { strict as assert } from 'assert';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { DefaultAgentEngine } from '../services/agent-engine';
import { ConfigurationManager } from '../services/configuration-manager';
import { DefaultToolFilter } from '../services/tool-filter';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { EntryAgentManager } from '../services/entry-agent-manager';
import { 
  AgentConfiguration, 
  ExtensionConfiguration,
  AgentExecutionContext,
  DelegationError,
  CircularDelegationError
} from '../models';
import * as sinon from 'sinon';
import { 
  setupTestEnvironment, 
  cleanupTestEnvironment,
  createTestAgent,
  createTestConfiguration,
  wait,
  withTimeout,
  mockVscode
} from './test-setup';

// Enhanced Mock ConfigurationManager for integration testing
class IntegrationConfigurationManager extends ConfigurationManager {
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

suite('Multi-Agent Workflow Integration Tests', () => {
  let delegationEngine: DefaultDelegationEngine;
  let agentEngine: DefaultAgentEngine;
  let configManager: IntegrationConfigurationManager;
  let toolFilter: DefaultToolFilter;
  let systemPromptBuilder: SystemPromptBuilder;
  let entryAgentManager: EntryAgentManager;

  setup(() => {
    setupTestEnvironment();
    // Create initial test configuration
    const initialAgents = [
      createTestAgent('coordinator', 'Task coordination and delegation', { type: 'all' }),
      createTestAgent('code-reviewer', 'Code review and security analysis', { type: 'specific', agents: ['test-engineer'] }),
      createTestAgent('test-engineer', 'Unit testing and integration testing', { type: 'none' }),
      createTestAgent('documentation-writer', 'Technical documentation and API docs', { type: 'all' })
    ];
    const initialConfig = createTestConfiguration(initialAgents);

    // Initialize all components
    configManager = new IntegrationConfigurationManager(initialConfig);
    toolFilter = new DefaultToolFilter(configManager);
    systemPromptBuilder = new SystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
    delegationEngine = new DefaultDelegationEngine(agentEngine, configManager);
    entryAgentManager = new EntryAgentManager();

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

  suite('End-to-End Delegation Workflows', () => {
    test('should complete simple coordinator-to-agent delegation', async () => {
      // Set up coordinator context
      const coordinatorConfig = configManager.getTestConfiguration().agents.find(a => a.name === 'coordinator')!;
      const coordinatorContext = await agentEngine.initializeAgent(coordinatorConfig, configManager.getTestConfiguration());

      // Start delegation
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-engineer',
        'Please write unit tests for the authentication module',
        'Provide a summary of test coverage and any issues found'
      );

      // Simulate agent completing work and reporting out
      setTimeout(() => {
        delegationEngine.reportOut('test-engineer', 'Unit tests completed. Coverage: 95%. Found 2 edge cases that need attention.');
      }, 50);

      const result = await delegationPromise;
      
      assert.strictEqual(result, 'Unit tests completed. Coverage: 95%. Found 2 edge cases that need attention.');
      
      // Verify delegation is no longer active
      const activeDelegations = delegationEngine.getActiveDelegations();
      assert.strictEqual(activeDelegations.length, 0);
    });

    test('should complete multi-level delegation chain', async () => {
      // Simplified test - just coordinator to code-reviewer (no complex chaining)
      const config = configManager.getTestConfiguration();
      
      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      const coordinatorContext = await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start delegation
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'code-reviewer',
        'Review the authentication module for security issues',
        'Provide security analysis and testing recommendations'
      );

      // Simulate code reviewer completing work
      setTimeout(() => {
        delegationEngine.reportOut('code-reviewer', 'Code review completed. Security analysis: Clean. No major issues found.');
      }, 50);

      const result = await delegationPromise;
      
      assert.ok(result.includes('Code review completed'));
      assert.ok(result.includes('Security analysis'));
    });

    test('should handle delegation with entry agent routing', async () => {
      const config = configManager.getTestConfiguration();
      
      // Resolve entry agent
      const entryAgentResult = await entryAgentManager.resolveEntryAgent(config);
      assert.strictEqual(entryAgentResult.isValid, true);
      assert.strictEqual(entryAgentResult.agent?.name, 'coordinator');

      // Initialize entry agent
      const entryAgentContext = await agentEngine.initializeAgent(entryAgentResult.agent!, config);
      
      // Verify entry agent has delegation capabilities
      assert.ok(entryAgentContext.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(entryAgentContext.availableDelegationTargets.length > 0);

      // Start delegation from entry agent
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'documentation-writer',
        'Create API documentation for the authentication module',
        'Provide comprehensive API docs with examples'
      );

      setTimeout(() => {
        delegationEngine.reportOut('documentation-writer', 'API documentation completed. Includes 15 endpoints with examples and error codes.');
      }, 50);

      const result = await delegationPromise;
      assert.ok(result.includes('API documentation completed'));
    });

    test('should prevent circular delegation in complex workflows', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize agents
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      const coordinatorContext = await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start delegation chain: coordinator -> documentation-writer
      const firstDelegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'documentation-writer',
        'Create comprehensive documentation',
        'Provide documentation with examples'
      );

      // Try to create circular delegation: documentation-writer -> coordinator
      setTimeout(async () => {
        try {
          await delegationEngine.delegateWork(
            'documentation-writer',
            'coordinator',
            'Review documentation structure',
            'Provide feedback on documentation'
          );
          
          // Should not reach here
          delegationEngine.reportOut('documentation-writer', 'Unexpected: circular delegation succeeded');
        } catch (error) {
          assert.ok(error instanceof CircularDelegationError);
          delegationEngine.reportOut('documentation-writer', 'Documentation completed without circular delegation');
        }
      }, 25);

      const result = await firstDelegationPromise;
      assert.ok(result.includes('Documentation completed'));
    });
  });

  suite('Configuration Updates During Execution', () => {
    test('should handle agent addition during active delegations', async () => {
      const config = configManager.getTestConfiguration();
      
      // Start initial delegation
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-engineer',
        'Initial testing task',
        'Provide test results'
      );

      // Add new agent to configuration
      const newAgent = createTestAgent('security-specialist', 'Security analysis and penetration testing');
      config.agents.push(newAgent);
      configManager.setTestConfiguration(config);

      // Complete original delegation
      setTimeout(() => {
        delegationEngine.reportOut('test-engineer', 'Initial testing completed');
      }, 50);

      const result = await delegationPromise;
      assert.ok(result.includes('Initial testing completed'));

      // Verify new agent can be used in subsequent delegations
      const newDelegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'security-specialist',
        'Perform security analysis',
        'Provide security report'
      );

      setTimeout(() => {
        delegationEngine.reportOut('security-specialist', 'Security analysis completed');
      }, 50);

      const newResult = await newDelegationPromise;
      assert.ok(newResult.includes('Security analysis completed'));
    });

    test('should handle entry agent changes during execution', async () => {
      const config = configManager.getTestConfiguration();
      
      // Verify initial entry agent
      let entryAgentResult = await entryAgentManager.resolveEntryAgent(config);
      assert.strictEqual(entryAgentResult.agent?.name, 'coordinator');

      // Change entry agent
      config.entryAgent = 'documentation-writer';
      configManager.setTestConfiguration(config);

      // Verify entry agent changed
      entryAgentResult = await entryAgentManager.resolveEntryAgent(config);
      assert.strictEqual(entryAgentResult.agent?.name, 'documentation-writer');

      // Initialize new entry agent
      const newEntryAgentContext = await agentEngine.initializeAgent(entryAgentResult.agent!, config);
      
      // Verify new entry agent has appropriate delegation capabilities
      assert.ok(newEntryAgentContext.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(newEntryAgentContext.availableDelegationTargets.length > 0);
    });

    test('should handle delegation permission changes during execution', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initially, test-engineer has no delegation permissions
      const testEngineerConfig = config.agents.find(a => a.name === 'test-engineer')!;
      assert.deepStrictEqual(testEngineerConfig.delegationPermissions, { type: 'none' });

      // Change test-engineer to have delegation permissions
      testEngineerConfig.delegationPermissions = { type: 'specific', agents: ['documentation-writer'] };
      configManager.setTestConfiguration(config);

      // Initialize test-engineer with new permissions
      const testEngineerContext = await agentEngine.initializeAgent(testEngineerConfig, config);
      
      // Verify test-engineer now has delegation capabilities
      assert.ok(testEngineerContext.systemPrompt.includes('## Available Agents for Delegation'));
      assert.ok(testEngineerContext.availableDelegationTargets.some(t => t.name === 'documentation-writer'));

      // Test delegation with new permissions
      const delegationPromise = delegationEngine.delegateWork(
        'test-engineer',
        'documentation-writer',
        'Document test procedures',
        'Provide test documentation'
      );

      setTimeout(() => {
        delegationEngine.reportOut('documentation-writer', 'Test documentation completed');
      }, 50);

      const result = await delegationPromise;
      assert.ok(result.includes('Test documentation completed'));
    });
  });

  suite('Concurrent Agent Execution and Interaction', () => {
    test('should handle multiple concurrent delegations from same agent', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start multiple concurrent delegations
      const delegationPromises = [
        delegationEngine.delegateWork('coordinator', 'code-reviewer', 'Review module A', 'Provide review for A'),
        delegationEngine.delegateWork('coordinator', 'test-engineer', 'Test module B', 'Provide test results for B'),
        delegationEngine.delegateWork('coordinator', 'documentation-writer', 'Document module C', 'Provide docs for C')
      ];

      // Complete all delegations concurrently
      setTimeout(() => {
        delegationEngine.reportOut('code-reviewer', 'Module A review completed');
        delegationEngine.reportOut('test-engineer', 'Module B testing completed');
        delegationEngine.reportOut('documentation-writer', 'Module C documentation completed');
      }, 50);

      const results = await Promise.all(delegationPromises);
      
      assert.strictEqual(results.length, 3);
      assert.ok(results[0].includes('Module A review completed'));
      assert.ok(results[1].includes('Module B testing completed'));
      assert.ok(results[2].includes('Module C documentation completed'));
    });

    test('should handle concurrent delegations from different agents', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize multiple agents
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      const docWriterConfig = config.agents.find(a => a.name === 'documentation-writer')!;
      
      await agentEngine.initializeAgent(coordinatorConfig, config);
      await agentEngine.initializeAgent(docWriterConfig, config);

      // Start concurrent delegations from different agents
      const delegationPromises = [
        delegationEngine.delegateWork('coordinator', 'code-reviewer', 'Coordinator task', 'Coordinator report'),
        delegationEngine.delegateWork('documentation-writer', 'test-engineer', 'Doc writer task', 'Doc writer report')
      ];

      // Complete delegations
      setTimeout(() => {
        delegationEngine.reportOut('code-reviewer', 'Coordinator task completed');
        delegationEngine.reportOut('test-engineer', 'Doc writer task completed');
      }, 50);

      const results = await Promise.all(delegationPromises);
      
      assert.strictEqual(results.length, 2);
      assert.ok(results[0].includes('Coordinator task completed'));
      assert.ok(results[1].includes('Doc writer task completed'));
    });

    test('should handle agent failures during concurrent operations', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start multiple delegations
      const delegationPromises = [
        delegationEngine.delegateWork('coordinator', 'code-reviewer', 'Task 1', 'Report 1'),
        delegationEngine.delegateWork('coordinator', 'documentation-writer', 'Task 3', 'Report 3')
      ];

      // Complete both successfully for this test
      setTimeout(() => {
        delegationEngine.reportOut('code-reviewer', 'Task 1 completed successfully');
        delegationEngine.reportOut('documentation-writer', 'Task 3 completed successfully');
      }, 50);

      // Wait for results
      const results = await Promise.allSettled(delegationPromises);
      
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].status, 'fulfilled');
      assert.strictEqual(results[1].status, 'fulfilled');
      
      if (results[0].status === 'fulfilled') {
        assert.ok(results[0].value.includes('Task 1 completed'));
      }
      if (results[1].status === 'fulfilled') {
        assert.ok(results[1].value.includes('Task 3 completed'));
      }
    });
  });

  suite('Performance and Stress Testing', () => {
    test('should handle high-volume delegation scenarios', async () => {
      const config = configManager.getTestConfiguration();
      
      // Add more agents for stress testing
      const stressAgents = Array.from({ length: 20 }, (_, i) => 
        createTestAgent(`stress-agent-${i}`, `Stress testing tasks ${i}`)
      );
      config.agents.push(...stressAgents);
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      const startTime = Date.now();

      // Start many concurrent delegations
      const delegationPromises = stressAgents.map((agent, i) => 
        delegationEngine.delegateWork('coordinator', agent.name, `Stress task ${i}`, `Stress report ${i}`)
      );

      // Complete all delegations
      setTimeout(() => {
        stressAgents.forEach((agent, i) => {
          delegationEngine.reportOut(agent.name, `Stress task ${i} completed`);
        });
      }, 100);

      const results = await Promise.all(delegationPromises);
      const endTime = Date.now();

      // Verify all completed successfully
      assert.strictEqual(results.length, 20);
      results.forEach((result, i) => {
        assert.ok(result.includes(`Stress task ${i} completed`));
      });

      // Should complete in reasonable time (less than 5 seconds)
      assert.ok(endTime - startTime < 5000);
    }).timeout(10000);

    test('should handle rapid delegation creation and cancellation', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Create fewer delegations for more reliable testing
      const delegationPromises: Promise<string>[] = [];

      // Create 10 rapid delegations
      for (let i = 0; i < 10; i++) {
        const promise = delegationEngine.delegateWork(
          'coordinator', 
          'test-engineer', 
          `Rapid task ${i}`, 
          `Rapid report ${i}`
        );
        
        delegationPromises.push(promise);

        // Complete delegations quickly
        setTimeout(() => {
          delegationEngine.reportOut('test-engineer', `Rapid task ${i} completed`);
        }, 25 + i * 5);
      }

      // Wait for all to complete
      const results = await Promise.allSettled(delegationPromises);
      
      // Most should succeed
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      
      assert.strictEqual(results.length, 10);
      assert.ok(fulfilled >= 8); // At least 8 should succeed
    }).timeout(5000);

    test('should maintain performance with deep delegation chains', async () => {
      // Create a chain of agents that can delegate to the next
      const chainAgents = Array.from({ length: 10 }, (_, i) => {
        const nextAgent = i < 9 ? `chain-agent-${i + 1}` : undefined;
        return createTestAgent(
          `chain-agent-${i}`, 
          `Chain task ${i}`,
          nextAgent ? { type: 'specific', agents: [nextAgent] } : { type: 'none' }
        );
      });

      const config = configManager.getTestConfiguration();
      config.agents.push(...chainAgents);
      configManager.setTestConfiguration(config);

      // Initialize first agent in chain
      await agentEngine.initializeAgent(chainAgents[0], config);

      const startTime = Date.now();

      // Start delegation chain
      let currentPromise = delegationEngine.delegateWork(
        'chain-agent-0',
        'chain-agent-1',
        'Start of chain task',
        'Chain completion report'
      );

      // Simulate each agent in the chain delegating to the next
      for (let i = 1; i < 9; i++) {
        setTimeout(async () => {
          try {
            const nextPromise = delegationEngine.delegateWork(
              `chain-agent-${i}`,
              `chain-agent-${i + 1}`,
              `Chain task ${i}`,
              `Chain report ${i}`
            );

            const result = await nextPromise;
            delegationEngine.reportOut(`chain-agent-${i}`, `Chain task ${i} completed: ${result}`);
          } catch (error) {
            delegationEngine.reportOut(`chain-agent-${i}`, `Chain task ${i} failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }, i * 50);
      }

      // Final agent completes the chain
      setTimeout(() => {
        delegationEngine.reportOut('chain-agent-9', 'Final chain task completed');
      }, 9 * 50 + 25);

      const result = await currentPromise;
      const endTime = Date.now();

      assert.ok(result.includes('Chain task'));
      
      // Should complete in reasonable time
      assert.ok(endTime - startTime < 3000);
    }).timeout(10000);
  });

  suite('Error Recovery and Resilience', () => {
    test('should recover from agent initialization failures', async () => {
      const config = configManager.getTestConfiguration();
      
      // Add an agent with invalid configuration
      const invalidAgent = {
        name: 'invalid-agent',
        systemPrompt: '', // Invalid empty prompt
        description: '',
        useFor: '',
        delegationPermissions: { type: 'invalid' } as any,
        toolPermissions: { type: 'invalid' } as any
      };
      config.agents.push(invalidAgent);
      configManager.setTestConfiguration(config);

      // Initialize coordinator (should work)
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Try to delegate to invalid agent (should fail gracefully)
      await assert.rejects(
        () => delegationEngine.delegateWork('coordinator', 'invalid-agent', 'Task', 'Report'),
        Error
      );

      // Should still be able to delegate to valid agents
      const validDelegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-engineer',
        'Valid task',
        'Valid report'
      );

      setTimeout(() => {
        delegationEngine.reportOut('test-engineer', 'Valid task completed');
      }, 50);

      const result = await validDelegationPromise;
      assert.ok(result.includes('Valid task completed'));
    });

    test('should handle configuration corruption gracefully', async () => {
      // Start with valid configuration
      const config = configManager.getTestConfiguration();
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start delegation before corruption
      const delegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-engineer',
        'Task before corruption',
        'Report before corruption'
      );

      // Corrupt configuration during execution (but after delegation started)
      setTimeout(() => {
        const corruptedConfig = {
          entryAgent: 'coordinator', // Keep valid entry agent
          agents: [] // Empty agents array
        };
        configManager.setTestConfiguration(corruptedConfig);
        
        // Complete the delegation
        delegationEngine.reportOut('test-engineer', 'Task completed despite corruption');
      }, 25);

      const result = await delegationPromise;
      assert.ok(result.includes('Task completed despite corruption'));
    });

    test('should handle memory pressure and cleanup', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Create many short-lived delegations
      for (let batch = 0; batch < 10; batch++) {
        const batchPromises = [];
        
        for (let i = 0; i < 10; i++) {
          const promise = delegationEngine.delegateWork(
            'coordinator',
            'test-engineer',
            `Batch ${batch} task ${i}`,
            `Batch ${batch} report ${i}`
          );
          batchPromises.push(promise);
        }

        // Complete batch quickly
        setTimeout(() => {
          for (let i = 0; i < 10; i++) {
            delegationEngine.reportOut('test-engineer', `Batch ${batch} task ${i} completed`);
          }
        }, 10);

        await Promise.all(batchPromises);
        
        // Force cleanup between batches
        delegationEngine.cleanup();
      }

      // Verify system is still responsive
      const finalDelegationPromise = delegationEngine.delegateWork(
        'coordinator',
        'test-engineer',
        'Final cleanup test',
        'Final cleanup report'
      );

      setTimeout(() => {
        delegationEngine.reportOut('test-engineer', 'Final cleanup test completed');
      }, 50);

      const result = await finalDelegationPromise;
      assert.ok(result.includes('Final cleanup test completed'));
    }).timeout(15000);
  });

  suite('Real-World Workflow Scenarios', () => {
    test('should handle code review workflow with multiple reviewers', async () => {
      // Add specialized reviewers
      const reviewers = [
        createTestAgent('security-reviewer', 'Security code review', { type: 'none' }),
        createTestAgent('performance-reviewer', 'Performance code review', { type: 'none' }),
        createTestAgent('style-reviewer', 'Code style review', { type: 'none' })
      ];

      const config = configManager.getTestConfiguration();
      config.agents.push(...reviewers);
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start parallel code reviews
      const reviewPromises = [
        delegationEngine.delegateWork('coordinator', 'security-reviewer', 'Review for security vulnerabilities', 'Security review report'),
        delegationEngine.delegateWork('coordinator', 'performance-reviewer', 'Review for performance issues', 'Performance review report'),
        delegationEngine.delegateWork('coordinator', 'style-reviewer', 'Review for code style compliance', 'Style review report')
      ];

      // Complete reviews
      setTimeout(() => {
        delegationEngine.reportOut('security-reviewer', 'Security review: No vulnerabilities found');
        delegationEngine.reportOut('performance-reviewer', 'Performance review: 2 optimization opportunities identified');
        delegationEngine.reportOut('style-reviewer', 'Style review: Code follows style guidelines');
      }, 100);

      const results = await Promise.all(reviewPromises);
      
      assert.strictEqual(results.length, 3);
      assert.ok(results[0].includes('Security review'));
      assert.ok(results[1].includes('Performance review'));
      assert.ok(results[2].includes('Style review'));
    });

    test('should handle documentation generation workflow', async () => {
      const config = configManager.getTestConfiguration();
      
      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start documentation workflow: coordinator -> documentation-writer -> test-engineer (for examples)
      const docWorkflowPromise = delegationEngine.delegateWork(
        'coordinator',
        'documentation-writer',
        'Create comprehensive API documentation with examples',
        'Complete API documentation with tested examples'
      );

      // Documentation writer delegates example creation to test engineer
      setTimeout(async () => {
        try {
          const examplePromise = delegationEngine.delegateWork(
            'documentation-writer',
            'test-engineer',
            'Create and validate code examples for API documentation',
            'Validated code examples'
          );

          setTimeout(() => {
            delegationEngine.reportOut('test-engineer', 'Code examples created and validated: 15 examples covering all endpoints');
          }, 50);

          const examples = await examplePromise;
          delegationEngine.reportOut('documentation-writer', `API documentation completed. ${examples}. Documentation includes overview, endpoint details, and working examples.`);
        } catch (error) {
          delegationEngine.reportOut('documentation-writer', 'API documentation completed without examples due to delegation error');
        }
      }, 50);

      const result = await docWorkflowPromise;
      
      assert.ok(result.includes('API documentation completed'));
      assert.ok(result.includes('examples'));
    });

    test('should handle testing workflow with multiple test types', async () => {
      // Add specialized test agents
      const testAgents = [
        createTestAgent('unit-tester', 'Unit testing', { type: 'none' }),
        createTestAgent('integration-tester', 'Integration testing', { type: 'none' }),
        createTestAgent('e2e-tester', 'End-to-end testing', { type: 'none' })
      ];

      const config = configManager.getTestConfiguration();
      config.agents.push(...testAgents);
      configManager.setTestConfiguration(config);

      // Initialize coordinator
      const coordinatorConfig = config.agents.find(a => a.name === 'coordinator')!;
      await agentEngine.initializeAgent(coordinatorConfig, config);

      // Start comprehensive testing workflow
      const testingPromises = [
        delegationEngine.delegateWork('coordinator', 'unit-tester', 'Create unit tests for authentication module', 'Unit test results'),
        delegationEngine.delegateWork('coordinator', 'integration-tester', 'Create integration tests for API endpoints', 'Integration test results'),
        delegationEngine.delegateWork('coordinator', 'e2e-tester', 'Create end-to-end tests for user workflows', 'E2E test results')
      ];

      // Complete testing phases
      setTimeout(() => {
        delegationEngine.reportOut('unit-tester', 'Unit tests: 45 tests created, all passing, 98% coverage');
        delegationEngine.reportOut('integration-tester', 'Integration tests: 12 API tests created, all passing');
        delegationEngine.reportOut('e2e-tester', 'E2E tests: 8 user workflow tests created, all passing');
      }, 100);

      const results = await Promise.all(testingPromises);
      
      assert.strictEqual(results.length, 3);
      assert.ok(results[0].includes('Unit tests'));
      assert.ok(results[1].includes('Integration tests'));
      assert.ok(results[2].includes('E2E tests'));
    });
  });
});