/**
 * Tests for entry agent configuration validation
 */

import * as assert from 'assert';
import { 
  ExtensionConfiguration,
  AgentConfiguration,
  ConfigurationValidator,
  DEFAULT_EXTENSION_CONFIG,
  DelegationPermissions,
  ToolPermissions
} from '../models/agent-configuration';
import { EnhancedConfigurationValidator } from '../services/configuration-validator';

suite('Entry Agent Validation', () => {
  
  // Helper function to create test agent configurations
  function createTestAgent(
    name: string, 
    delegationPermissions: DelegationPermissions = { type: 'none' }, 
    toolPermissions: ToolPermissions = { type: 'all' }
  ): AgentConfiguration {
    return {
      name,
      systemPrompt: `You are ${name} agent`,
      description: `${name} description`,
      useFor: `${name} tasks`,
      delegationPermissions,
      toolPermissions
    };
  }
  
  suite('Entry Agent Existence Validation', () => {
    
    test('should validate entry agent exists in agents array', () => {
      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [createTestAgent('coordinator', { type: 'all' }, { type: 'all' })]
      };

      const result = ConfigurationValidator.validateEntryAgent(config.entryAgent, config.agents);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should reject entry agent that does not exist in agents array', () => {
      const config: ExtensionConfiguration = {
        entryAgent: 'non-existent-agent',
        agents: [createTestAgent('coordinator')]
      };

      const result = ConfigurationValidator.validateEntryAgent(config.entryAgent, config.agents);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('does not exist in the agents configuration'));
    });

    test('should reject empty entry agent name', () => {
      const config: ExtensionConfiguration = {
        entryAgent: '',
        agents: [createTestAgent('coordinator')]
      };

      const result = ConfigurationValidator.validateEntryAgent(config.entryAgent, config.agents);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('cannot be empty'));
    });

    test('should reject non-string entry agent', () => {
      const agents = [createTestAgent('coordinator')];

      const result = ConfigurationValidator.validateEntryAgent(123 as any, agents);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('must be a non-empty string'));
    });
  });

  suite('Entry Agent Fallback Logic', () => {
    
    test('should provide default entry agent when none specified', () => {
      const agents: AgentConfiguration[] = [
        createTestAgent('first-agent', { type: 'all' }),
        createTestAgent('second-agent', { type: 'none' })
      ];

      const result = ConfigurationValidator.validateAndGetEntryAgent(undefined, agents);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.entryAgent, 'first-agent');
      assert.strictEqual(result.errors.length, 0);
    });

    test('should provide default entry agent when empty string specified', () => {
      const agents: AgentConfiguration[] = [createTestAgent('default-agent')];

      const result = ConfigurationValidator.validateAndGetEntryAgent('', agents);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.entryAgent, 'default-agent');
      assert.strictEqual(result.errors.length, 0);
    });

    test('should return error when no agents configured', () => {
      const result = ConfigurationValidator.validateAndGetEntryAgent('any-agent', []);
      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.entryAgent, undefined);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].includes('no agents configured'));
    });

    test('should validate specified entry agent exists', () => {
      const agents: AgentConfiguration[] = [
        createTestAgent('agent1'),
        createTestAgent('agent2')
      ];

      const result = ConfigurationValidator.validateAndGetEntryAgent('agent2', agents);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.entryAgent, 'agent2');
      assert.strictEqual(result.errors.length, 0);
    });
  });

  suite('Extension Configuration Validation with Entry Agent', () => {
    
    test('should validate complete configuration with entry agent', () => {
      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          createTestAgent('coordinator', { type: 'all' }, { type: 'specific', tools: ['delegateWork', 'reportOut'] }),
          createTestAgent('code-reviewer', { type: 'none' }, { type: 'specific', tools: ['reportOut'] })
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should reject configuration with invalid entry agent', () => {
      const config = {
        entryAgent: 'non-existent-agent',
        agents: [createTestAgent('coordinator')]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('does not exist in the agents configuration')));
    });

    test('should reject configuration with empty agents array', () => {
      const config = {
        entryAgent: 'coordinator',
        agents: []
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('At least one agent must be configured')));
    });

    test('should validate configuration without explicit entry agent', () => {
      const config = {
        agents: [createTestAgent('default-agent')]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  suite('Enhanced Configuration Validator with Entry Agent', () => {
    
    test('should validate entry agent with enhanced context', () => {
      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [createTestAgent('coordinator')]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config, 'test-config');
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should provide detailed error messages for entry agent validation', () => {
      const config = {
        entryAgent: 'missing-agent',
        agents: [createTestAgent('coordinator')]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config, 'test-config', { allowDefaults: false });
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => 
        error.includes('test-config.entryAgent') && 
        error.includes('missing-agent') &&
        error.includes('does not exist')
      ));
    });

    test('should handle entry agent validation with defaults enabled', () => {
      const config = {
        agents: [createTestAgent('default-agent')]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(
        config, 
        'test-config',
        { strict: false, allowDefaults: true, migrateConfig: false }
      );
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  suite('Migration from Old Configuration Structure', () => {
    
    test('should migrate from coordinator/customAgents to agents structure', () => {
      const oldConfig = {
        coordinator: createTestAgent('coordinator', { type: 'all' }),
        customAgents: [createTestAgent('specialist', { type: 'none' }, { type: 'specific', tools: ['reportOut'] })]
      };

      const migrationResult = EnhancedConfigurationValidator.migrateConfiguration(oldConfig);
      assert.strictEqual(migrationResult.migrated, true);
      assert.ok(migrationResult.changes.some(change => 
        change.includes('unified agents structure')
      ));
      
      const migratedConfig = migrationResult.config;
      assert.strictEqual(migratedConfig.entryAgent, 'coordinator');
      assert.strictEqual(migratedConfig.agents.length, 2);
      assert.strictEqual(migratedConfig.agents[0].name, 'coordinator');
      assert.strictEqual(migratedConfig.agents[1].name, 'specialist');
      assert.strictEqual((migratedConfig as any).coordinator, undefined);
      assert.strictEqual((migratedConfig as any).customAgents, undefined);
    });

    test('should set entry agent to first agent when migrating', () => {
      const oldConfig = {
        customAgents: [createTestAgent('first-agent')]
      };

      const migrationResult = EnhancedConfigurationValidator.migrateConfiguration(oldConfig);
      assert.strictEqual(migrationResult.migrated, true);
      
      const migratedConfig = migrationResult.config;
      assert.strictEqual(migratedConfig.entryAgent, 'first-agent');
      assert.strictEqual(migratedConfig.agents.length, 1);
      assert.strictEqual(migratedConfig.agents[0].name, 'first-agent');
    });

    test('should preserve existing entry agent during migration', () => {
      const oldConfig = {
        entryAgent: 'custom-entry',
        coordinator: createTestAgent('coordinator'),
        customAgents: [createTestAgent('custom-entry', { type: 'specific', agents: ['coordinator'] })]
      };

      const migrationResult = EnhancedConfigurationValidator.migrateConfiguration(oldConfig);
      assert.strictEqual(migrationResult.migrated, true);
      
      const migratedConfig = migrationResult.config;
      assert.strictEqual(migratedConfig.entryAgent, 'custom-entry');
      assert.strictEqual(migratedConfig.agents.length, 2);
    });
  });

  suite('Error Messages and Fallback Logic', () => {
    
    test('should provide clear error messages for entry agent validation failures', () => {
      const testCases = [
        {
          entryAgent: null,
          expectedError: 'must be a non-empty string'
        },
        {
          entryAgent: undefined,
          expectedError: 'must be a non-empty string'
        },
        {
          entryAgent: 123,
          expectedError: 'must be a non-empty string'
        },
        {
          entryAgent: '',
          expectedError: 'cannot be empty'
        },
        {
          entryAgent: '   ',
          expectedError: 'cannot be empty'
        }
      ];

      const agents: AgentConfiguration[] = [createTestAgent('test-agent')];

      testCases.forEach(({ entryAgent, expectedError }) => {
        const result = ConfigurationValidator.validateEntryAgent(entryAgent as any, agents);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error => error.includes(expectedError)), 
          `Expected error containing "${expectedError}" for entry agent: ${entryAgent}`);
      });
    });

    test('should handle edge cases in entry agent fallback logic', () => {
      // Test with empty agents array
      const emptyResult = ConfigurationValidator.getDefaultEntryAgent([]);
      assert.strictEqual(emptyResult, null);

      // Test with single agent
      const singleAgent: AgentConfiguration[] = [createTestAgent('only-agent')];
      const singleResult = ConfigurationValidator.getDefaultEntryAgent(singleAgent);
      assert.strictEqual(singleResult, 'only-agent');

      // Test with multiple agents (should return first)
      const multipleAgents: AgentConfiguration[] = [
        createTestAgent('first-agent'),
        createTestAgent('second-agent')
      ];
      const multipleResult = ConfigurationValidator.getDefaultEntryAgent(multipleAgents);
      assert.strictEqual(multipleResult, 'first-agent');
    });
  });
});