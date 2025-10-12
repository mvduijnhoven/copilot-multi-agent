import * as assert from 'assert';
import { 
  ConfigurationValidator, 
  AgentConfiguration, 
  CoordinatorConfiguration,
  ExtensionConfiguration,
  DelegationPermissions,
  ToolPermissions,
  DEFAULT_COORDINATOR_CONFIG,
  DEFAULT_EXTENSION_CONFIG
} from '../models/agent-configuration';

suite('Configuration Validation Test Suite', () => {

  suite('Agent Name Validation', () => {
    test('should accept valid agent names', () => {
      const validNames = ['test-agent', 'agent_1', 'MyAgent', 'agent123'];
      
      validNames.forEach(name => {
        const result = ConfigurationValidator.validateAgentName(name);
        assert.strictEqual(result.isValid, true, `Name "${name}" should be valid`);
        assert.strictEqual(result.errors.length, 0);
      });
    });

    test('should reject invalid agent names', () => {
      const invalidCases = [
        { name: '', expectedError: 'Agent name cannot be empty' },
        { name: '   ', expectedError: 'Agent name cannot be empty' },
        { name: 'a'.repeat(51), expectedError: 'Agent name must be 50 characters or less' },
        { name: 'agent with spaces', expectedError: 'Agent name can only contain letters, numbers, hyphens, and underscores' },
        { name: 'agent@special', expectedError: 'Agent name can only contain letters, numbers, hyphens, and underscores' }
      ];

      invalidCases.forEach(({ name, expectedError }) => {
        const result = ConfigurationValidator.validateAgentName(name);
        assert.strictEqual(result.isValid, false, `Name "${name}" should be invalid`);
        assert.ok(result.errors.some(error => error.includes(expectedError)), 
          `Should contain error: ${expectedError}. Got: ${result.errors.join(', ')}`);
      });
    });

    test('should reject non-string names', () => {
      const invalidTypes = [null, undefined, 123, {}, []];
      
      invalidTypes.forEach(name => {
        const result = ConfigurationValidator.validateAgentName(name as any);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error => error.includes('must be a string')));
      });
    });
  });

  suite('Delegation Permissions Validation', () => {
    test('should accept valid delegation permissions', () => {
      const validPermissions: DelegationPermissions[] = [
        { type: 'all' },
        { type: 'none' },
        { type: 'specific', agents: ['agent1', 'agent2'] },
        { type: 'specific', agents: [] }
      ];

      validPermissions.forEach(permissions => {
        const result = ConfigurationValidator.validateDelegationPermissions(permissions);
        assert.strictEqual(result.isValid, true, `Permissions should be valid: ${JSON.stringify(permissions)}`);
        assert.strictEqual(result.errors.length, 0);
      });
    });

    test('should reject invalid delegation permissions', () => {
      const invalidCases = [
        { permissions: null, expectedError: 'must be an object' },
        { permissions: 'invalid', expectedError: 'must be an object' },
        { permissions: { type: 'invalid' }, expectedError: 'must be "all", "none", or "specific"' },
        { permissions: { type: 'specific' }, expectedError: 'must include an agents array' },
        { permissions: { type: 'specific', agents: 'not-array' }, expectedError: 'must include an agents array' },
        { permissions: { type: 'specific', agents: ['', 'valid'] }, expectedError: 'must be a non-empty string' }
      ];

      invalidCases.forEach(({ permissions, expectedError }) => {
        const result = ConfigurationValidator.validateDelegationPermissions(permissions);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error => error.includes(expectedError)), 
          `Should contain error: ${expectedError}. Got: ${result.errors.join(', ')}`);
      });
    });
  });

  suite('Tool Permissions Validation', () => {
    test('should accept valid tool permissions', () => {
      const validPermissions: ToolPermissions[] = [
        { type: 'all' },
        { type: 'none' },
        { type: 'specific', tools: ['tool1', 'tool2'] },
        { type: 'specific', tools: [] }
      ];

      validPermissions.forEach(permissions => {
        const result = ConfigurationValidator.validateToolPermissions(permissions);
        assert.strictEqual(result.isValid, true, `Permissions should be valid: ${JSON.stringify(permissions)}`);
        assert.strictEqual(result.errors.length, 0);
      });
    });

    test('should reject invalid tool permissions', () => {
      const invalidCases = [
        { permissions: null, expectedError: 'must be an object' },
        { permissions: 'invalid', expectedError: 'must be an object' },
        { permissions: { type: 'invalid' }, expectedError: 'must be "all", "none", or "specific"' },
        { permissions: { type: 'specific' }, expectedError: 'must include a tools array' },
        { permissions: { type: 'specific', tools: 'not-array' }, expectedError: 'must include a tools array' },
        { permissions: { type: 'specific', tools: ['', 'valid'] }, expectedError: 'must be a non-empty string' }
      ];

      invalidCases.forEach(({ permissions, expectedError }) => {
        const result = ConfigurationValidator.validateToolPermissions(permissions);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error => error.includes(expectedError)), 
          `Should contain error: ${expectedError}. Got: ${result.errors.join(', ')}`);
      });
    });
  });

  suite('Agent Configuration Validation', () => {
    test('should accept valid agent configuration', () => {
      const validConfig: AgentConfiguration = {
        name: 'test-agent',
        systemPrompt: 'You are a test agent',
        description: 'A test agent for validation',
        useFor: 'Testing purposes',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      };

      const result = ConfigurationValidator.validateAgentConfiguration(validConfig);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should reject agent configuration with missing fields', () => {
      const incompleteConfig = {
        name: 'test-agent',
        systemPrompt: 'You are a test agent'
        // Missing description, useFor, delegationPermissions, toolPermissions
      };

      const result = ConfigurationValidator.validateAgentConfiguration(incompleteConfig);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('description')));
      assert.ok(result.errors.some(error => error.includes('useFor')));
    });

    test('should reject agent configuration with empty string fields', () => {
      const configWithEmptyFields = {
        name: 'test-agent',
        systemPrompt: '',
        description: '   ',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      };

      const result = ConfigurationValidator.validateAgentConfiguration(configWithEmptyFields);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('systemPrompt')));
      assert.ok(result.errors.some(error => error.includes('description')));
    });
  });

  suite('Coordinator Configuration Validation', () => {
    test('should accept valid coordinator configuration', () => {
      const result = ConfigurationValidator.validateCoordinatorConfiguration(DEFAULT_COORDINATOR_CONFIG);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should reject coordinator with wrong name', () => {
      const invalidCoordinator = {
        ...DEFAULT_COORDINATOR_CONFIG,
        name: 'wrong-name'
      };

      const result = ConfigurationValidator.validateCoordinatorConfiguration(invalidCoordinator);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Coordinator name must be "coordinator"')));
    });
  });

  suite('Extension Configuration Validation', () => {
    test('should accept valid extension configuration', () => {
      const result = ConfigurationValidator.validateExtensionConfiguration(DEFAULT_EXTENSION_CONFIG);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should accept extension configuration with custom agents', () => {
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
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(configWithAgents);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
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

      const result = ConfigurationValidator.validateExtensionConfiguration(configWithDuplicates);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Duplicate agent name')));
    });

    test('should reject configuration with agent named "coordinator"', () => {
      const configWithCoordinatorName: ExtensionConfiguration = {
        coordinator: DEFAULT_COORDINATOR_CONFIG,
        customAgents: [
          {
            name: 'coordinator',
            systemPrompt: 'Invalid agent',
            description: 'Should not be allowed',
            useFor: 'Invalid',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(configWithCoordinatorName);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Duplicate agent name "coordinator"')));
    });

    test('should reject configuration with invalid delegation references', () => {
      const configWithInvalidRefs: ExtensionConfiguration = {
        coordinator: {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'specific', agents: ['non-existent-agent'] }
        },
        customAgents: [
          {
            name: 'valid-agent',
            systemPrompt: 'Valid agent',
            description: 'Valid',
            useFor: 'Valid',
            delegationPermissions: { type: 'specific', agents: ['another-non-existent'] },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(configWithInvalidRefs);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('References non-existent agent "non-existent-agent"')));
      assert.ok(result.errors.some(error => error.includes('References non-existent agent "another-non-existent"')));
    });

    test('should accept configuration with valid delegation references', () => {
      const configWithValidRefs: ExtensionConfiguration = {
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
            delegationPermissions: { type: 'specific', agents: ['agent2'] },
            toolPermissions: { type: 'all' }
          },
          {
            name: 'agent2',
            systemPrompt: 'Agent 2',
            description: 'Second agent',
            useFor: 'Second tasks',
            delegationPermissions: { type: 'none' },
            toolPermissions: { type: 'all' }
          }
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(configWithValidRefs);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  suite('Default Configurations', () => {
    test('default coordinator configuration should be valid', () => {
      const result = ConfigurationValidator.validateCoordinatorConfiguration(DEFAULT_COORDINATOR_CONFIG);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('default extension configuration should be valid', () => {
      const result = ConfigurationValidator.validateExtensionConfiguration(DEFAULT_EXTENSION_CONFIG);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('default coordinator should have correct properties', () => {
      assert.strictEqual(DEFAULT_COORDINATOR_CONFIG.name, 'coordinator');
      assert.ok(DEFAULT_COORDINATOR_CONFIG.systemPrompt.length > 0);
      assert.ok(DEFAULT_COORDINATOR_CONFIG.description.length > 0);
      assert.ok(DEFAULT_COORDINATOR_CONFIG.useFor.length > 0);
      assert.strictEqual(DEFAULT_COORDINATOR_CONFIG.delegationPermissions.type, 'all');
      assert.strictEqual(DEFAULT_COORDINATOR_CONFIG.toolPermissions.type, 'specific');
    });
  });
});