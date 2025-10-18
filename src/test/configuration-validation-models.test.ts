/**
 * Unit tests for configuration data models and validation
 */

import * as assert from 'assert';
import {
  AgentConfiguration,
  ExtensionConfiguration,
  DelegationPermissions,
  ToolPermissions,
  ConfigurationValidator,
  DEFAULT_COORDINATOR_AGENT,
  DEFAULT_EXTENSION_CONFIG
} from '../models/agent-configuration';

describe('ConfigurationValidator', () => {
  describe('validateAgentName', () => {
    it('should validate correct agent names', () => {
      const validNames = ['coordinator', 'code-reviewer', 'test_agent', 'Agent123'];

      validNames.forEach(name => {
        const result = ConfigurationValidator.validateAgentName(name);
        assert.strictEqual(result.isValid, true);
        assert.strictEqual(result.errors.length, 0);
      });
    });

    it('should reject invalid agent names', () => {
      const invalidCases = [
        { name: '', expectedError: 'Agent name cannot be empty' },
        { name: '   ', expectedError: 'Agent name cannot be empty' },
        { name: 'agent with spaces', expectedError: 'Agent name can only contain letters, numbers, hyphens, and underscores' },
        { name: 'agent@special', expectedError: 'Agent name can only contain letters, numbers, hyphens, and underscores' },
        { name: 'a'.repeat(51), expectedError: 'Agent name must be 50 characters or less' }
      ];

      invalidCases.forEach(({ name, expectedError }) => {
        const result = ConfigurationValidator.validateAgentName(name);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes(expectedError));
      });
    });

    it('should reject null, undefined, and non-string names', () => {
      const invalidValues = [null, undefined, 123, {}, []];

      invalidValues.forEach(value => {
        const result = ConfigurationValidator.validateAgentName(value as any);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes('Agent name is required and must be a string'));
      });
    });
  });

  describe('validateDelegationPermissions', () => {
    it('should validate "all" delegation permissions', () => {
      const permissions: DelegationPermissions = { type: 'all' };
      const result = ConfigurationValidator.validateDelegationPermissions(permissions);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate "none" delegation permissions', () => {
      const permissions: DelegationPermissions = { type: 'none' };
      const result = ConfigurationValidator.validateDelegationPermissions(permissions);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate "specific" delegation permissions with valid agents', () => {
      const permissions: DelegationPermissions = {
        type: 'specific',
        agents: ['agent1', 'agent2']
      };
      const result = ConfigurationValidator.validateDelegationPermissions(permissions);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject invalid delegation permission types', () => {
      const invalidPermissions = [
        { type: 'invalid' },
        { type: '' },
        {},
        { agents: ['agent1'] } // missing type
      ];

      invalidPermissions.forEach(permissions => {
        const result = ConfigurationValidator.validateDelegationPermissions(permissions);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes('Delegation permissions type must be "all", "none", or "specific"'));
      });
    });

    it('should reject specific permissions without agents array', () => {
      const permissions = { type: 'specific' };
      const result = ConfigurationValidator.validateDelegationPermissions(permissions);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Specific delegation permissions must include an agents array'));
    });

    it('should reject specific permissions with invalid agents', () => {
      const permissions = {
        type: 'specific',
        agents: ['valid-agent', '', null, 123]
      };
      const result = ConfigurationValidator.validateDelegationPermissions(permissions);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Agent at index 1 must be a non-empty string')));
      assert.ok(result.errors.some(error => error.includes('Agent at index 2 must be a non-empty string')));
      assert.ok(result.errors.some(error => error.includes('Agent at index 3 must be a non-empty string')));
    });

    it('should reject null or non-object permissions', () => {
      const invalidValues = [null, undefined, 'string', 123, []];

      invalidValues.forEach(value => {
        const result = ConfigurationValidator.validateDelegationPermissions(value);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes('Delegation permissions must be an object'));
      });
    });
  });

  describe('validateToolPermissions', () => {
    it('should validate "all" tool permissions', () => {
      const permissions: ToolPermissions = { type: 'all' };
      const result = ConfigurationValidator.validateToolPermissions(permissions);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate "none" tool permissions', () => {
      const permissions: ToolPermissions = { type: 'none' };
      const result = ConfigurationValidator.validateToolPermissions(permissions);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate "specific" tool permissions with valid tools', () => {
      const permissions: ToolPermissions = {
        type: 'specific',
        tools: ['delegateWork', 'reportOut']
      };
      const result = ConfigurationValidator.validateToolPermissions(permissions);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject invalid tool permission types', () => {
      const invalidPermissions = [
        { type: 'invalid' },
        { type: '' },
        {},
        { tools: ['tool1'] } // missing type
      ];

      invalidPermissions.forEach(permissions => {
        const result = ConfigurationValidator.validateToolPermissions(permissions);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes('Tool permissions type must be "all", "none", or "specific"'));
      });
    });

    it('should reject specific permissions without tools array', () => {
      const permissions = { type: 'specific' };
      const result = ConfigurationValidator.validateToolPermissions(permissions);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Specific tool permissions must include a tools array'));
    });

    it('should reject specific permissions with invalid tools', () => {
      const permissions = {
        type: 'specific',
        tools: ['validTool', '', null, 123]
      };
      const result = ConfigurationValidator.validateToolPermissions(permissions);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Tool at index 1 must be a non-empty string')));
      assert.ok(result.errors.some(error => error.includes('Tool at index 2 must be a non-empty string')));
      assert.ok(result.errors.some(error => error.includes('Tool at index 3 must be a non-empty string')));
    });
  });

  describe('validateAgentConfiguration', () => {
    const validAgent: AgentConfiguration = {
      name: 'test-agent',
      systemPrompt: 'You are a test agent',
      description: 'A test agent for validation',
      useFor: 'Testing purposes',
      delegationPermissions: { type: 'none' },
      toolPermissions: { type: 'all' }
    };

    it('should validate a complete valid agent configuration', () => {
      const result = ConfigurationValidator.validateAgentConfiguration(validAgent);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject agent configuration with missing required fields', () => {
      const requiredFields = ['name', 'systemPrompt', 'description', 'useFor'];

      requiredFields.forEach(field => {
        const invalidAgent = { ...validAgent };
        delete (invalidAgent as any)[field];

        const result = ConfigurationValidator.validateAgentConfiguration(invalidAgent);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error => error.includes(field)));
      });
    });

    it('should reject agent configuration with empty string fields', () => {
      const stringFields = ['name', 'systemPrompt', 'description', 'useFor'];

      stringFields.forEach(field => {
        const invalidAgent = { ...validAgent, [field]: '   ' };

        const result = ConfigurationValidator.validateAgentConfiguration(invalidAgent);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error => error.includes('cannot be empty')));
      });
    });

    it('should reject agent configuration with invalid permissions', () => {
      const invalidAgent = {
        ...validAgent,
        delegationPermissions: { type: 'invalid' },
        toolPermissions: { type: 'invalid' }
      };

      const result = ConfigurationValidator.validateAgentConfiguration(invalidAgent);
      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Delegation permissions type must be "all", "none", or "specific"'));
      assert.ok(result.errors.includes('Tool permissions type must be "all", "none", or "specific"'));
    });

    it('should reject null or non-object configurations', () => {
      const invalidValues = [null, undefined, 'string', 123, []];

      invalidValues.forEach(value => {
        const result = ConfigurationValidator.validateAgentConfiguration(value);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes('Agent configuration must be an object'));
      });
    });
  });

  describe('validateEntryAgent', () => {
    const agents: AgentConfiguration[] = [
      {
        name: 'coordinator',
        systemPrompt: 'Coordinator prompt',
        description: 'Coordinator',
        useFor: 'Coordination',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'specialist',
        systemPrompt: 'Specialist prompt',
        description: 'Specialist',
        useFor: 'Specialization',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      }
    ];

    it('should validate existing entry agent', () => {
      const result = ConfigurationValidator.validateEntryAgent('coordinator', agents);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject non-existent entry agent', () => {
      const result = ConfigurationValidator.validateEntryAgent('non-existent', agents);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Entry agent "non-existent" does not exist in the agents configuration'));
    });

    it('should reject empty or invalid entry agent names', () => {
      const invalidValues = ['', '   ', null, undefined, 123];

      invalidValues.forEach(value => {
        const result = ConfigurationValidator.validateEntryAgent(value as any, agents);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.some(error =>
          error.includes('Entry agent must be a non-empty string') ||
          error.includes('Entry agent cannot be empty')
        ));
      });
    });
  });

  describe('validateAndGetEntryAgent', () => {
    const agents: AgentConfiguration[] = [
      {
        name: 'coordinator',
        systemPrompt: 'Coordinator prompt',
        description: 'Coordinator',
        useFor: 'Coordination',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'specialist',
        systemPrompt: 'Specialist prompt',
        description: 'Specialist',
        useFor: 'Specialization',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      }
    ];

    it('should return specified valid entry agent', () => {
      const result = ConfigurationValidator.validateAndGetEntryAgent('specialist', agents);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.entryAgent, 'specialist');
    });

    it('should return first agent as default when no entry agent specified', () => {
      const result = ConfigurationValidator.validateAndGetEntryAgent(undefined, agents);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.entryAgent, 'coordinator');
    });

    it('should return first agent as default when empty entry agent specified', () => {
      const result = ConfigurationValidator.validateAndGetEntryAgent('', agents);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.entryAgent, 'coordinator');
    });

    it('should fail when no agents are configured', () => {
      const result = ConfigurationValidator.validateAndGetEntryAgent('coordinator', []);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Cannot determine entry agent: no agents configured'));
      assert.strictEqual(result.entryAgent, undefined);
    });

    it('should fail when specified entry agent does not exist', () => {
      const result = ConfigurationValidator.validateAndGetEntryAgent('non-existent', agents);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Entry agent "non-existent" does not exist in the agents configuration'));
      assert.strictEqual(result.entryAgent, undefined);
    });
  });

  describe('validateExtensionConfiguration', () => {
    const validConfig: ExtensionConfiguration = {
      entryAgent: 'coordinator',
      agents: [
        {
          name: 'coordinator',
          systemPrompt: 'Coordinator prompt',
          description: 'Coordinator',
          useFor: 'Coordination',
          delegationPermissions: { type: 'specific', agents: ['specialist'] },
          toolPermissions: { type: 'all' }
        },
        {
          name: 'specialist',
          systemPrompt: 'Specialist prompt',
          description: 'Specialist',
          useFor: 'Specialization',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        }
      ]
    };

    it('should validate a complete valid extension configuration', () => {
      const result = ConfigurationValidator.validateExtensionConfiguration(validConfig);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should validate configuration without explicit entry agent', () => {
      const configWithoutEntryAgent = {
        agents: validConfig.agents
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(configWithoutEntryAgent);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject configuration without agents array', () => {
      const invalidConfig = { entryAgent: 'coordinator' };

      const result = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Agents must be an array'));
    });

    it('should reject configuration with empty agents array', () => {
      const invalidConfig = { entryAgent: 'coordinator', agents: [] };

      const result = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('At least one agent must be configured'));
    });

    it('should reject configuration with duplicate agent names', () => {
      const invalidConfig = {
        entryAgent: 'coordinator',
        agents: [
          { ...validConfig.agents[0] },
          { ...validConfig.agents[0] } // duplicate
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error => error.includes('Duplicate agent name')));
    });

    it('should reject configuration with invalid entry agent', () => {
      const invalidConfig = {
        ...validConfig,
        entryAgent: 'non-existent'
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.includes('Entry agent "non-existent" does not exist in the agents configuration'));
    });

    it('should reject configuration with invalid delegation references', () => {
      const invalidConfig = {
        entryAgent: 'coordinator',
        agents: [
          {
            ...validConfig.agents[0],
            delegationPermissions: { type: 'specific', agents: ['non-existent'] }
          }
        ]
      };

      const result = ConfigurationValidator.validateExtensionConfiguration(invalidConfig);

      assert.strictEqual(result.isValid, false);
      assert.ok(result.errors.some(error =>
        error.includes('References non-existent agent "non-existent"')
      ));
    });

    it('should reject null or non-object configurations', () => {
      const invalidValues = [null, undefined, 'string', 123, []];

      invalidValues.forEach(value => {
        const result = ConfigurationValidator.validateExtensionConfiguration(value);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.errors.includes('Extension configuration must be an object'));
      });
    });
  });

  describe('getDefaultEntryAgent', () => {
    it('should return first agent name when agents exist', () => {
      const agents: AgentConfiguration[] = [
        {
          name: 'first-agent',
          systemPrompt: 'First prompt',
          description: 'First',
          useFor: 'First use',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'all' }
        },
        {
          name: 'second-agent',
          systemPrompt: 'Second prompt',
          description: 'Second',
          useFor: 'Second use',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'all' }
        }
      ];

      const result = ConfigurationValidator.getDefaultEntryAgent(agents);
      assert.strictEqual(result, 'first-agent');
    });

    it('should return null when no agents exist', () => {
      const result = ConfigurationValidator.getDefaultEntryAgent([]);
      assert.strictEqual(result, null);
    });
  });

  describe('Default configurations', () => {
    it('should have valid default coordinator agent', () => {
      const result = ConfigurationValidator.validateAgentConfiguration(DEFAULT_COORDINATOR_AGENT);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(DEFAULT_COORDINATOR_AGENT.name, 'coordinator');
    });

    it('should have valid default extension configuration', () => {
      const result = ConfigurationValidator.validateExtensionConfiguration(DEFAULT_EXTENSION_CONFIG);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(DEFAULT_EXTENSION_CONFIG.entryAgent, 'coordinator');
      assert.strictEqual(DEFAULT_EXTENSION_CONFIG.agents.length, 1);
      assert.strictEqual(DEFAULT_EXTENSION_CONFIG.agents[0].name, 'coordinator');
    });
  });
});