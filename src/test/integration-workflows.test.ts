/**
 * Integration tests for multi-agent workflows
 * Tests end-to-end delegation scenarios and agent interactions
 */

import * as assert from 'assert';
import {
  ExtensionConfiguration,
  AgentConfiguration,
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_CONFIG
} from '../models';

// Mock implementations for integration testing
class MockWorkflowEngine {
  private agents: Map<string, AgentConfiguration> = new Map();
  private delegationHistory: Array<{
    from: string;
    to: string;
    task: string;
    timestamp: Date;
    status: 'pending' | 'completed' | 'failed';
    result?: string;
  }> = [];

  constructor(config: ExtensionConfiguration) {
    // Register all agents
    config.agents.forEach(agent => {
      this.agents.set(agent.name, agent);
    });
  }

  async delegateWork(fromAgent: string, toAgent: string, task: string): Promise<string> {
    const fromConfig = this.agents.get(fromAgent);
    const toConfig = this.agents.get(toAgent);

    if (!fromConfig || !toConfig) {
      throw new Error(`Agent not found: ${!fromConfig ? fromAgent : toAgent}`);
    }

    // Check delegation permissions
    if (!this.canDelegate(fromAgent, toAgent)) {
      throw new Error(`Delegation not allowed: ${fromAgent} -> ${toAgent}`);
    }

    // Record delegation
    const delegation: {
      from: string;
      to: string;
      task: string;
      timestamp: Date;
      status: 'pending' | 'completed' | 'failed';
      result?: string;
    } = {
      from: fromAgent,
      to: toAgent,
      task,
      timestamp: new Date(),
      status: 'pending',
      result: undefined
    };
    this.delegationHistory.push(delegation);

    // Simulate work execution
    const result = await this.executeTask(toAgent, task);

    // Update delegation status
    delegation.status = 'completed';
    delegation.result = result;

    return result;
  }

  private canDelegate(fromAgent: string, toAgent: string): boolean {
    const fromConfig = this.agents.get(fromAgent);
    if (!fromConfig) {
      return false;
    }

    if (fromAgent === toAgent) {
      return false;
    }

    switch (fromConfig.delegationPermissions.type) {
      case 'all':
        return true;
      case 'none':
        return false;
      case 'specific':
        return fromConfig.delegationPermissions.agents?.includes(toAgent) || false;
      default:
        return false;
    }
  }

  private async executeTask(agentName: string, task: string): Promise<string> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    // Simulate task execution based on agent capabilities
    let response = `Agent ${agentName} completed task: ${task}`;

    // Add some agent-specific behavior
    if (task.toLowerCase().includes('review') || task.toLowerCase().includes('security')) {
      response += `\n\nCode review findings:\n- No major issues found\n- Suggestions for improvement provided`;
    } else if (task.toLowerCase().includes('test')) {
      response += `\n\nTest results:\n- All tests passing\n- Coverage: 95%`;
    } else if (task.toLowerCase().includes('document')) {
      response += `\n\nDocumentation updated:\n- Added comprehensive examples\n- Updated API references`;
    }

    return response;
  }

  getDelegationHistory(): typeof this.delegationHistory {
    return [...this.delegationHistory];
  }

  getActiveAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  clearHistory(): void {
    this.delegationHistory = [];
  }
}

