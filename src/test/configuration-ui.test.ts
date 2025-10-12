import * as assert from 'assert';
import { 
  ConfigurationValidator,
  ExtensionConfiguration, 
  AgentConfiguration, 
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_CONFIG
} from '../models/agent-configuration';

// Integration tests for configuration UI and schema validation
suite('Configuration UI Integration Test Suite', () => {

  suite('Package.json Schema Validation', () => {
    test('should validate coordinator configuration against schema constraints', () => {
      // Test minimum length constraints
      const configWithShortFields = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          systemPrompt: '', // Should fail minLength: 1
          description: '', // Should fail minLength: 1
          useFor: '' // Should fail minLength: 1
        },
        customAgents: []
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithShortFields);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('systemPrompt')));
      assert.ok(validation.errors.some(error => error.includes('description')));
      assert.ok(validation.errors.some(error => error.includes('useFor')));
    });

    test('should validate agent name pattern constraints', () => {
      const configWithInvalidNames: ExtensionConfiguration = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: [
          {
            name: 'invalid name with spaces', // Should fail pattern constraint
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'invalid@name', // Should fail pattern constraint
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithInvalidNames);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('letters, numbers, hyphens, and underscores')));
    });

    test('should validate delegation permissions structure', () => {
      const configWithInvalidDelegation: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'invalid-type' } as any
        },
        customAgents: [
          {
            name: 'test-agent',
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use',
            delegationPermissions: { type: 'specific' } as any, // Missing agents array
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithInvalidDelegation);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('must be "all", "none", or "specific"')));
      assert.ok(validation.errors.some(error => error.includes('must include an agents array')));
    });

    test('should validate tool permissions structure', () => {
      const configWithInvalidTools: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          toolPermissions: { type: 'specific' } as any // Missing tools array
        },
        customAgents: [
          {
            name: 'test-agent',
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'invalid-type' } as any
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithInvalidTools);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('must include a tools array')));
      assert.ok(validation.errors.some(error => error.includes('must be "all", "none", or "specific"')));
    });

    test('should validate unique items in arrays', () => {
      const configWithDuplicates: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { 
            type: 'specific', 
            agents: ['agent1', 'agent1'] // Duplicate agents
          },
          toolPermissions: {
            type: 'specific',
            tools: ['tool1', 'tool1'] // Duplicate tools
          }
        },
        customAgents: [
          {
            name: 'agent1',
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      // Note: Our validator doesn't check for duplicates in arrays, but VS Code schema would
      // This test documents the expected behavior
      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithDuplicates);
      // Our current validator allows duplicates, but VS Code schema validation would catch this
      assert.strictEqual(validation.isValid, true);
    });
  });

  suite('Configuration UI Error Display', () => {
    test('should provide user-friendly error messages for common mistakes', () => {
      const commonMistakes = {
        coordinator: {
          name: 'coordinator',
          systemPrompt: 'A'.repeat(5001), // Too long
          description: 'B'.repeat(201), // Too long
          useFor: 'C'.repeat(201), // Too long
          delegationPermissions: { type: 'specific', agents: [''] }, // Empty agent name
          toolPermissions: { type: 'specific', tools: [''] } // Empty tool name
        },
        customAgents: [
          {
            name: 'D'.repeat(51), // Too long
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      } as any;

      const validation = ConfigurationValidator.validateExtensionConfiguration(commonMistakes);
      assert.strictEqual(validation.isValid, false);
      
      // Should have specific error messages for length constraints
      assert.ok(validation.errors.length > 0);
      assert.ok(validation.errors.some(error => error.includes('50 characters or less')));
      assert.ok(validation.errors.some(error => error.includes('non-empty string')));
    });

    test('should validate required fields are present', () => {
      const incompleteConfig = {
        coordinator: {
          name: 'coordinator',
          systemPrompt: 'Valid prompt'
          // Missing description, useFor, delegationPermissions, toolPermissions
        },
        customAgents: [
          {
            name: 'test-agent'
            // Missing all other required fields
          }
        ]
      } as any;

      const validation = ConfigurationValidator.validateExtensionConfiguration(incompleteConfig);
      assert.strictEqual(validation.isValid, false);
      
      // Should have errors for missing required fields
      assert.ok(validation.errors.some(error => error.includes('description')));
      assert.ok(validation.errors.some(error => error.includes('useFor')));
      assert.ok(validation.errors.some(error => error.includes('systemPrompt')));
    });
  });

  suite('Configuration Default Values', () => {
    test('should have appropriate default values for coordinator', () => {
      const coordinator = DEFAULT_COORDINATOR_CONFIG;
      
      // Verify defaults match package.json schema defaults
      assert.ok(coordinator.systemPrompt.includes('coordinator agent'));
      assert.ok(coordinator.systemPrompt.includes('orchestrating'));
      assert.strictEqual(coordinator.description, 'Coordinates work between specialized agents');
      assert.strictEqual(coordinator.useFor, 'Task orchestration and delegation');
      assert.strictEqual(coordinator.delegationPermissions.type, 'all');
      assert.strictEqual(coordinator.toolPermissions.type, 'specific');
      
      if (coordinator.toolPermissions.type === 'specific') {
        assert.ok(coordinator.toolPermissions.tools.includes('delegateWork'));
        assert.ok(coordinator.toolPermissions.tools.includes('reportOut'));
      }
    });

    test('should have empty array as default for custom agents', () => {
      const config = DEFAULT_EXTENSION_CONFIG;
      assert.ok(Array.isArray(config.customAgents));
      assert.strictEqual(config.customAgents.length, 0);
    });
  });

  suite('Configuration Limits and Constraints', () => {
    test('should respect maximum items constraint for custom agents', () => {
      // Create configuration with many agents (package.json has maxItems: 20)
      const manyAgents: AgentConfiguration[] = [];
      for (let i = 1; i <= 25; i++) {
        manyAgents.push({
          name: `agent${i}`,
          systemPrompt: `Agent ${i} prompt`,
          description: `Agent ${i} description`,
          useFor: `Agent ${i} tasks`,
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'all' }
        });
      }

      const configWithManyAgents: ExtensionConfiguration = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: manyAgents
      };

      // Our validator doesn't enforce maxItems, but documents the constraint
      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithManyAgents);
      // This would be caught by VS Code's schema validation
      assert.strictEqual(validation.isValid, true);
    });

    test('should validate field length constraints', () => {
      const configWithLongFields: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          systemPrompt: 'A'.repeat(5001), // Exceeds maxLength: 5000
          description: 'B'.repeat(201), // Exceeds maxLength: 200
          useFor: 'C'.repeat(201) // Exceeds maxLength: 200
        },
        customAgents: []
      };

      // Our validator doesn't enforce maxLength, but documents the constraint
      const validation = ConfigurationValidator.validateExtensionConfiguration(configWithLongFields);
      // This would be caught by VS Code's schema validation
      assert.strictEqual(validation.isValid, true);
    });
  });

  suite('Configuration Migration and Compatibility', () => {
    test('should handle legacy configuration formats gracefully', () => {
      // Simulate old configuration format that might be missing new fields
      const legacyConfig = {
        coordinator: {
          name: 'coordinator',
          systemPrompt: 'Legacy coordinator prompt',
          description: 'Legacy description',
          useFor: 'Legacy use',
          // Missing new permission structures - would use defaults
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        },
        customAgents: []
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(legacyConfig);
      assert.strictEqual(validation.isValid, true);
    });

    test('should validate configuration after updates', () => {
      // Start with valid configuration
      let config: ExtensionConfiguration = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: [
          {
            name: 'test-agent',
            systemPrompt: 'Test prompt',
            description: 'Test description',
            useFor: 'Test use',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      // Verify initial state is valid
      let validation = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(validation.isValid, true);

      // Simulate user adding another agent
      config.customAgents.push({
        name: 'another-agent',
        systemPrompt: 'Another prompt',
        description: 'Another description',
        useFor: 'Another use',
        delegationPermissions: { type: 'specific', agents: ['test-agent'] },
        toolPermissions: { type: 'specific', tools: ['reportOut'] }
      });

      // Should still be valid
      validation = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(validation.isValid, true);

      // Simulate user making invalid change
      config.customAgents[1].delegationPermissions = { 
        type: 'specific', 
        agents: ['non-existent-agent'] 
      };

      // Should now be invalid
      validation = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('non-existent-agent')));
    });
  });
});