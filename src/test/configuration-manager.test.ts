/**
 * Unit tests for ConfigurationManager
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

suite('ConfigurationManager Tests', () => {
  let configManager: ConfigurationManager;
  let mockWorkspaceConfig: any;
  let mockWorkspace: sinon.SinonStub;
  let mockOnDidChangeConfiguration: sinon.SinonStub;

  const testAgentConfig: AgentConfiguration = {
    name: 'test-agent',
    systemPrompt: 'You are a test agent',
    description: 'Test agent for unit tests',
    useFor: 'Testing purposes',
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'all' }
  };

  const testExtensionConfig: ExtensionConfiguration = {
    entryAgent: 'coordinator',
    agents: [DEFAULT_COORDINATOR_AGENT, testAgentConfig]
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

    // Mock configuration change events
    mockOnDidChangeConfiguration = sinon.stub(vscode.workspace, 'onDidChangeConfiguration');
    mockOnDidChangeConfiguration.returns({ dispose: sinon.stub() });

    configManager = new ConfigurationManager();
  });

  teardown(() => {
    configManager.dispose();
    sinon.restore();
  });

  suite('loadConfiguration', () => {
    test('should load valid configuration from VS Code settings', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const config = await configManager.loadConfiguration();

      // Assert
      assert.strictEqual(config.entryAgent, 'coordinator');
      assert.strictEqual(config.agents.length, 1);
      assert.strictEqual(config.agents[0].name, 'coordinator');
    });

    test('should return default configuration when no settings exist', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns(undefined);
      mockWorkspaceConfig.get.withArgs('agents').returns([]);

      // Act
      const config = await configManager.loadConfiguration();

      // Assert
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should handle invalid entry agent by falling back to first agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const config = await configManager.loadConfiguration();

      // Assert
      assert.strictEqual(config.entryAgent, 'coordinator'); // Should fallback to first agent
      assert.strictEqual(config.agents.length, 1);
    });

    test('should handle empty entry agent by using first agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const config = await configManager.loadConfiguration();

      // Assert
      assert.strictEqual(config.entryAgent, 'coordinator');
    });

    test('should return default config when loading fails', async () => {
      // Arrange
      mockWorkspaceConfig.get.throws(new Error('Settings access failed'));

      // Act
      const config = await configManager.loadConfiguration();

      // Assert
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });
  });

  suite('saveConfiguration', () => {
    test('should save valid configuration to VS Code settings', async () => {
      // Arrange
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.saveConfiguration(testExtensionConfig);

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', 'coordinator', vscode.ConfigurationTarget.Global));
      assert.ok(mockWorkspaceConfig.update.calledWith('agents', testExtensionConfig.agents, vscode.ConfigurationTarget.Global));
    });

    test('should reject invalid configuration', async () => {
      // Arrange
      const invalidConfig: any = {
        entryAgent: '',
        agents: [] // Empty agents array is invalid
      };

      // Act & Assert
      await assert.rejects(
        () => configManager.saveConfiguration(invalidConfig),
        ConfigurationError
      );
    });

    test('should reject configuration with invalid entry agent', async () => {
      // Arrange
      const invalidConfig: ExtensionConfiguration = {
        entryAgent: 'non-existent',
        agents: [DEFAULT_COORDINATOR_AGENT]
      };

      // Act & Assert
      await assert.rejects(
        () => configManager.saveConfiguration(invalidConfig),
        ConfigurationError
      );
    });

    test('should handle VS Code update failures', async () => {
      // Arrange
      mockWorkspaceConfig.update.rejects(new Error('Update failed'));

      // Act & Assert
      await assert.rejects(
        () => configManager.saveConfiguration(testExtensionConfig),
        ConfigurationError
      );
    });
  });

  suite('validateConfiguration', () => {
    test('should return true for valid configuration', () => {
      // Act
      const isValid = configManager.validateConfiguration(testExtensionConfig);

      // Assert
      assert.strictEqual(isValid, true);
    });

    test('should return false for invalid configuration', () => {
      // Arrange
      const invalidConfig: any = {
        entryAgent: '',
        agents: []
      };

      // Act
      const isValid = configManager.validateConfiguration(invalidConfig);

      // Assert
      assert.strictEqual(isValid, false);
    });
  });

  suite('getDefaultConfiguration', () => {
    test('should return default configuration', () => {
      // Act
      const defaultConfig = configManager.getDefaultConfiguration();

      // Assert
      assert.deepStrictEqual(defaultConfig, DEFAULT_EXTENSION_CONFIG);
    });
  });

  suite('getEntryAgent', () => {
    test('should return entry agent configuration', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const entryAgent = await configManager.getEntryAgent();

      // Assert
      assert.strictEqual(entryAgent?.name, 'coordinator');
    });

    test('should return null when entry agent not found', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const entryAgent = await configManager.getEntryAgent();

      // Assert
      assert.strictEqual(entryAgent, null);
    });

    test('should return null when no entry agent configured', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const entryAgent = await configManager.getEntryAgent();

      // Assert
      assert.strictEqual(entryAgent, null);
    });
  });

  suite('getAgentConfiguration', () => {
    test('should return specific agent configuration', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);

      // Act
      const agent = await configManager.getAgentConfiguration('test-agent');

      // Assert
      assert.strictEqual(agent?.name, 'test-agent');
    });

    test('should return null for non-existent agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const agent = await configManager.getAgentConfiguration('non-existent');

      // Assert
      assert.strictEqual(agent, null);
    });
  });

  suite('updateAgentConfiguration', () => {
    test('should update existing agent configuration', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.update.resolves();

      const updatedAgent: AgentConfiguration = {
        ...testAgentConfig,
        description: 'Updated test agent'
      };

      // Act
      await configManager.updateAgentConfiguration('test-agent', updatedAgent);

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
      const savedAgents = mockWorkspaceConfig.update.getCall(1).args[1] as AgentConfiguration[];
      const updatedAgentInConfig = savedAgents.find(a => a.name === 'test-agent');
      assert.strictEqual(updatedAgentInConfig?.description, 'Updated test agent');
    });

    test('should add new agent configuration', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.updateAgentConfiguration('new-agent', testAgentConfig);

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
      const savedAgents = mockWorkspaceConfig.update.getCall(1).args[1] as AgentConfiguration[];
      assert.strictEqual(savedAgents.length, 2);
      assert.ok(savedAgents.some(a => a.name === 'test-agent'));
    });
  });

  suite('removeAgentConfiguration', () => {
    test('should remove agent configuration', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.removeAgentConfiguration('test-agent');

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('agents'));
      const savedAgents = mockWorkspaceConfig.update.getCall(1).args[1] as AgentConfiguration[];
      assert.strictEqual(savedAgents.length, 1);
      assert.ok(!savedAgents.some(a => a.name === 'test-agent'));
    });

    test('should update entry agent when removing current entry agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.removeAgentConfiguration('test-agent');

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', 'coordinator'));
    });

    test('should reset to default when removing last agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('test-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([testAgentConfig]);
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.removeAgentConfiguration('test-agent');

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', DEFAULT_EXTENSION_CONFIG.entryAgent));
      assert.ok(mockWorkspaceConfig.update.calledWith('agents', DEFAULT_EXTENSION_CONFIG.agents));
    });
  });

  suite('getAllAgentNames', () => {
    test('should return all agent names', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);

      // Act
      const names = await configManager.getAllAgentNames();

      // Assert
      assert.deepStrictEqual(names, ['coordinator', 'test-agent']);
    });

    test('should return empty array when no agents configured', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('');
      mockWorkspaceConfig.get.withArgs('agents').returns([]);

      // Act
      const names = await configManager.getAllAgentNames();

      // Assert
      assert.deepStrictEqual(names, []);
    });
  });

  suite('updateEntryAgent', () => {
    test('should update entry agent to valid agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT, testAgentConfig]);
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.updateEntryAgent('test-agent');

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', 'test-agent'));
    });

    test('should reject invalid entry agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act & Assert
      await assert.rejects(
        () => configManager.updateEntryAgent('non-existent'),
        ConfigurationError
      );
    });
  });

  suite('resetToDefaults', () => {
    test('should reset configuration to defaults', async () => {
      // Arrange
      mockWorkspaceConfig.update.resolves();

      // Act
      await configManager.resetToDefaults();

      // Assert
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', DEFAULT_EXTENSION_CONFIG.entryAgent));
      assert.ok(mockWorkspaceConfig.update.calledWith('agents', DEFAULT_EXTENSION_CONFIG.agents));
    });
  });

  suite('validateAndFixConfiguration', () => {
    test('should return no fixes needed for valid configuration', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Act
      const result = await configManager.validateAndFixConfiguration();

      // Assert
      assert.strictEqual(result.fixed, false);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should fix invalid entry agent', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);
      mockWorkspaceConfig.update.resolves();

      // Act
      const result = await configManager.validateAndFixConfiguration();

      // Assert
      assert.strictEqual(result.fixed, true);
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', 'coordinator'));
    });

    test('should handle validation errors gracefully', async () => {
      // Arrange
      mockWorkspaceConfig.get.throws(new Error('Settings access failed'));

      // Act
      const result = await configManager.validateAndFixConfiguration();

      // Assert
      assert.strictEqual(result.fixed, false);
      assert.ok(result.errors.length > 0);
    });
  });

  suite('configuration change handling', () => {
    test('should register configuration change listener', () => {
      // Assert
      assert.ok(mockOnDidChangeConfiguration.calledOnce);
    });

    test('should notify listeners on configuration change', async () => {
      // Arrange
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Simulate configuration change event
      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      // Act
      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];
      await changeHandler(changeEvent);

      // Assert
      assert.ok(listener.calledOnce);
      assert.ok(changeEvent.affectsConfiguration.calledWith('copilotMultiAgent'));
    });

    test('should not notify listeners for unrelated configuration changes', async () => {
      // Arrange
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      // Simulate unrelated configuration change event
      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(false)
      };

      // Act
      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];
      await changeHandler(changeEvent);

      // Assert
      assert.ok(listener.notCalled);
    });

    test('should handle listener errors gracefully', async () => {
      // Arrange
      const faultyListener = sinon.stub().throws(new Error('Listener error'));
      configManager.onConfigurationChanged(faultyListener);

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      // Simulate configuration change event
      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      // Act & Assert (should not throw)
      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];
      await changeHandler(changeEvent);

      assert.ok(faultyListener.calledOnce);
    });

    test('should remove configuration change listener', () => {
      // Arrange
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      // Act
      configManager.removeConfigurationChangeListener(listener);

      // Assert - listener should not be called after removal
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];
      changeHandler(changeEvent);

      assert.ok(listener.notCalled);
    });
  });

  suite('dispose', () => {
    test('should dispose of all resources', () => {
      // Arrange
      const disposeSpy = sinon.spy();
      mockOnDidChangeConfiguration.returns({ dispose: disposeSpy });

      const newConfigManager = new ConfigurationManager();

      // Act
      newConfigManager.dispose();

      // Assert
      assert.ok(disposeSpy.calledOnce);
    });

    test('should clear all listeners on dispose', () => {
      // Arrange
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      // Act
      configManager.dispose();

      // Assert - listeners should be cleared
      assert.strictEqual(configManager['configurationChangeListeners'].length, 0);
    });
  });
});