suite('Integration Workflow Tests', () => {
  let workflowEngine: MockWorkflowEngine;
  let testConfig: ExtensionConfiguration;

  setup(() => {
    testConfig = {
      entryAgent: 'coordinator',
      agents: [
        {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'all' }
        },
        {
          name: 'code-reviewer',
          systemPrompt: 'You are a code review specialist',
          description: 'Specialized in code review and quality analysis',
          useFor: 'Code review, security analysis, best practices',
          delegationPermissions: { type: 'specific', agents: ['tester'] },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        },
        {
          name: 'tester',
          systemPrompt: 'You are a testing specialist',
          description: 'Specialized in creating and running tests',
          useFor: 'Unit testing, integration testing, test automation',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        },
        {
          name: 'documenter',
          systemPrompt: 'You are a documentation specialist',
          description: 'Specialized in creating and maintaining documentation',
          useFor: 'API docs, user guides, technical writing',
          delegationPermissions: { type: 'specific', agents: ['code-reviewer'] },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        }
      ]
    };

    workflowEngine = new MockWorkflowEngine(testConfig);
  });

  teardown(() => {
    workflowEngine.clearHistory();
  });

  suite('Single-Level Delegation', () => {
    test('should successfully delegate from coordinator to custom agent', async () => {
      const result = await workflowEngine.delegateWork(
        'coordinator',
        'code-reviewer',
        'Review the authentication module for security issues'
      );

      assert.ok(result.includes('code-reviewer'));
      assert.ok(result.includes('Code review findings'));

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].from, 'coordinator');
      assert.strictEqual(history[0].to, 'code-reviewer');
      assert.strictEqual(history[0].status, 'completed');
    });

    test('should handle different task types appropriately', async () => {
      const testCases = [
        {
          agent: 'code-reviewer',
          task: 'Review the payment processing code for security vulnerabilities',
          expectedContent: 'Code review findings'
        },
        {
          agent: 'tester',
          task: 'Create comprehensive tests for the user authentication system',
          expectedContent: 'Test results'
        },
        {
          agent: 'documenter',
          task: 'Document the new API endpoints for the mobile team',
          expectedContent: 'Documentation updated'
        }
      ];

      for (const testCase of testCases) {
        workflowEngine.clearHistory();

        const result = await workflowEngine.delegateWork(
          'coordinator',
          testCase.agent,
          testCase.task
        );

        assert.ok(result.includes(testCase.agent));
        assert.ok(result.includes(testCase.expectedContent));

        const history = workflowEngine.getDelegationHistory();
        assert.strictEqual(history.length, 1);
        assert.strictEqual(history[0].status, 'completed');
      }
    });

    test('should reject delegation when permissions are insufficient', async () => {
      try {
        await workflowEngine.delegateWork(
          'tester', // Has no delegation permissions
          'code-reviewer',
          'This should fail'
        );
        assert.fail('Should have thrown delegation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not allowed'));
      }

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 0);
    });

    test('should reject self-delegation', async () => {
      try {
        await workflowEngine.delegateWork(
          'coordinator',
          'coordinator',
          'Self delegation attempt'
        );
        assert.fail('Should have thrown delegation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not allowed'));
      }
    });

    test('should reject delegation to non-existent agent', async () => {
      try {
        await workflowEngine.delegateWork(
          'coordinator',
          'non-existent-agent',
          'This should fail'
        );
        assert.fail('Should have thrown agent not found error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Agent not found'));
      }
    });
  });

  suite('Multi-Level Delegation Chains', () => {
    test('should handle two-level delegation chain', async () => {
      // Coordinator -> Code Reviewer -> Tester
      const firstResult = await workflowEngine.delegateWork(
        'coordinator',
        'code-reviewer',
        'Review the new feature and ensure it has proper tests'
      );

      assert.ok(firstResult.includes('code-reviewer'));

      const secondResult = await workflowEngine.delegateWork(
        'code-reviewer',
        'tester',
        'Create comprehensive tests for the reviewed feature'
      );

      assert.ok(secondResult.includes('tester'));
      assert.ok(secondResult.includes('Test results') || secondResult.includes('test'));

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 2);

      // Verify delegation chain
      assert.strictEqual(history[0].from, 'coordinator');
      assert.strictEqual(history[0].to, 'code-reviewer');
      assert.strictEqual(history[1].from, 'code-reviewer');
      assert.strictEqual(history[1].to, 'tester');

      // Both should be completed
      assert.strictEqual(history[0].status, 'completed');
      assert.strictEqual(history[1].status, 'completed');
    });

    test('should handle complex delegation workflow', async () => {
      // Coordinator -> Documenter -> Code Reviewer -> Tester
      const results = [];

      results.push(await workflowEngine.delegateWork(
        'coordinator',
        'documenter',
        'Document the new API and have it reviewed for accuracy'
      ));

      results.push(await workflowEngine.delegateWork(
        'documenter',
        'code-reviewer',
        'Review the API documentation for technical accuracy'
      ));

      results.push(await workflowEngine.delegateWork(
        'code-reviewer',
        'tester',
        'Create tests to validate the documented API behavior'
      ));

      // Verify all results
      assert.strictEqual(results.length, 3);
      results.forEach((result, index) => {
        assert.ok(typeof result === 'string');
        assert.ok(result.length > 0);
      });

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 3);

      // Verify the delegation chain
      const expectedChain = [
        { from: 'coordinator', to: 'documenter' },
        { from: 'documenter', to: 'code-reviewer' },
        { from: 'code-reviewer', to: 'tester' }
      ];

      expectedChain.forEach((expected, index) => {
        assert.strictEqual(history[index].from, expected.from);
        assert.strictEqual(history[index].to, expected.to);
        assert.strictEqual(history[index].status, 'completed');
      });
    });

    test('should prevent circular delegation in chains', async () => {
      // First delegation: coordinator -> code-reviewer
      await workflowEngine.delegateWork(
        'coordinator',
        'code-reviewer',
        'Start a review process'
      );

      // Second delegation: code-reviewer -> tester
      await workflowEngine.delegateWork(
        'code-reviewer',
        'tester',
        'Create tests for the review'
      );

      // This would create a circular delegation if allowed
      // But our test setup doesn't have tester -> coordinator permission
      try {
        await workflowEngine.delegateWork(
          'tester',
          'coordinator',
          'This would create a circle'
        );
        assert.fail('Should have prevented circular delegation');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not allowed'));
      }
    });
  });

  suite('Concurrent Delegation Scenarios', () => {
    test('should handle concurrent delegations from coordinator', async () => {
      const delegations = [
        workflowEngine.delegateWork('coordinator', 'code-reviewer', 'Review module A'),
        workflowEngine.delegateWork('coordinator', 'tester', 'Test module B'),
        workflowEngine.delegateWork('coordinator', 'documenter', 'Document module C')
      ];

      const results = await Promise.all(delegations);

      assert.strictEqual(results.length, 3);
      results.forEach(result => {
        assert.ok(typeof result === 'string');
        assert.ok(result.length > 0);
      });

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 3);

      // All should be completed
      history.forEach(delegation => {
        assert.strictEqual(delegation.status, 'completed');
        assert.strictEqual(delegation.from, 'coordinator');
      });

      // Verify all target agents were used
      const targetAgents = history.map(d => d.to).sort();
      assert.deepStrictEqual(targetAgents, ['code-reviewer', 'documenter', 'tester']);
    });

    test('should handle mixed concurrent and sequential delegations', async () => {
      // Start with concurrent delegations
      const concurrentDelegations = [
        workflowEngine.delegateWork('coordinator', 'code-reviewer', 'Review feature X'),
        workflowEngine.delegateWork('coordinator', 'documenter', 'Document feature Y')
      ];

      const concurrentResults = await Promise.all(concurrentDelegations);
      assert.strictEqual(concurrentResults.length, 2);

      // Then do sequential delegations
      const sequentialResult = await workflowEngine.delegateWork(
        'code-reviewer',
        'tester',
        'Test the reviewed feature X'
      );

      assert.ok(sequentialResult.includes('tester'));

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 3);

      // All should be completed
      history.forEach(delegation => {
        assert.strictEqual(delegation.status, 'completed');
      });
    });

    test('should maintain delegation history integrity under concurrent access', async () => {
      const numberOfConcurrentDelegations = 10;
      const delegations = [];

      for (let i = 0; i < numberOfConcurrentDelegations; i++) {
        const targetAgent = i % 2 === 0 ? 'code-reviewer' : 'tester';
        delegations.push(
          workflowEngine.delegateWork('coordinator', targetAgent, `Task ${i}`)
        );
      }

      const results = await Promise.all(delegations);
      assert.strictEqual(results.length, numberOfConcurrentDelegations);

      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, numberOfConcurrentDelegations);

      // Verify all delegations completed successfully
      history.forEach((delegation, index) => {
        assert.strictEqual(delegation.status, 'completed');
        assert.strictEqual(delegation.from, 'coordinator');
        assert.ok(delegation.task.includes(`Task ${index}`) || delegation.task.includes('Task'));
      });
    });
  });

  suite('Error Handling in Workflows', () => {
    test('should handle agent failure gracefully', async () => {
      // Create a workflow engine that simulates agent failure
      const faultyConfig: ExtensionConfiguration = {
        ...testConfig,
        agents: [
          ...testConfig.agents,
          {
            name: 'faulty-agent',
            systemPrompt: 'I am a faulty agent',
            description: 'This agent will fail',
            useFor: 'Testing error handling',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'none' }
          }
        ]
      };

      const faultyEngine = new MockWorkflowEngine(faultyConfig);

      // Override executeTask to simulate failure
      (faultyEngine as any).executeTask = async (agentName: string, task: string) => {
        if (agentName === 'faulty-agent') {
          throw new Error('Agent execution failed');
        }
        return `Agent ${agentName} completed task: ${task}`;
      };

      try {
        await faultyEngine.delegateWork('coordinator', 'faulty-agent', 'This will fail');
        assert.fail('Should have thrown execution error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('execution failed'));
      }
    });

    test('should handle configuration updates during execution', async () => {
      // Start a delegation
      const result = await workflowEngine.delegateWork(
        'coordinator',
        'code-reviewer',
        'Review before config change'
      );

      assert.ok(result.includes('code-reviewer'));

      // Simulate configuration change by creating new engine
      const updatedConfig: ExtensionConfiguration = {
        ...testConfig,
        agents: testConfig.agents.map(agent => 
          agent.name === 'coordinator' 
            ? { ...agent, delegationPermissions: { type: 'none' } }
            : agent
        )
      };

      const updatedEngine = new MockWorkflowEngine(updatedConfig);

      // This should now fail due to updated permissions
      try {
        await updatedEngine.delegateWork(
          'coordinator',
          'code-reviewer',
          'This should fail with new config'
        );
        assert.fail('Should have failed with updated config');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not allowed'));
      }
    });

    test('should handle partial workflow failures', async () => {
      // Start a successful delegation
      const firstResult = await workflowEngine.delegateWork(
        'coordinator',
        'code-reviewer',
        'This will succeed'
      );

      assert.ok(firstResult.includes('code-reviewer'));

      // Attempt an invalid delegation
      try {
        await workflowEngine.delegateWork(
          'code-reviewer',
          'non-existent-agent',
          'This will fail'
        );
        assert.fail('Should have failed for non-existent agent');
      } catch (error) {
        assert.ok(error instanceof Error);
      }

      // Verify that the first delegation is still recorded
      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].status, 'completed');
    });
  });

  suite('Performance and Scalability', () => {
    test('should handle large delegation chains efficiently', async () => {
      // Create a longer chain: coordinator -> documenter -> code-reviewer -> tester
      const startTime = Date.now();

      const results = [];
      results.push(await workflowEngine.delegateWork(
        'coordinator',
        'documenter',
        'Start documentation process'
      ));

      results.push(await workflowEngine.delegateWork(
        'documenter',
        'code-reviewer',
        'Review documentation accuracy'
      ));

      results.push(await workflowEngine.delegateWork(
        'code-reviewer',
        'tester',
        'Test documented functionality'
      ));

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Verify results
      assert.strictEqual(results.length, 3);
      results.forEach(result => {
        assert.ok(typeof result === 'string');
        assert.ok(result.length > 0);
      });

      // Verify performance (should complete quickly)
      assert.ok(executionTime < 1000, `Execution took ${executionTime}ms, should be under 1000ms`);

      // Verify history
      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, 3);
      history.forEach(delegation => {
        assert.strictEqual(delegation.status, 'completed');
      });
    });

    test('should maintain performance with many concurrent delegations', async () => {
      const numberOfDelegations = 50;
      const startTime = Date.now();

      const delegations = [];
      for (let i = 0; i < numberOfDelegations; i++) {
        const targetAgent = ['code-reviewer', 'tester', 'documenter'][i % 3];
        delegations.push(
          workflowEngine.delegateWork('coordinator', targetAgent, `Concurrent task ${i}`)
        );
      }

      const results = await Promise.all(delegations);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Verify all completed
      assert.strictEqual(results.length, numberOfDelegations);

      // Verify performance
      assert.ok(executionTime < 5000, `Execution took ${executionTime}ms, should be under 5000ms`);

      // Verify history integrity
      const history = workflowEngine.getDelegationHistory();
      assert.strictEqual(history.length, numberOfDelegations);
      history.forEach(delegation => {
        assert.strictEqual(delegation.status, 'completed');
        assert.strictEqual(delegation.from, 'coordinator');
      });
    });
  });
});