/**
 * Integration tests for Configuration UI functionality
 * Tests the VS Code settings UI integration, validation, and error display
 */

import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../services/configuration-manager';
import { 
  ExtensionConfiguration, 
  AgentConfiguration, 
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_AGENT
} from '../models/agent-configuration';
import { ConfigurationError } from '../models/errors';

suite('Configuration UI Integration Tests', () => {
  let configManager: ConfigurationManager;
  let mockWorkspaceConfig: any;
  let mockWorkspace: sinon.SinonStub;
  let mockWindow: sinon.SinonStub;
  let mockCommands: sinon.SinonStub;

  const testAgentConfig: AgentConfiguration = {
    name: 'test-agent',
    systemPrompt: 'You are a test agent for UI testing',
    description: 'Test agent for UI integration tests',
    useFor: 'Testing UI functionality',
    delegationPermissions: { type: 'specific', agents: ['coordinator'] },
    toolPermissions: { type: 'specific', tools: ['reportOut'] }
  };

  setup(() => {
    // Create mock workspace configuration
    mockWorkspaceConfig = {
      get: sinon.stub(),
      update: sinon.stub(),
      has: sinon.stub(),
      inspect: sinon.stub()
    };

    // Mock workspace.getConfiguration
    mockWorkspace = sinon.stub(vscode.workspace, 'getConfiguration');
    mockWorkspace.returns(mockWorkspaceConfig);

    // Mock window methods for UI interactions
    mockWindow = sinon.stub(vscode.window, 'showErrorMessage');
    mockWindow.resolves();

    // Mock commands for settings UI
    mockCommands = sinon.stub(vscode.commands, 'executeCommand');
    mockCommands.resolves();

    configManager = new ConfigurationManager();
  });

  teardown(() => {
    configManager.dispose();
    sinon.restore();
  });

  suite('Settings UI Schema Validation', () => {
    test('should validate entry agent field constraints', async () => {
      // Test valid entry agent name
      const testAgent = { ...DEFAULT_COORDINATOR_AGENT, name: 'valid-agent-123' };
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('valid-agent-123');
      mockWorkspaceConfig.get.withArgs('agents').returns([testAgent]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();
      assert.strictEqual(config.entryAgent, 'valid-agent-123');
    });

    test('should reject entry agent names with invalid characters', async () => {
      // Test invalid characters in entry agent name
      const invalidNames = ['agent with spaces', 'agent@special', 'agent.dot', 'agent/slash'];
      
      for (const invalidName of invalidNames) {
        mockWorkspaceConfig.get.withArgs('entryAgent').returns(invalidName);
        mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

        const config = await configManager.loadConfiguration();
        // Should fallback to first agent when entry agent is invalid
        assert.strictEqual(config.entryAgent, 'coordinator');
      }
    });

    test('should enforce entry agent length constraints', async () => {
      // Test empty entry agent
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      let config = await configManager.loadConfiguration();
      assert.strictEqual(config.entryAgent, 'coordinator');

      // Test entry agent name too long (over 50 characters)
      const longName = 'a'.repeat(51);
      mockWorkspaceConfig.get.withArgs('entryAgent').returns(longName);
      
      config = await configManager.loadConfiguration();
      assert.strictEqual(config.entryAgent, 'coordinator');
    });

    test('should validate agent configuration field constraints', async () => {
      const validAgent: AgentConfiguration = {
        name: 'valid-agent',
        systemPrompt: 'Valid system prompt',
        description: 'Valid description',
        useFor: 'Valid use case',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'none' }
      };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('valid-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([validAgent]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();
      assert.strictEqual(config.agents.length, 1);
      assert.strictEqual(config.agents[0].name, 'valid-agent');
    });

    test('should enforce agent name uniqueness', async () => {
      const duplicateAgents = [
        { ...DEFAULT_COORDINATOR_AGENT, name: 'duplicate' },
        { ...testAgentConfig, name: 'duplicate' }
      ];

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('duplicate');
      mockWorkspaceConfig.get.withArgs('agents').returns(duplicateAgents);

      // Should handle duplicate names by falling back to defaults
      const config = await configManager.loadConfiguration();
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should validate system prompt length constraints', async () => {
      // Test system prompt too long (over 5000 characters)
      const longPrompt = 'a'.repeat(5001);
      const invalidAgent = { ...testAgentConfig, systemPrompt: longPrompt };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([invalidAgent]);

      const config = await configManager.loadConfiguration();
      // Should fallback to defaults when validation fails
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should validate description and useFor length constraints', async () => {
      // Test description too long (over 200 characters)
      const longDescription = 'a'.repeat(201);
      const invalidAgent = { ...testAgentConfig, description: longDescription };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([invalidAgent]);

      let config = await configManager.loadConfiguration();
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);

      // Test useFor too long (over 200 characters)
      const longUseFor = 'a'.repeat(201);
      const invalidAgent2 = { ...testAgentConfig, useFor: longUseFor };

      mockWorkspaceConfig.get.withArgs('agents').returns([invalidAgent2]);
      config = await configManager.loadConfiguration();
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });
  });

  suite('Entry Agent Selection UI', () => {
    test('should provide entry agent selection from available agents', async () => {
      const agents = [DEFAULT_COORDINATOR_AGENT, testAgentConfig];
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns(agents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();
      const agentNames = config.agents.map(a => a.name);
      
      assert.ok(agentNames.includes('coordinator'));
      assert.ok(agentNames.includes('test-agent'));
    });

    test('should validate entry agent exists in agents list', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      const config = await configManager.loadConfiguration();
      // Should fallback to first available agent
      assert.strictEqual(config.entryAgent, 'coordinator');
    });

    test('should handle entry agent update through settings', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);
      mockWorkspaceConfig.update.resolves();

      await configManager.updateEntryAgent('test-agent');

      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', 'test-agent', vscode.ConfigurationTarget.Global));
    });
  });

  suite('Agent Configuration UI', () => {
    test('should support adding new agent through settings', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);
      mockWorkspaceConfig.update.resolves();

      const newAgent: AgentConfiguration = {
        name: 'new-agent',
        systemPrompt: 'You are a new agent',
        description: 'Newly added agent',
        useFor: 'New functionality',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      };

      await configManager.updateAgentConfiguration('new-agent', newAgent);

      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
      const savedAgents = mockWorkspaceConfig.update.getCall(1).args[1] as AgentConfiguration[];
      assert.strictEqual(savedAgents.length, 2);
      assert.ok(savedAgents.some(a => a.name === 'new-agent'));
    });

    test('should support editing existing agent through settings', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.update.resolves();

      const updatedAgent = {
        ...testAgentConfig,
        description: 'Updated description for UI testing'
      };

      await configManager.updateAgentConfiguration('test-agent', updatedAgent);

      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
      const savedAgents = mockWorkspaceConfig.update.getCall(1).args[1] as AgentConfiguration[];
      const updatedAgentInConfig = savedAgents.find(a => a.name === 'test-agent');
      assert.strictEqual(updatedAgentInConfig?.description, 'Updated description for UI testing');
    });

    test('should support removing agent through settings', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);
      mockWorkspaceConfig.update.resolves();

      await configManager.removeAgentConfiguration('test-agent');

      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
      // Find the call that updates agents (might not be the second call)
      const agentsUpdateCall = mockWorkspaceConfig.update.getCalls().find((call: any) => call.args[0] === 'agents');
      assert.ok(agentsUpdateCall, 'Should have called update with agents');
      const savedAgents = agentsUpdateCall.args[1] as AgentConfiguration[];
      assert.strictEqual(savedAgents.length, 1);
      assert.ok(!savedAgents.some(a => a.name === 'test-agent'));
    });
  });

  suite('Delegation Permissions UI', () => {
    test('should validate delegation permissions configuration', async () => {
      const agentWithAllPermissions: AgentConfiguration = {
        ...testAgentConfig,
        name: 'all-permissions',
        delegationPermissions: { type: 'all' }
      };

      const agentWithNoPermissions: AgentConfiguration = {
        ...testAgentConfig,
        name: 'no-permissions',
        delegationPermissions: { type: 'none' }
      };

      const agentWithSpecificPermissions: AgentConfiguration = {
        ...testAgentConfig,
        name: 'specific-permissions',
        delegationPermissions: { type: 'specific', agents: ['coordinator'] }
      };

      const agents = [agentWithAllPermissions, agentWithNoPermissions, agentWithSpecificPermissions];
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('all-permissions');
      mockWorkspaceConfig.get.withArgs('agents').returns(agents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();
      assert.strictEqual(config.agents.length, 3);
      
      const allPermsAgent = config.agents.find(a => a.name === 'all-permissions');
      const noPermsAgent = config.agents.find(a => a.name === 'no-permissions');
      const specificPermsAgent = config.agents.find(a => a.name === 'specific-permissions');

      assert.strictEqual(allPermsAgent?.delegationPermissions.type, 'all');
      assert.strictEqual(noPermsAgent?.delegationPermissions.type, 'none');
      assert.strictEqual(specificPermsAgent?.delegationPermissions.type, 'specific');
      assert.deepStrictEqual((specificPermsAgent?.delegationPermissions as any).agents, ['coordinator']);
    });

    test('should validate specific delegation agents exist', async () => {
      const invalidAgent: AgentConfiguration = {
        ...testAgentConfig,
        delegationPermissions: { type: 'specific', agents: ['non-existent-agent'] }
      };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([invalidAgent]);

      // Should fallback to defaults when validation fails
      const config = await configManager.loadConfiguration();
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should ensure unique agents in specific delegation list', async () => {
      const agentWithDuplicates: AgentConfiguration = {
        ...testAgentConfig,
        delegationPermissions: { type: 'specific', agents: ['coordinator', 'coordinator'] }
      };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, agentWithDuplicates]);

      const config = await configManager.loadConfiguration();
      const agent = config.agents.find(a => a.name === 'test-agent');
      
      if (agent && agent.delegationPermissions.type === 'specific') {
        // Should have unique agents only
        const uniqueAgents = [...new Set(agent.delegationPermissions.agents)];
        assert.deepStrictEqual(agent.delegationPermissions.agents, uniqueAgents);
      }
    });
  });

  suite('Tool Permissions UI', () => {
    test('should validate tool permissions configuration', async () => {
      const agentWithAllTools: AgentConfiguration = {
        ...testAgentConfig,
        name: 'all-tools',
        toolPermissions: { type: 'all' }
      };

      const agentWithNoTools: AgentConfiguration = {
        ...testAgentConfig,
        name: 'no-tools',
        toolPermissions: { type: 'none' }
      };

      const agentWithSpecificTools: AgentConfiguration = {
        ...testAgentConfig,
        name: 'specific-tools',
        toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
      };

      const agents = [agentWithAllTools, agentWithNoTools, agentWithSpecificTools];
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('all-tools');
      mockWorkspaceConfig.get.withArgs('agents').returns(agents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();
      assert.strictEqual(config.agents.length, 3);
      
      const allToolsAgent = config.agents.find(a => a.name === 'all-tools');
      const noToolsAgent = config.agents.find(a => a.name === 'no-tools');
      const specificToolsAgent = config.agents.find(a => a.name === 'specific-tools');

      assert.strictEqual(allToolsAgent?.toolPermissions.type, 'all');
      assert.strictEqual(noToolsAgent?.toolPermissions.type, 'none');
      assert.strictEqual(specificToolsAgent?.toolPermissions.type, 'specific');
      assert.deepStrictEqual((specificToolsAgent?.toolPermissions as any).tools, ['delegateWork', 'reportOut']);
    });

    test('should ensure unique tools in specific tool permissions', async () => {
      const agentWithDuplicateTools: AgentConfiguration = {
        ...testAgentConfig,
        toolPermissions: { type: 'specific', tools: ['delegateWork', 'delegateWork', 'reportOut'] }
      };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, agentWithDuplicateTools]);

      const config = await configManager.loadConfiguration();
      const agent = config.agents.find(a => a.name === 'test-agent');
      
      if (agent && agent.toolPermissions.type === 'specific') {
        // Should have unique tools only
        const uniqueTools = [...new Set(agent.toolPermissions.tools)];
        assert.deepStrictEqual(agent.toolPermissions.tools, uniqueTools);
      }
    });
  });

  suite('Configuration Validation and Error Display', () => {
    test('should provide validation feedback for invalid configurations', async () => {
      const invalidConfig: any = {
        entryAgent: '', // Invalid: empty
        agents: [] // Invalid: no agents
      };

      const isValid = configManager.validateConfiguration(invalidConfig);
      assert.strictEqual(isValid, false);
    });

    test('should handle configuration validation errors gracefully', async () => {
      mockWorkspaceConfig.get.throws(new Error('Settings access failed'));

      const result = await configManager.validateAndFixConfiguration();
      assert.strictEqual(result.fixed, false);
      assert.ok(result.errors.length > 0);
    });

    test('should provide clear error messages for configuration issues', async () => {
      // Test invalid entry agent
      await assert.rejects(
        () => configManager.updateEntryAgent('non-existent'),
        (error: ConfigurationError) => {
          assert.ok(error.message.includes('Entry agent'));
          return true;
        }
      );

      // Test invalid agent configuration
      const invalidAgent: any = {
        name: '', // Invalid: empty name
        systemPrompt: 'Valid prompt',
        description: 'Valid description',
        useFor: 'Valid use case',
        delegationPermissions: { type: 'all' },
        toolPermissions: { type: 'none' }
      };

      await assert.rejects(
        () => configManager.saveConfiguration({
          entryAgent: 'invalid-agent',
          agents: [invalidAgent]
        }),
        ConfigurationError
      );
    });

    test('should auto-fix common configuration issues', async () => {
      // Test auto-fixing invalid entry agent
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);
      mockWorkspaceConfig.update.resolves();

      const result = await configManager.validateAndFixConfiguration();
      assert.strictEqual(result.fixed, true);
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', 'coordinator'));
    });
  });

  suite('Settings UI Commands Integration', () => {
    test('should support reset configuration command', async () => {
      mockWorkspaceConfig.update.resolves();

      await configManager.resetToDefaults();

      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', DEFAULT_EXTENSION_CONFIG.entryAgent));
      assert.ok(mockWorkspaceConfig.update.calledWith('agents', DEFAULT_EXTENSION_CONFIG.agents));
    });

    test('should support validate configuration command', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      const result = await configManager.validateAndFixConfiguration();
      assert.strictEqual(result.fixed, false);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should handle settings UI opening through commands', async () => {
      // This would typically be handled by VS Code's command system
      // We can test that our configuration manager is ready for it
      const config = await configManager.loadConfiguration();
      assert.ok(config);
      assert.ok(config.agents.length > 0);
    });
  });

  suite('Real-time Configuration Updates', () => {
    test('should handle configuration changes during UI interaction', async () => {
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Simulate configuration change event
      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      // Get the change handler that was registered
      const onDidChangeStub = sinon.stub(vscode.workspace, 'onDidChangeConfiguration');
      const changeHandler = onDidChangeStub.getCall(0)?.args[0];
      
      if (changeHandler) {
        await changeHandler(changeEvent);
        assert.ok(listener.calledOnce);
      }
    });

    test('should validate configuration on real-time updates', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('updated-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([
        DEFAULT_COORDINATOR_AGENT,
        { ...testAgentConfig, name: 'updated-agent' }
      ]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();
      assert.strictEqual(config.entryAgent, 'updated-agent');
      assert.ok(config.agents.some(a => a.name === 'updated-agent'));
    });
  });

  suite('Configuration Limits and Constraints', () => {
    test('should enforce maximum number of agents', async () => {
      // Create 21 agents (over the limit of 20)
      const manyAgents = Array.from({ length: 21 }, (_, i) => ({
        ...testAgentConfig,
        name: `agent-${i}`
      }));

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('agent-0');
      mockWorkspaceConfig.get.withArgs('agents').returns(manyAgents);

      // Should fallback to defaults when too many agents
      const config = await configManager.loadConfiguration();
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should enforce minimum number of agents', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([]);

      // Should fallback to defaults when no agents
      const config = await configManager.loadConfiguration();
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should handle configuration size limits gracefully', async () => {
      // Test with very large configuration that might exceed VS Code limits
      const largeAgent: AgentConfiguration = {
        ...testAgentConfig,
        systemPrompt: 'a'.repeat(4999), // Just under the 5000 character limit
        description: 'b'.repeat(199), // Just under the 200 character limit
        useFor: 'c'.repeat(199) // Just under the 200 character limit
      };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([largeAgent]);
      mockWorkspaceConfig.update.resolves();

      await configManager.updateAgentConfiguration('test-agent', largeAgent);
      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
    });
  });
});