import * as assert from 'assert';
import { 
  ConfigurationValidator,
  ExtensionConfiguration, 
  AgentConfiguration, 
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_CONFIG
} from '../models/agent-configuration';

// Note: These tests focus on the validation logic and configuration structure.
// Full integration tests with VS Code APIs would require the VS Code test environment.

suite('Configuration Manager Logic Test Suite', () => {

  suite('Configuration Structure Validation', () => {
    test('should validate default extension configuration', () => {
      const validation = ConfigurationValidator.validateExtensionConfiguration(DEFAULT_EXTENSION_CONFIG);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should validate configuration with custom agents', () => {
      const configWithAgents: ExtensionConfiguration = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: [
          {
            name: 'code-reviewer',
            systemPrompt: 'You are a code reviewer',
            description: 'Reviews code for quality',
            useFor: 'Code review',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'specific', tools: ['reportOut'] }
          },
          {
            name: 'tester',
            systemPrompt: 'You are a testing specialist',
            description: 'Creates and runs tests',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['code-reviewer'] },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithAgents);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should reject configuration with invalid delegation references', () => {
      const configWithInvalidRefs: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'specific', agents: ['non-existent-agent'] }
        },
        customAgents: []
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithInvalidRefs);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('References non-existent agent "non-existent-agent"')));
    });

    test('should reject configuration with duplicate agent names', () => {
      const configWithDuplicates: ExtensionConfiguration = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: [
          {
            name: 'duplicate',
            systemPrompt: 'First agent',
            description: 'First',
            useFor: 'First',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'duplicate',
            systemPrompt: 'Second agent',
            description: 'Second',
            useFor: 'Second',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithDuplicates);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('Duplicate agent name')));
    });
  });

  suite('Configuration Transformation Logic', () => {
    test('should handle configuration with missing optional fields', () => {
      const partialConfig = {
        coordinator: {
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Test use',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        },
        customAgents: []
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(partialConfig);
      assert.strictEqual(validation.isValid, true);
    });

    test('should validate complex delegation chains', () => {
      const complexConfig: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'specific', agents: ['agent1', 'agent2'] }
        },
        customAgents: [
          {
            name: 'agent1',
            systemPrompt: 'Agent 1',
            description: 'First agent',
            useFor: 'First tasks',
            delegationPermissions: { type: 'specific', agents: ['agent2', 'agent3'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent2',
            systemPrompt: 'Agent 2',
            description: 'Second agent',
            useFor: 'Second tasks',
            delegationPermissions: { type: 'specific', agents: ['agent3'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent3',
            systemPrompt: 'Agent 3',
            description: 'Third agent',
            useFor: 'Third tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'specific', tools: ['reportOut'] }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(complexConfig);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should validate tool permission configurations', () => {
      const configWithToolPerms: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut', 'customTool'] }
        },
        customAgents: [
          {
            name: 'restricted-agent',
            systemPrompt: 'Restricted agent',
            description: 'Has limited tool access',
            useFor: 'Restricted tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'specific', tools: ['reportOut'] }
          },
          {
            name: 'full-access-agent',
            systemPrompt: 'Full access agent',
            description: 'Has all tool access',
            useFor: 'All tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'no-tools-agent',
            systemPrompt: 'No tools agent',
            description: 'Has no tool access',
            useFor: 'Basic tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'none' }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithToolPerms);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });
  });

  suite('Configuration Error Handling', () => {
    test('should provide detailed error messages for invalid configurations', () => {
      const invalidConfig = {
        coordinator: {
          name: 'wrong-name',
          systemPrompt: '',
          description: '',
          useFor: '',
          delegationPermissions: { type: 'invalid' },
          toolPermissions: { type: 'invalid' }
        },
        customAgents: [
          {
            name: '',
            systemPrompt: '',
            description: '',
            useFor: '',
            delegationPermissions: { type: 'specific' }, // Missing agents array
            toolPermissions: { type: 'specific' } // Missing tools array
          }
        ]
      } as any;

      const validation = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);
      assert.strictEqual(validation.isValid, false);
      
      // Should have multiple specific error messages
      assert.ok(validation.errors.length > 5);
      assert.ok(validation.errors.some(error => error.includes('Coordinator name must be "coordinator"')));
      assert.ok(validation.errors.some(error => error.includes('Agent name cannot be empty')));
      assert.ok(validation.errors.some(error => error.includes('must include an agents array')));
      assert.ok(validation.errors.some(error => error.includes('must include a tools array')));
    });

    test('should handle null and undefined configurations gracefully', () => {
      const nullValidation = ConfigurationValidator.validateExtensionConfiguration(null as any);
      assert.strictEqual(nullValidation.isValid, false);
      assert.ok(nullValidation.errors.some(error => error.includes('must be an object')));

      const undefinedValidation = ConfigurationValidator.validateExtensionConfiguration(undefined as any);
      assert.strictEqual(undefinedValidation.isValid, false);
      assert.ok(undefinedValidation.errors.some(error => error.includes('must be an object')));
    });
  });

  suite('Default Configuration Properties', () => {
    test('should have correct default coordinator configuration', () => {
      assert.strictEqual(DEFAULT_COORDINATOR_CONFIG.name, 'coordinator');
      assert.ok(DEFAULT_COORDINATOR_CONFIG.systemPrompt.length > 0);
      assert.ok(DEFAULT_COORDINATOR_CONFIG.description.length > 0);
      assert.ok(DEFAULT_COORDINATOR_CONFIG.useFor.length > 0);
      assert.strictEqual(DEFAULT_COORDINATOR_CONFIG.delegationPermissions.type, 'all');
      assert.strictEqual(DEFAULT_COORDINATOR_CONFIG.toolPermissions.type, 'specific');
      
      if (DEFAULT_COORDINATOR_CONFIG.toolPermissions.type === 'specific') {
        assert.ok(Array.isArray(DEFAULT_COORDINATOR_CONFIG.toolPermissions.tools));
        assert.ok(DEFAULT_COORDINATOR_CONFIG.toolPermissions.tools.includes('delegateWork'));
        assert.ok(DEFAULT_COORDINATOR_CONFIG.toolPermissions.tools.includes('reportOut'));
      }
    });

    test('should have correct default extension configuration', () => {
      assert.deepStrictEqual(DEFAULT_EXTENSION_CONFIG.coordinator, DEFAULT_COORDINATOR_CONFIG);
      assert.ok(Array.isArray(DEFAULT_EXTENSION_CONFIG.customAgents));
      assert.strictEqual(DEFAULT_EXTENSION_CONFIG.customAgents.length, 0);
    });

    test('should create independent copies of default configuration', () => {
      const config1 = JSON.parse(JSON.stringify(DEFAULT_EXTENSION_CONFIG));
      const config2 = JSON.parse(JSON.stringify(DEFAULT_EXTENSION_CONFIG));
      
      // Modify one copy
      config1.coordinator.systemPrompt = 'Modified prompt';
      
      // Other copy should be unchanged
      assert.notStrictEqual(config1.coordinator.systemPrompt, config2.coordinator.systemPrompt);
      assert.strictEqual(config2.coordinator.systemPrompt, DEFAULT_COORDINATOR_CONFIG.systemPrompt);
    });
  });
});