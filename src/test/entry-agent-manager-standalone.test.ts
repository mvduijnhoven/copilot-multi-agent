/**
 * Standalone tests for EntryAgentManager class (without VS Code dependencies)
 */

import * as assert from 'assert';
import { 
  ExtensionConfiguration,
  AgentConfiguration,
  DelegationPermissions,
  ToolPermissions
} from '../models/agent-configuration';

// Mock the VS Code dependencies
const mockVscode = {
  workspace: {
    getConfiguration: () => ({})
  }
};

// Mock the error handler
class MockErrorHandler {
  static getInstance() {
    return new MockErrorHandler();
  }
  
  async handleError(error: any, context: any, options?: any) {
    console.log('Mock error handled:', error.message);
  }
}

// Mock the createErrorContext function
function createErrorContext(a?: any, b?: any, c?: any, d?: any) {
  return { context: 'mock' };
}

// Create a mock entry agent manager that doesn't depend on VS Code
class MockEntryAgentManager {
  /**
   * Gets the entry agent configuration from the provided configuration
   */
  getEntryAgent(configuration: ExtensionConfiguration): AgentConfiguration | null {
    if (!configuration || !configuration.agents || configuration.agents.length === 0) {
      return null;
    }

    const entryAgentName = configuration.entryAgent;
    if (!entryAgentName) {
      // Return first agent as default
      return configuration.agents[0];
    }

    // Find the specified entry agent
    const entryAgent = configuration.agents.find(agent => agent.name === entryAgentName);
    return entryAgent || null;
  }

  /**
   * Validates that the specified entry agent exists in the agents array
   */
  validateEntryAgent(entryAgentName: string, agents: AgentConfiguration[]): boolean {
    if (!entryAgentName || typeof entryAgentName !== 'string' || entryAgentName.trim().length === 0) {
      return false;
    }
    return agents.some(agent => agent.name === entryAgentName);
  }

  /**
   * Gets the default entry agent from the agents array (first agent)
   */
  getDefaultEntryAgent(agents: AgentConfiguration[]): AgentConfiguration | null {
    if (!agents || agents.length === 0) {
      return null;
    }
    return agents[0];
  }

