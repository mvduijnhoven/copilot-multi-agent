/**
 * Unit tests for enhanced configuration validation
 */

import * as assert from 'assert';
import {
  EnhancedConfigurationValidator,
  ValidationOptions,
  validateConfiguration
} from '../services/configuration-validator';
import {
  ExtensionConfiguration,
  AgentConfiguration,
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_CONFIG
} from '../models';

suite('Enhanced Configuration Validation Tests', () => {

  suite('Basic Validation', () => {
    test('should validate valid configuration', () => {
      const validConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          {
            name: 'coordinator',
            systemPrompt: 'You are a coordinator agent responsible for task orchestration.',
            description: 'Coordinates work between agents',
            useFor: 'Task orchestration and delegation',
            delegationPermissions: { type: 'all' },
            toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
          },
          {
            name: 'code-reviewer',
            systemPrompt: 'You are a code review specialist focused on quality and best practices.',
            description: 'Specialized in code review',
            useFor: 'Code review and quality analysis',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'specific', tools: ['reportOut'] }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(validConfig);
      assert.strictEqual(result.isValid, true, `Validation should pass: ${result.errors.join(', ')}`);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should reject null or undefined configuration', () => {
      const nullResult = EnhancedConfigurationValidator.validateWithContext(null);
      assert.strictEqual(nullResult.isValid, false);
      assert.ok(nullResult.errors.some(error => error.includes('must be a valid configuration object')));

      const undefinedResult = EnhancedConfigurationValidator.validateWithContext(undefined);
      assert.strictEqual(undefinedResult.isValid, false);
      assert.ok(undefinedResult.errors.some(error => error.includes('must be a valid configuration object')));
    });

    test('should reject non-object configuration', () => {
      const stringResult = EnhancedConfigurationValidator.validateWithContext('invalid');
      assert.strictEqual(stringResult.isValid, false);
      assert.ok(stringResult.errors.some(error => error.includes('must be a valid configuration object')));

      const numberResult = EnhancedConfigurationValidator.validateWithContext(123);
      assert.strictEqual(numberResult.isValid, false);
      assert.ok(numberResult.errors.some(error => error.includes('must be a valid configuration object')));
    });
  });

  suite('Coordinator Validation', () => {
    test('should validate agent name format', () => {
      const config = {
        agents: [{
          name: 'invalid name with spaces',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        }]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Can only contain letters, numbers, hyphens, and underscores')));
    });

    test('should validate coordinator required fields', () => {
      const config = {
        agents: [{
          name: 'coordinator'
          // Missing required fields
        }]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('System prompt is required')));
      assert.ok(result.errors.some(error => error.includes('Description is required')));
      assert.ok(result.errors.some(error => error.includes('Use for description is required')));
    });

    test('should validate coordinator system prompt length', () => {
      const shortPrompt = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Short',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        }]
      };

      const shortResult = EnhancedConfigurationValidator.validateWithContext(shortPrompt);
      assert.strictEqual(shortResult.isValid, false);
      assert.ok(shortResult.errors.some(error => error.includes('Too short')));

      const longPrompt = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'x'.repeat(5001),
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        }]
      };

      const longResult = EnhancedConfigurationValidator.validateWithContext(longPrompt);
      assert.strictEqual(longResult.isValid, false);
      assert.ok(longResult.errors.some(error => error.includes('Too long')));
    });

    test('should use defaults for missing coordinator when allowDefaults is true', () => {
      const config = {
        agents: []
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config, 'test', { allowDefaults: true });
      assert.strictEqual(result.isValid, true);
    });
  });

  suite('Custom Agents Validation', () => {
    test('should validate agent name uniqueness', () => {
      const config = {
        entryAgent: 'coordinator',
        agents: [
          DEFAULT_COORDINATOR_CONFIG,
          {
            name: 'test-agent',
            systemPrompt: 'Test prompt for agent 1',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'test-agent', // Duplicate name
            systemPrompt: 'Test prompt for agent 2',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Duplicate agent name')));
    });

    test('should reject coordinator name for custom agents', () => {
      const config = {
        agents: [
          DEFAULT_COORDINATOR_CONFIG,
          {
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Duplicate agent name')));
    });

    test('should validate agent name format', () => {
      const invalidNames = [
        'agent with spaces',
        'agent@special',
        'agent.with.dots',
        '',
        'x'.repeat(51)
      ];

      invalidNames.forEach(invalidName => {
        const config = {
          agents: [
            DEFAULT_COORDINATOR_CONFIG,
            {
              name: invalidName,
              systemPrompt: 'Test prompt',
              description: 'Test description',
              useFor: 'Testing',
              delegationPermissions: { type: 'none' },
              toolPermissions: { type: 'all' }
            }
          ]
        };

        const result = EnhancedConfigurationValidator.validateWithContext(config);
        assert.strictEqual(result.isValid, false, `Should reject invalid name: "${invalidName}"`);
      });
    });

    test('should validate agent count limits', () => {
      const tooManyAgents = Array.from({ length: 21 }, (_, i) => ({
        name: `agent-${i}`,
        systemPrompt: 'Test prompt',
        description: 'Test description',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      }));

      const config = {
        agents: [DEFAULT_COORDINATOR_CONFIG, ...tooManyAgents]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Too many agents')));
    });
  });

  suite('Permission Validation', () => {
    test('should validate delegation permissions structure', () => {
      const invalidPermissions = [
        'string',
        123,
        { type: 'invalid' },
        { type: 'specific' }, // Missing agents array
        { type: 'specific', agents: 'not-array' },
        { type: 'specific', agents: [] }, // Empty array
        { type: 'specific', agents: ['', 'valid-agent'] } // Empty string in array
      ];

      invalidPermissions.forEach((permissions, index) => {
        const config = {
          agents: [{
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: permissions,
            toolPermissions: { type: 'all' }
          }]
        };

        const result = EnhancedConfigurationValidator.validateWithContext(config, 'test', { allowDefaults: false });
        assert.strictEqual(result.isValid, false, `Should reject invalid delegation permissions at index ${index}`);
      });
    });

    test('should handle null/undefined delegation permissions based on allowDefaults', () => {
      const configWithNullPermissions = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: null,
          toolPermissions: { type: 'all' }
        }]
      };

      // With allowDefaults, null permissions should be handled gracefully
      const withDefaultsResult = EnhancedConfigurationValidator.validateWithContext(
        configWithNullPermissions,
        'test',
        { allowDefaults: true, migrateConfig: false }
      );
      // Should not fail due to null permissions when defaults are allowed
      const hasPermissionError = withDefaultsResult.errors.some(error =>
        error.includes('Delegation permissions are required')
      );
      assert.strictEqual(hasPermissionError, false, 'Should not require permissions when allowDefaults is true');

      // Without allowDefaults, null permissions should fail
      const withoutDefaultsResult = EnhancedConfigurationValidator.validateWithContext(
        configWithNullPermissions,
        'test',
        { allowDefaults: false, migrateConfig: false }
      );
      assert.strictEqual(withoutDefaultsResult.isValid, false, 'Should be invalid without allowDefaults');
    });

    test('should validate tool permissions structure', () => {
      const invalidPermissions = [
        'string',
        123,
        { type: 'invalid' },
        { type: 'specific' }, // Missing tools array
        { type: 'specific', tools: 'not-array' },
        { type: 'specific', tools: [] }, // Empty array
        { type: 'specific', tools: ['', 'valid-tool'] } // Empty string in array
      ];

      invalidPermissions.forEach((permissions, index) => {
        const config = {
          agents: [{
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'all' },
            toolPermissions: permissions
          }]
        };

        const result = EnhancedConfigurationValidator.validateWithContext(config, 'test', { allowDefaults: false });
        assert.strictEqual(result.isValid, false, `Should reject invalid tool permissions at index ${index}`);
      });
    });

    test('should handle null/undefined tool permissions based on allowDefaults', () => {
      const configWithNullPermissions = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' },
          toolPermissions: null
        }]
      };

      // With allowDefaults, null permissions should be handled gracefully
      const withDefaultsResult = EnhancedConfigurationValidator.validateWithContext(
        configWithNullPermissions,
        'test',
        { allowDefaults: true, migrateConfig: false }
      );
      // Should not fail due to null permissions when defaults are allowed
      const hasPermissionError = withDefaultsResult.errors.some(error =>
        error.includes('Tool permissions are required')
      );
      assert.strictEqual(hasPermissionError, false, 'Should not require permissions when allowDefaults is true');

      // Without allowDefaults, null permissions should fail
      const withoutDefaultsResult = EnhancedConfigurationValidator.validateWithContext(
        configWithNullPermissions,
        'test',
        { allowDefaults: false, migrateConfig: false }
      );
      assert.strictEqual(withoutDefaultsResult.isValid, false, 'Should be invalid without allowDefaults');
    });

    test('should detect duplicate agents in delegation permissions', () => {
      const config = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: {
            type: 'specific',
            agents: ['agent1', 'agent2', 'agent1'] // Duplicate
          },
          toolPermissions: { type: 'all' }
        }]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('duplicate agent names')));
    });

    test('should detect duplicate tools in tool permissions', () => {
      const config = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: { type: 'all' },
          toolPermissions: {
            type: 'specific',
            tools: ['tool1', 'tool2', 'tool1'] // Duplicate
          }
        }]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('duplicate tool names')));
    });
  });

  suite('Cross-Reference Validation', () => {
    test('should detect non-existent agent references in delegation permissions', () => {
      const config = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Testing',
          delegationPermissions: {
            type: 'specific',
            agents: ['non-existent-agent']
          },
          toolPermissions: { type: 'all' }
        }]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('References non-existent agent')));
    });

    test('should validate agent references exist', () => {
      const config = {
        agents: [
          {
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: {
              type: 'specific',
              agents: ['existing-agent']
            },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'existing-agent',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, true, `Should validate existing references: ${result.errors.join(', ')}`);
    });
  });

  suite('Circular Delegation Detection', () => {
    test('should detect simple circular delegation', () => {
      const config = {
        agents: [
          {
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['agent1'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent1',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['coordinator'] },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('circular delegation')));
    });

    test('should detect complex circular delegation', () => {
      const config = {
        agents: [
          {
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['agent1'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent1',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['agent2'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent2',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['coordinator'] },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('circular delegation')));
    });

    test('should allow valid delegation chains', () => {
      const config = {
        agents: [
          {
            name: 'coordinator',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['agent1'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent1',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['agent2'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent2',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'none' }, // No circular reference
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = EnhancedConfigurationValidator.validateWithContext(config);
      assert.strictEqual(result.isValid, true, `Should allow valid delegation chains: ${result.errors.join(', ')}`);
    });
  });

  suite('Configuration Migration', () => {
    test('should migrate configuration without version', () => {
      const configWithoutVersion = {
        agents: [DEFAULT_COORDINATOR_CONFIG]
      };

      const migrationResult = EnhancedConfigurationValidator.migrateConfiguration(configWithoutVersion);
      assert.strictEqual(migrationResult.migrated, true);
      assert.ok(migrationResult.changes.some(change => change.includes('Added version field')));
      assert.strictEqual(migrationResult.config.version, '1.0.0');
    });

    test('should migrate missing coordinator', () => {
      const configWithoutCoordinator = {
        agents: []
      };

      const migrationResult = EnhancedConfigurationValidator.migrateConfiguration(configWithoutCoordinator);
      assert.strictEqual(migrationResult.migrated, true);
      assert.ok(migrationResult.changes.some(change => change.includes('Populated empty agents array')));
      assert.ok(migrationResult.config.agents && migrationResult.config.agents.length > 0);
    });

    test('should migrate non-array customAgents', () => {
      const configWithInvalidAgents = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: null // Non-array customAgents
      };

      const migrationResult = EnhancedConfigurationValidator.migrateConfiguration(configWithInvalidAgents);
      assert.strictEqual(migrationResult.migrated, true);
      assert.ok(migrationResult.changes.some(change => change.includes('unified agents structure')));
      assert.ok(Array.isArray(migrationResult.config.agents));
    });
  });

  suite('Default Configuration', () => {
    test('should provide valid default configuration', () => {
      const defaultConfig = EnhancedConfigurationValidator.getDefaultConfiguration();
      const result = EnhancedConfigurationValidator.validateWithContext(defaultConfig);

      assert.strictEqual(result.isValid, true, `Default config should be valid: ${result.errors.join(', ')}`);
      assert.ok(defaultConfig.entryAgent);
      assert.ok(Array.isArray(defaultConfig.agents));
    });

    test('should apply defaults to partial configuration', () => {
      const partialConfig: Partial<ExtensionConfiguration> = {
        agents: [
          {
            name: 'test-agent',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const configWithDefaults = EnhancedConfigurationValidator.applyDefaults(partialConfig);
      assert.ok(configWithDefaults.entryAgent);
      assert.strictEqual(configWithDefaults.agents.length, 1);
      assert.strictEqual(configWithDefaults.agents[0].name, 'test-agent');
    });
  });

  suite('Validation Options', () => {
    test('should respect strict validation option', () => {
      const invalidConfig = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'x', // Too short
          description: 'Test',
          useFor: 'Test',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        }]
      };

      const strictResult = EnhancedConfigurationValidator.validateWithContext(
        invalidConfig,
        'test',
        { strict: true }
      );
      assert.strictEqual(strictResult.isValid, false);

      const lenientResult = EnhancedConfigurationValidator.validateWithContext(
        invalidConfig,
        'test',
        { strict: false }
      );
      // Even in lenient mode, some errors should still be caught
      assert.strictEqual(lenientResult.isValid, false);
    });

    test('should respect allowDefaults option', () => {
      // Test with missing coordinator - should be valid with allowDefaults
      const configMissingCoordinator = {
        agents: []
      };

      const withDefaultsResult = EnhancedConfigurationValidator.validateWithContext(
        configMissingCoordinator,
        'test',
        { allowDefaults: true, migrateConfig: false }
      );

      // Should not have agent-specific errors when allowDefaults is true
      const hasAgentError = withDefaultsResult.errors.some(error =>
        error.includes('At least one agent must be configured')
      );
      assert.strictEqual(hasAgentError, false, 'Should not have agent error when allowDefaults is true');

      // Test without allowDefaults - should fail
      const withoutDefaultsResult = EnhancedConfigurationValidator.validateWithContext(
        configMissingCoordinator,
        'test',
        { allowDefaults: false, migrateConfig: false }
      );
      assert.strictEqual(withoutDefaultsResult.isValid, false, 'Should be invalid without allowDefaults');

      // Should have agent error when allowDefaults is false
      const hasAgentErrorWithoutDefaults = withoutDefaultsResult.errors.some(error =>
        error.includes('At least one agent must be configured')
      );
      assert.strictEqual(hasAgentErrorWithoutDefaults, true, 'Should have agent error when allowDefaults is false');
    });
  });

  suite('Utility Functions', () => {
    test('validateConfiguration utility should work', async () => {
      const validConfig = DEFAULT_EXTENSION_CONFIG;
      const result = await validateConfiguration(validConfig);

      assert.strictEqual(result.isValid, true);
      assert.ok(result.config);
      assert.strictEqual(result.errors.length, 0);
    });

    test('validateConfiguration should handle invalid config', async () => {
      const invalidConfig = { invalid: 'config' };
      const result = await validateConfiguration(invalidConfig);

      assert.ok(result.config); // Should return fixed config
      assert.ok(result.warnings.length > 0); // Should have warnings about using defaults
    });
  });
});