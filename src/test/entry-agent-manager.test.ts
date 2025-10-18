/**
 * Tests for EntryAgentManager class
 */

import * as assert from 'assert';
import { 
  ExtensionConfiguration,
  AgentConfiguration,
  DelegationPermissions,
  ToolPermissions
} from '../models/agent-configuration';
import { EntryAgentManager, IEntryAgentManager } from '../services/entry-agent-manager';

suite('EntryAgentManager', () => {
  let entryAgentManager: IEntryAgentManager;

  setup(() => {
    entryAgentManager = new EntryAgentManager();
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

  suite('getEntryAgent', () => {
    
    test('should return entry agent when it exists in configuration', () => {
      const agents = [
        createTestAgent('coordinator', { type: 'all' }),
        createTestAgent('specialist', { type: 'none' })
      ];
      const config = createTestConfiguration('coordinator', agents);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'coordinator');
    });

    test('should return first agent when no entry agent specified', () => {
      const agents = [
        createTestAgent('first-agent'),
        createTestAgent('second-agent')
      ];
      const config = createTestConfiguration('', agents);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'first-agent');
    });

    test('should return null when entry agent does not exist', () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('non-existent', agents);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.strictEqual(result, null);
    });

    test('should return null when no agents configured', () => {
      const config = createTestConfiguration('coordinator', []);

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.strictEqual(result, null);
    });

    test('should return null when configuration is null', () => {
      const result = entryAgentManager.getEntryAgent(null as any);
      
      assert.strictEqual(result, null);
    });

    test('should return null when agents array is null', () => {
      const config = { entryAgent: 'coordinator', agents: null as any };

      const result = entryAgentManager.getEntryAgent(config);
      
      assert.strictEqual(result, null);
    });
  });

  suite('validateEntryAgent', () => {
    
    test('should validate existing entry agent', () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];

      const result = entryAgentManager.validateEntryAgent('coordinator', agents);
      
      assert.strictEqual(result, true);
    });

    test('should reject non-existent entry agent', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgent('non-existent', agents);
      
      assert.strictEqual(result, false);
    });

    test('should reject empty entry agent name', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgent('', agents);
      
      assert.strictEqual(result, false);
    });

    test('should reject null entry agent name', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgent(null as any, agents);
      
      assert.strictEqual(result, false);
    });

    test('should handle empty agents array', () => {
      const result = entryAgentManager.validateEntryAgent('coordinator', []);
      
      assert.strictEqual(result, false);
    });
  });

  suite('getDefaultEntryAgent', () => {
    
    test('should return first agent as default', () => {
      const agents = [
        createTestAgent('first-agent'),
        createTestAgent('second-agent')
      ];

      const result = entryAgentManager.getDefaultEntryAgent(agents);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'first-agent');
    });

    test('should return null for empty agents array', () => {
      const result = entryAgentManager.getDefaultEntryAgent([]);
      
      assert.strictEqual(result, null);
    });

    test('should return null for null agents array', () => {
      const result = entryAgentManager.getDefaultEntryAgent(null as any);
      
      assert.strictEqual(result, null);
    });

    test('should handle single agent array', () => {
      const agents = [createTestAgent('only-agent')];

      const result = entryAgentManager.getDefaultEntryAgent(agents);
      
      assert.ok(result);
      assert.strictEqual(result.name, 'only-agent');
    });
  });

  suite('resolveEntryAgent', () => {
    
    test('should resolve valid entry agent successfully', async () => {
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

    test('should use fallback when entry agent not specified', async () => {
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

    test('should use fallback when entry agent does not exist', async () => {
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

    test('should fail when no agents configured', async () => {
      const config = createTestConfiguration('coordinator', []);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.agent, null);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('empty'));
    });

    test('should fail when configuration is null', async () => {
      const result = await entryAgentManager.resolveEntryAgent(null as any);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.agent, null);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('null or undefined'));
    });

    test('should fail when agents array is not an array', async () => {
      const config = { entryAgent: 'coordinator', agents: 'not-an-array' as any };

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.agent, null);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('No agents configured'));
    });

    test('should handle undefined entry agent gracefully', async () => {
      const agents = [createTestAgent('default-agent')];
      const config = { entryAgent: undefined as any, agents };

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'default-agent');
      assert.strictEqual(result.usedFallback, true);
    });
  });

  suite('validateEntryAgentWithDetails', () => {
    
    test('should provide detailed validation for valid entry agent', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgentWithDetails('coordinator', agents);
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should provide detailed errors for invalid entry agent', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgentWithDetails('non-existent', agents);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('does not exist'));
    });

    test('should provide detailed errors for empty entry agent name', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.validateEntryAgentWithDetails('', agents);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('cannot be empty'));
    });
  });

  suite('getEntryAgentName', () => {
    
    test('should return entry agent name when agent exists', () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('coordinator', agents);

      const result = entryAgentManager.getEntryAgentName(config);
      
      assert.strictEqual(result, 'coordinator');
    });

    test('should return null when entry agent does not exist', () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('non-existent', agents);

      const result = entryAgentManager.getEntryAgentName(config);
      
      assert.strictEqual(result, null);
    });

    test('should return first agent name when no entry agent specified', () => {
      const agents = [createTestAgent('first-agent')];
      const config = createTestConfiguration('', agents);

      const result = entryAgentManager.getEntryAgentName(config);
      
      assert.strictEqual(result, 'first-agent');
    });
  });

  suite('canServeAsEntryAgent', () => {
    
    test('should return true for existing agent', () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];

      const result = entryAgentManager.canServeAsEntryAgent('coordinator', agents);
      
      assert.strictEqual(result, true);
    });

    test('should return false for non-existent agent', () => {
      const agents = [createTestAgent('coordinator')];

      const result = entryAgentManager.canServeAsEntryAgent('non-existent', agents);
      
      assert.strictEqual(result, false);
    });

    test('should return false for empty agents array', () => {
      const result = entryAgentManager.canServeAsEntryAgent('coordinator', []);
      
      assert.strictEqual(result, false);
    });
  });

  suite('getEntryAgentCandidates', () => {
    
    test('should return all agents as candidates', () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];
      const config = createTestConfiguration('coordinator', agents);

      const result = entryAgentManager.getEntryAgentCandidates(config);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, 'coordinator');
      assert.strictEqual(result[1].name, 'specialist');
    });

    test('should return empty array for null configuration', () => {
      const result = entryAgentManager.getEntryAgentCandidates(null as any);
      
      assert.strictEqual(result.length, 0);
    });

    test('should return empty array for configuration without agents', () => {
      const config = { entryAgent: 'coordinator', agents: null as any };

      const result = entryAgentManager.getEntryAgentCandidates(config);
      
      assert.strictEqual(result.length, 0);
    });

    test('should return copy of agents array', () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('coordinator', agents);

      const result = entryAgentManager.getEntryAgentCandidates(config);
      
      // Modify the result to ensure it's a copy
      result.push(createTestAgent('new-agent'));
      assert.strictEqual(config.agents.length, 1); // Original should be unchanged
    });
  });

  suite('validateAgentSuitabilityAsEntryAgent', () => {
    
    test('should validate suitable agent', () => {
      const agent = createTestAgent('coordinator', { type: 'all' }, { type: 'all' });

      const result = entryAgentManager.validateAgentSuitabilityAsEntryAgent(agent);
      
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should reject null agent', () => {
      const result = entryAgentManager.validateAgentSuitabilityAsEntryAgent(null as any);
      
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('null or undefined'));
    });

    test('should warn about short system prompt', () => {
      const agent = createTestAgent('coordinator');
      agent.systemPrompt = 'Short';

      const result = entryAgentManager.validateAgentSuitabilityAsEntryAgent(agent);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('meaningful system prompt')));
    });

    test('should warn about missing description', () => {
      const agent = createTestAgent('coordinator');
      agent.description = '';

      const result = entryAgentManager.validateAgentSuitabilityAsEntryAgent(agent);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('should have a description')));
    });

    test('should warn about missing useFor', () => {
      const agent = createTestAgent('coordinator');
      agent.useFor = '';

      const result = entryAgentManager.validateAgentSuitabilityAsEntryAgent(agent);
      
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('useFor')));
    });
  });

  suite('updateEntryAgent', () => {
    
    test('should update entry agent successfully', async () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];
      const config = createTestConfiguration('coordinator', agents);

      const result = await entryAgentManager.updateEntryAgent(config, 'specialist');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(config.entryAgent, 'specialist');
      assert.strictEqual(result.warnings.length, 1);
      assert.ok(result.warnings[0].includes('changed from'));
    });

    test('should reject non-existent agent', async () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('coordinator', agents);

      const result = await entryAgentManager.updateEntryAgent(config, 'non-existent');
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('does not exist'));
      assert.strictEqual(config.entryAgent, 'coordinator'); // Should remain unchanged
    });

    test('should provide warnings for unsuitable agent', async () => {
      const unsuitableAgent = createTestAgent('unsuitable');
      unsuitableAgent.description = '';
      unsuitableAgent.useFor = '';
      
      const agents = [createTestAgent('coordinator'), unsuitableAgent];
      const config = createTestConfiguration('coordinator', agents);

      const result = await entryAgentManager.updateEntryAgent(config, 'unsuitable');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(config.entryAgent, 'unsuitable');
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(warning => warning.includes('Warning:')));
    });

    test('should handle updating to same agent', async () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('coordinator', agents);

      const result = await entryAgentManager.updateEntryAgent(config, 'coordinator');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(config.entryAgent, 'coordinator');
      // Should not have "changed from" warning since it's the same
      assert.ok(!result.warnings.some(warning => warning.includes('changed from')));
    });
  });

  suite('getEntryAgentStatus', () => {
    
    test('should return complete status for valid configuration', async () => {
      const agents = [
        createTestAgent('coordinator'),
        createTestAgent('specialist')
      ];
      const config = createTestConfiguration('coordinator', agents);

      const result = await entryAgentManager.getEntryAgentStatus(config);
      
      assert.strictEqual(result.configured, 'coordinator');
      assert.strictEqual(result.resolved, 'coordinator');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.availableAgents.length, 2);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should show fallback status when entry agent not found', async () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('non-existent', agents);

      const result = await entryAgentManager.getEntryAgentStatus(config);
      
      assert.strictEqual(result.configured, 'non-existent');
      assert.strictEqual(result.resolved, 'coordinator');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.usedFallback, true);
      assert.strictEqual(result.availableAgents.length, 1);
      assert.strictEqual(result.warnings.length, 1);
    });

    test('should show error status for invalid configuration', async () => {
      const config = createTestConfiguration('coordinator', []);

      const result = await entryAgentManager.getEntryAgentStatus(config);
      
      assert.strictEqual(result.configured, 'coordinator');
      assert.strictEqual(result.resolved, null);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.availableAgents.length, 0);
      assert.strictEqual(result.errors.length, 1);
    });

    test('should handle null configuration', async () => {
      const result = await entryAgentManager.getEntryAgentStatus(null as any);
      
      assert.strictEqual(result.configured, null);
      assert.strictEqual(result.resolved, null);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.usedFallback, false);
      assert.strictEqual(result.availableAgents.length, 0);
      assert.strictEqual(result.errors.length, 1);
    });
  });

  suite('Edge Cases and Error Handling', () => {
    
    test('should handle malformed agent configurations gracefully', async () => {
      const malformedAgents = [
        { name: 'valid-agent', systemPrompt: 'Valid prompt', description: 'Valid', useFor: 'Valid', delegationPermissions: { type: 'none' }, toolPermissions: { type: 'all' } },
        { name: null, systemPrompt: '', description: '', useFor: '', delegationPermissions: null, toolPermissions: null }
      ] as any;
      const config = createTestConfiguration('valid-agent', malformedAgents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      // Should still work with the valid agent
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'valid-agent');
    });

    test('should handle circular references in configuration', async () => {
      const circularConfig: any = { entryAgent: 'coordinator', agents: [] };
      circularConfig.agents = [
        { ...createTestAgent('coordinator'), config: circularConfig }
      ];

      const result = await entryAgentManager.resolveEntryAgent(circularConfig);
      
      // Should handle gracefully without infinite loops
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
    });

    test('should handle very large agent arrays', async () => {
      const manyAgents = Array.from({ length: 100 }, (_, i) => 
        createTestAgent(`agent-${i}`)
      );
      const config = createTestConfiguration('agent-50', manyAgents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'agent-50');
    });

    test('should handle special characters in agent names', async () => {
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

    test('should handle whitespace in entry agent names', async () => {
      const agents = [createTestAgent('coordinator')];
      const config = createTestConfiguration('  coordinator  ', agents);

      const result = await entryAgentManager.resolveEntryAgent(config);
      
      // Should handle trimming and still find the agent
      assert.strictEqual(result.isValid, true);
      assert.ok(result.agent);
      assert.strictEqual(result.agent.name, 'coordinator');
    });
  });
});