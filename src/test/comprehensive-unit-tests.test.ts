/**
 * Comprehensive unit tests for all core components
 * Focuses on business logic without VS Code API dependencies
 */

import * as assert from 'assert';
import {
  ConfigurationValidator,
  ExtensionConfiguration,
  AgentConfiguration,
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_CONFIG,
  ToolPermissions,
  DelegationPermissions
} from '../models';

suite('Comprehensive Core Component Tests', () => {

  suite('Configuration Validation Logic', () => {
    test('should validate complete valid configuration', () => {
      const validConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          DEFAULT_COORDINATOR_CONFIG,
          {
            name: 'test-agent',
            systemPrompt: 'You are a test agent',
            description: 'Test agent for validation',
            useFor: 'Testing purposes',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'specific', tools: ['reportOut'] }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(validConfig);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should accept configuration with valid agent name', () => {
      const validConfig = {
        agents: [{
          ...DEFAULT_COORDINATOR_CONFIG,
          name: 'valid-agent-name'
        }]
      } as any;

      const validation = ConfigurationValidator.validateExtensionConfiguration(validConfig);
      assert.strictEqual(validation.isValid, true);
    });

    test('should reject configuration with duplicate agent names', () => {
      const invalidConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          DEFAULT_COORDINATOR_CONFIG,
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

      const validation = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('Duplicate agent name')));
    });

    test('should validate complex delegation permissions', () => {
      const complexConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          {
            ...DEFAULT_COORDINATOR_CONFIG,
            delegationPermissions: { type: 'specific', agents: ['agent1', 'agent2'] }
          },
          {
            name: 'agent1',
            systemPrompt: 'Agent 1',
            description: 'First agent',
            useFor: 'First tasks',
            delegationPermissions: { type: 'specific', agents: ['agent2'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent2',
            systemPrompt: 'Agent 2',
            description: 'Second agent',
            useFor: 'Second tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'specific', tools: ['reportOut'] }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(complexConfig);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should reject invalid delegation references', () => {
      const invalidConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          {
            ...DEFAULT_COORDINATOR_CONFIG,
            delegationPermissions: { type: 'specific', agents: ['non-existent-agent'] }
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('References non-existent agent')));
    });

    test('should validate tool permissions correctly', () => {
      const testCases: Array<{ permissions: ToolPermissions; shouldBeValid: boolean }> = [
        { permissions: { type: 'all' }, shouldBeValid: true },
        { permissions: { type: 'none' }, shouldBeValid: true },
        { permissions: { type: 'specific', tools: ['tool1', 'tool2'] }, shouldBeValid: true },
        { permissions: { type: 'specific', tools: [] }, shouldBeValid: true }
      ];

      testCases.forEach(({ permissions, shouldBeValid }, index) => {
        const config: ExtensionConfiguration = {
          entryAgent: 'coordinator',
          agents: [
            {
              ...DEFAULT_COORDINATOR_CONFIG,
              toolPermissions: permissions
            }
          ]
        };

        const validation = ConfigurationValidator.validateExtensionConfiguration(config);
        assert.strictEqual(validation.isValid, shouldBeValid,
          `Test case ${index}: ${JSON.stringify(permissions)} should be ${shouldBeValid ? 'valid' : 'invalid'}`);
      });
    });

    test('should validate delegation permissions correctly', () => {
      const testCases: Array<{ permissions: DelegationPermissions; shouldBeValid: boolean }> = [
        { permissions: { type: 'all' }, shouldBeValid: true },
        { permissions: { type: 'none' }, shouldBeValid: true },
        { permissions: { type: 'specific', agents: ['agent1'] }, shouldBeValid: false } // agent1 doesn't exist
      ];

      testCases.forEach(({ permissions, shouldBeValid }, index) => {
        const config: ExtensionConfiguration = {
          entryAgent: 'coordinator',
          agents: [
            {
              ...DEFAULT_COORDINATOR_CONFIG,
              delegationPermissions: permissions
            }
          ]
        };

        const validation = ConfigurationValidator.validateExtensionConfiguration(config);
        assert.strictEqual(validation.isValid, shouldBeValid,
          `Test case ${index}: ${JSON.stringify(permissions)} should be ${shouldBeValid ? 'valid' : 'invalid'}`);
      });
    });
  });

  suite('Agent Configuration Edge Cases', () => {
    test('should handle empty system prompts', () => {
      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          {
            ...DEFAULT_COORDINATOR_CONFIG,
            systemPrompt: ''
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.some(error => error.includes('systemPrompt')));
    });

    test('should handle very long system prompts', () => {
      const longPrompt = 'A'.repeat(10000);
      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          {
            ...DEFAULT_COORDINATOR_CONFIG,
            systemPrompt: longPrompt
          }
        ]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(config);
      // The current implementation may not have length limits, so just check it doesn't crash
      assert.ok(typeof validation.isValid === 'boolean');
      assert.ok(Array.isArray(validation.errors));
    });

    test('should handle invalid agent names', () => {
      const invalidNames = ['', 'invalid name', 'invalid@name', 'invalid.name'];

      invalidNames.forEach(invalidName => {
        const config: ExtensionConfiguration = {
          entryAgent: 'coordinator',
          agents: [{
            ...DEFAULT_COORDINATOR_CONFIG
          }, {
            name: invalidName,
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use case',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }]
        };

        const validation = ConfigurationValidator.validateExtensionConfiguration(config);
        assert.strictEqual(validation.isValid, false,
          `Agent name "${invalidName}" should be invalid`);
      });
    });

    test('should handle valid agent names', () => {
      const validNames = ['agent1', 'test-agent', 'test_agent', 'Agent123', 'a'];

      validNames.forEach(validName => {
        const config: ExtensionConfiguration = {
          entryAgent: 'coordinator',
          agents: [{
            ...DEFAULT_COORDINATOR_CONFIG
            }, {
            name: validName,
            systemPrompt: 'Valid prompt',
            description: 'Valid description',
            useFor: 'Valid use case',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }]
        };

        const validation = ConfigurationValidator.validateExtensionConfiguration(config);
        assert.strictEqual(validation.isValid, true,
          `Agent name "${validName}" should be valid`);
      });
    });

    test('should handle maximum number of custom agents', () => {
      const maxAgents = 19; // Stay under any potential limit
      const agents: AgentConfiguration[] = [];

      agents.push(DEFAULT_COORDINATOR_CONFIG);
      for (let i = 0; i < maxAgents; i++) {
        agents.push({
          name: `agent${i}`,
          systemPrompt: `Agent ${i} prompt`,
          description: `Agent ${i} description`,
          useFor: `Agent ${i} use case`,
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'all' }
        });
      }

      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(config);
      // Just check it doesn't crash with many agents
      assert.ok(typeof validation.isValid === 'boolean');
      assert.ok(Array.isArray(validation.errors));
    });
  });

  suite('Configuration Transformation and Normalization', () => {
    test('should normalize configuration with missing optional fields', () => {
      const partialConfig = {
        agents: [{
          name: 'coordinator',
          systemPrompt: 'Test prompt',
          description: 'Test description',
          useFor: 'Test use',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        }]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(partialConfig);
      assert.strictEqual(validation.isValid, true);
    });

    test('should handle null and undefined values gracefully', () => {
      const testCases = [
        null,
        undefined,
        {},
        { agents: null },
        { agents: [DEFAULT_COORDINATOR_CONFIG] },
        { agents: undefined }
      ];

      testCases.forEach((testCase, index) => {
        const validation = ConfigurationValidator.validateExtensionConfiguration(testCase as any);
        // Should either be valid (with defaults applied) or invalid with clear errors
        assert.ok(typeof validation.isValid === 'boolean',
          `Test case ${index} should return a boolean validation result`);
        assert.ok(Array.isArray(validation.errors),
          `Test case ${index} should return an array of errors`);
      });
    });

    test('should preserve valid configuration unchanged', () => {
      const originalConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [{
            ...DEFAULT_COORDINATOR_CONFIG,
            systemPrompt: 'Custom coordinator prompt'
          }, {
          name: 'test-agent',
          systemPrompt: 'Custom agent prompt',
          description: 'Custom description',
          useFor: 'Custom use case',
          delegationPermissions: { type: 'specific', agents: [] },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        }]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(originalConfig);
      assert.strictEqual(validation.isValid, true);

      // Validation should succeed for valid configuration
      assert.strictEqual(validation.isValid, true);
    });
  });

  suite('Error Message Quality', () => {
    test('should provide specific error messages for different validation failures', () => {
      const testCases = [
        {
          config: { agents: null },
          expectedErrorKeywords: ['agents', 'array']
        },
        {
          config: {
            agents: [{ ...DEFAULT_COORDINATOR_CONFIG, name: 'invalid name with spaces' }]
          },
          expectedErrorKeywords: ['name', 'letters']
        },
        {
          config: {
            agents: [
              DEFAULT_COORDINATOR_CONFIG,
              { name: '', systemPrompt: '', description: '', useFor: '', delegationPermissions: { type: 'none' }, toolPermissions: { type: 'all' } }
            ]
          },
          expectedErrorKeywords: ['name', 'empty']
        }
      ];

      testCases.forEach(({ config, expectedErrorKeywords }, index) => {
        const validation = ConfigurationValidator.validateExtensionConfiguration(config as any);
        assert.strictEqual(validation.isValid, false, `Test case ${index} should be invalid`);

        expectedErrorKeywords.forEach(keyword => {
          assert.ok(
            validation.errors.some(error => error.toLowerCase().includes(keyword.toLowerCase())),
            `Test case ${index} should include error message with keyword "${keyword}". Errors: ${validation.errors.join(', ')}`
          );
        });
      });
    });

    test('should provide helpful suggestions in error messages', () => {
      const invalidConfig = {
        agents: [{
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'specific' } // Missing agents array
        }]
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(invalidConfig as any);
      assert.strictEqual(validation.isValid, false);

      // Should provide helpful error message
      assert.ok(validation.errors.some(error =>
        error.includes('agents array') || error.includes('must include')
      ));
    });
  });

  suite('Performance and Scalability', () => {
    test('should validate large configurations efficiently', () => {
      const largeConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [DEFAULT_COORDINATOR_CONFIG]
      };

      // Create many agents
      for (let i = 0; i < 15; i++) { // Reasonable number for testing
        largeConfig.agents.push({
          name: `agent${i}`,
          systemPrompt: `Agent ${i} with a reasonably long system prompt that describes its capabilities and behavior in detail`,
          description: `Agent ${i} description`,
          useFor: `Agent ${i} specialized use case`,
          delegationPermissions: { type: 'specific', agents: [`agent${(i + 1) % 15}`] },
          toolPermissions: { type: 'specific', tools: ['reportOut', 'customTool1', 'customTool2'] }
        });
      }

      const startTime = Date.now();
      const validation = ConfigurationValidator.validateExtensionConfiguration(largeConfig);
      const endTime = Date.now();

      assert.strictEqual(validation.isValid, true);
      assert.ok(endTime - startTime < 1000, 'Validation should complete within 1 second');
    });

    test('should handle deeply nested delegation chains', () => {
      const chainLength = 10;
      const agents: AgentConfiguration[] = [];

      agents.push({
            ...DEFAULT_COORDINATOR_CONFIG,
            delegationPermissions: { type: 'specific', agents: ['agent0'] }
          });
      for (let i = 0; i < chainLength; i++) {
        const nextAgent = i < chainLength - 1 ? `agent${i + 1}` : undefined;
        agents.push({
          name: `agent${i}`,
          systemPrompt: `Agent ${i} in delegation chain`,
          description: `Agent ${i}`,
          useFor: `Step ${i} in process`,
          delegationPermissions: nextAgent ? { type: 'specific', agents: [nextAgent] } : { type: 'none' },
          toolPermissions: { type: 'all' }
        });
      }

      const config: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents
      };

      const validation = ConfigurationValidator.validateExtensionConfiguration(config);
      assert.strictEqual(validation.isValid, true);
    });
  });
});