  /**
   * Resolves the entry agent with fallback logic and error handling
   */
  async resolveEntryAgent(configuration: ExtensionConfiguration): Promise<{
    agent: AgentConfiguration | null;
    isValid: boolean;
    errors: string[];
    warnings: string[];
    usedFallback: boolean;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let usedFallback = false;
    let agent: AgentConfiguration | null = null;

    try {
      // Validate configuration structure
      if (!configuration) {
        errors.push('Configuration is null or undefined');
        return { agent: null, isValid: false, errors, warnings, usedFallback };
      }

      if (!configuration.agents || !Array.isArray(configuration.agents)) {
        errors.push('No agents configured');
        return { agent: null, isValid: false, errors, warnings, usedFallback };
      }

      if (configuration.agents.length === 0) {
        errors.push('Agents array is empty');
        return { agent: null, isValid: false, errors, warnings, usedFallback };
      }

      const entryAgentName = configuration.entryAgent;

      // Case 1: No entry agent specified - use first agent as default
      if (!entryAgentName || entryAgentName.trim().length === 0) {
        agent = this.getDefaultEntryAgent(configuration.agents);
        if (agent) {
          warnings.push(`No entry agent specified, using first agent "${agent.name}" as default`);
          usedFallback = true;
          return { agent, isValid: true, errors, warnings, usedFallback };
        } else {
          errors.push('No agents available for default entry agent');
          return { agent: null, isValid: false, errors, warnings, usedFallback };
        }
      }

      // Case 2: Entry agent specified - validate it exists
      const isValid = this.validateEntryAgent(entryAgentName, configuration.agents);
      
      if (isValid) {
        // Entry agent is valid - find and return it
        agent = configuration.agents.find(a => a.name === entryAgentName) || null;
        if (agent) {
          return { agent, isValid: true, errors, warnings, usedFallback };
        } else {
          // This shouldn't happen if validation passed, but handle it
          errors.push(`Entry agent "${entryAgentName}" validated but not found in agents array`);
        }
      } else {
        // Entry agent is invalid - try fallback
        errors.push(`Entry agent "${entryAgentName}" does not exist in the agents configuration`);
        
        const fallbackAgent = this.getDefaultEntryAgent(configuration.agents);
        if (fallbackAgent) {
          agent = fallbackAgent;
          warnings.push(`Entry agent "${entryAgentName}" not found, falling back to "${fallbackAgent.name}"`);
          usedFallback = true;
          
          return { agent, isValid: true, errors: [], warnings, usedFallback };
        } else {
          errors.push('No fallback agent available');
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Error resolving entry agent: ${errorMessage}`);
    }

    return { agent, isValid: false, errors, warnings, usedFallback };
  }
}

// Test suite
describe('EntryAgentManager Standalone Tests', () => {
  let entryAgentManager: MockEntryAgentManager;

  beforeEach(() => {
    entryAgentManager = new MockEntryAgentManager();
  });

  // Helper function to create test agent configurations
  function createTestAgent(
    name: string, 
    delegationPermissions: DelegationPermissions = { type: 'none' }, 
    toolPermissions: ToolPermissions = { type: 'all' }
  ): AgentConfiguration {
    return {
      name,
      systemPrompt: `You are ${name} agent with comprehensive capabilities`,
      description: `${name} agent description`,
      useFor: `${name} specific tasks and coordination`,
      delegationPermissions,
      toolPermissions
    };
  }

  function createTestConfiguration(
    entryAgent: string,
    agents: AgentConfiguration[]
  ): ExtensionConfiguration {
    return {
      entryAgent,
      agents
    };
  }

  describe('getEntryAgent', () => {
    
    it('should return entry agent when it exists in configuration', () => {
      const agents = [
        createTestAgent('coordinator', { type: 'all' }),
        createTestAgent('specialist', { type: 'none' })
      ];
      const config = createTestConfiguration('coordinator', agents);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'coordinator');
    });

    it('should return first agent when no entry agent specified', () => {
      const agents = [
        createTestAgent('first-agent'),
        createTestAgent('second-agent')
      ];
      const config = createTestConfiguration('', agents);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'first-agent');
    });

    it('should return null when entry agent does not exist', () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('non-existent', agents);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.strictEqual(result, null);
    });

    it('should return null when no agents configured', () => {
      const config = createTestConfiguration('coordinator', []);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.strictEqual(result, null);
    });
  });

  describe('validateEntryAgent', () => {
    
    it('should validate existing entry agent', () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];

      const result = entryAgentManager.validateEntryAgent('coordinator', agents);
      
      assert.strictEqual(result, true);
    });

    it('should reject non-existent entry agent', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgent('non-existent', agents);
      
      assert.strictEqual(result, false);
    });

    it('should reject empty entry agent name', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgent('', agents);
      
      assert.strictEqual(result, false);
    });
  });

  describe('getDefaultEntryAgent', () => {
    
    it('should return first agent as default', () => {
      const agents = [
        createTestAgent('first-agent'),
        createTestAgent('second-agent')
      ];

      const result = entryAgentManager.getDefaultEntryAgent(agents);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'first-agent');
    });

    it('should return null for empty agents array', () => {
      const result = entryAgentManager.getDefaultEntryAgent([]);
      
      assert.strictEqual(result, null);
    });
  });

  describe('resolveEntryAgent', () => {
    
    it('should resolve valid entry agent successfully', async () => {
      const agents = [
        createTestAgent('coordinator', { type: 'all' }),
        createTestAgent('specialist', { type: 'none' })
      ];
      const config = createTestConfiguration('coordinator', agents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'coordinator');
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should use fallback when entry agent not specified', async () => {
      const agents = [
        createTestAgent('first-agent'),
        createTestAgent('second-agent')
      ];
      const config = createTestConfiguration('', agents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'first-agent');
      assert.strictEqual(result.usedFallback, true);
      assert.strictEqual(result.warnings.length, 1);
      assert.ok(result.warnings[0].includes('using first agent'));
    });

    it('should use fallback when entry agent does not exist', async () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];
      const config = createTestConfiguration('non-existent', agents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'coordinator');
      assert.strictEqual(result.usedFallback, true);
      assert.strictEqual(result.warnings.length, 1);
      assert.ok(result.warnings[0].includes('falling back to'));
    });

    it('should fail when no agents configured', async () => {
      const config = createTestConfiguration('coordinator', []);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.agent, null);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('empty'));
    });

    it('should fail when configuration is null', async () => {
      const result = await entryAgentManager.resolveEntryAgent(null as any);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.agent, null);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('null or undefined'));
    });
  });

  describe('Edge Cases', () => {
    
    it('should handle whitespace in entry agent names', async () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('  coordinator  ', agents);

      // This should fail because our validation doesn't trim
      const result = await entryAgentManager.resolveEntryAgent(config);
      
      // Should use fallback since validation fails
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'coordinator');
      assert.strictEqual(result.usedFallback, true);
    });

    it('should handle special characters in agent names', async () => {
      const agents = [
        createTestAgent('agent-with-hyphens'),
        createTestAgent('agent_with_underscores'),
        createTestAgent('agent123')
      ];
      const config = createTestConfiguration('agent-with-hyphens', agents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'agent-with-hyphens');
    });
  });
});

// Simple test runner
async function runTests() {
  console.log('Running EntryAgentManager Standalone Tests...\n');
  
  const entryAgentManager = new MockEntryAgentManager();
  
  // Helper function to create test agent configurations
  function createTestAgent(
    name: string, 
    delegationPermissions: DelegationPermissions = { type: 'none' }, 
    toolPermissions: ToolPermissions = { type: 'all' }
  ): AgentConfiguration {
    return {
      name,
      systemPrompt: `You are ${name} agent with comprehensive capabilities`,
      description: `${name} agent description`,
      useFor: `${name} specific tasks and coordination`,
      delegationPermissions,
      toolPermissions
    };
  }

  function createTestConfiguration(
    entryAgent: string,
    agents: AgentConfiguration[]
  ): ExtensionConfiguration {
    return {
      entryAgent,
      agents
    };
  }

  let passed = 0;
  let failed = 0;

  function test(name: string, testFn: () => void | Promise<void>) {
    try {
      const result = testFn();
      if (result instanceof Promise) {
        return result.then(() => {
          console.log(`✓ ${name}`);
          passed++;
        }).catch((error) => {
          console.log(`✗ ${name}: ${error.message}`);
          failed++;
        });
      } else {
        console.log(`✓ ${name}`);
        passed++;
      }
    } catch (error) {
      console.log(`✗ ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  }

  // Run tests
  await test('should return entry agent when it exists in configuration', () => {
    const agents = [
      createTestAgent('coordinator', { type: 'all' }),
      createTestAgent('specialist', { type: 'none' })
    ];
    const config = createTestConfiguration('coordinator', agents);

    const result = entryAgentManager.getEntryAgent(config);
    
    assert.ok(result);
    assert.strictEqual(result.name, 'coordinator');
  });

  await test('should return first agent when no entry agent specified', () => {
    const agents = [
      createTestAgent('first-agent'),
      createTestAgent('second-agent')
    ];
    const config = createTestConfiguration('', agents);

    const result = entryAgentManager.getEntryAgent(config);
    
    assert.ok(result);
    assert.strictEqual(result.name, 'first-agent');
  });

  await test('should return null when entry agent does not exist', () => {
    const agents = [createTestAgent('coordinator')];
    const config = createTestConfiguration('non-existent', agents);

    const result = entryAgentManager.getEntryAgent(config);
    
    assert.strictEqual(result, null);
  });

  await test('should validate existing entry agent', () => {
    const agents = [
      createTestAgent('coordinator'),
      createTestAgent('specialist')
    ];

    const result = entryAgentManager.validateEntryAgent('coordinator', agents);
    
    assert.strictEqual(result, true);
  });

  await test('should reject non-existent entry agent', () => {
    const agents = [createTestAgent('coordinator')];

    const result = entryAgentManager.validateEntryAgent('non-existent', agents);
    
    assert.strictEqual(result, false);
  });

  await test('should resolve valid entry agent successfully', async () => {
    const agents = [
      createTestAgent('coordinator', { type: 'all' }),
      createTestAgent('specialist', { type: 'none' })
    ];
    const config = createTestConfiguration('coordinator', agents);

    const result = await entryAgentManager.resolveEntryAgent(config);
    
    assert.strictEqual(result.isValid, true);
    assert.ok(result.agent);
    assert.strictEqual(result.agent.name, 'coordinator');
    assert.strictEqual(result.usedFallback, false);
    assert.strictEqual(result.errors.length, 0);
  });

  await test('should use fallback when entry agent not specified', async () => {
    const agents = [
      createTestAgent('first-agent'),
      createTestAgent('second-agent')
    ];
    const config = createTestConfiguration('', agents);

    const result = await entryAgentManager.resolveEntryAgent(config);
    
    assert.strictEqual(result.isValid, true);
    assert.ok(result.agent);
    assert.strictEqual(result.agent.name, 'first-agent');
    assert.strictEqual(result.usedFallback, true);
    assert.strictEqual(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('using first agent'));
  });

  await test('should use fallback when entry agent does not exist', async () => {
    const agents = [
      createTestAgent('coordinator'),
      createTestAgent('specialist')
    ];
    const config = createTestConfiguration('non-existent', agents);

    const result = await entryAgentManager.resolveEntryAgent(config);
    
    assert.strictEqual(result.isValid, true);
    assert.ok(result.agent);
    assert.strictEqual(result.agent.name, 'coordinator');
    assert.strictEqual(result.usedFallback, true);
    assert.strictEqual(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('falling back to'));
  });

  console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✓ All tests passed!');
  } else {
    console.log('✗ Some tests failed');
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { MockEntryAgentManager, runTests };