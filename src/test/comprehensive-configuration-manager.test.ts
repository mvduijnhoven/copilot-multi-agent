/**
 * Comprehensive unit tests for ConfigurationManager
 * Covers edge cases, error scenarios, and entry agent fallback logic
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

suite('Comprehensive ConfigurationManager Tests', () => {
  let configManager: ConfigurationManager;
  let mockWorkspaceConfig: any;
  let mockWorkspace: sinon.SinonStub;
  let mockOnDidChangeConfiguration: sinon.SinonStub;

  const createTestAgent = (name: string, overrides: Partial<AgentConfiguration> = {}): AgentConfiguration => ({
    name,
    systemPrompt: `You are ${name} agent`,
    description: `${name} agent description`,
    useFor: `${name} specific tasks`,
    delegationPermissions: { type: 'none' },
    toolPermissions: { type: 'all' },
    ...overrides
  });

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

  suite('Entry Agent Fallback Logic', () => {
    test('should use first agent when entry agent is empty string', async () => {
      const testAgents = [createTestAgent('first-agent'), createTestAgent('second-agent')];
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('');
      mockWorkspaceConfig.get.withArgs('agents').returns(testAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'first-agent');
      assert.strictEqual(config.agents.length, 2);
    });

    test('should use first agent when entry agent is whitespace only', async () => {
      const testAgents = [createTestAgent('whitespace-fallback')];
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('   \t\n  ');
      mockWorkspaceConfig.get.withArgs('agents').returns(testAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'whitespace-fallback');
    });

    test('should fallback to first agent when configured entry agent does not exist', async () => {
      const testAgents = [createTestAgent('fallback-agent'), createTestAgent('other-agent')];
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns(testAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'fallback-agent');
      assert.strictEqual(config.agents.length, 2);
    });

    test('should handle null entry agent gracefully', async () => {
      const testAgents = [createTestAgent('null-fallback')];
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns(null);
      mockWorkspaceConfig.get.withArgs('agents').returns(testAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'null-fallback');
    });

    test('should handle undefined entry agent gracefully', async () => {
      const testAgents = [createTestAgent('undefined-fallback')];
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns(undefined);
      mockWorkspaceConfig.get.withArgs('agents').returns(testAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'undefined-fallback');
    });
  });

  suite('Configuration Validation Edge Cases', () => {
    test('should handle malformed agents array gracefully', async () => {
      const malformedAgents = [
        createTestAgent('valid-agent'),
        null,
        undefined,
        { name: 'incomplete-agent' }, // missing required fields
        createTestAgent('another-valid-agent')
      ];
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('valid-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns(malformedAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      // Should still return configuration, potentially with fallback behavior
      assert.ok(config);
      assert.ok(Array.isArray(config.agents));
    });

    test('should handle circular references in configuration', async () => {
      const circularAgent: any = createTestAgent('circular-agent');
      circularAgent.self = circularAgent; // Create circular reference
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('circular-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([circularAgent]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.ok(config);
      assert.strictEqual(config.entryAgent, 'circular-agent');
    });

    test('should handle very large configuration gracefully', async () => {
      const manyAgents = Array.from({ length: 50 }, (_, i) => 
        createTestAgent(`agent-${i}`, {
          systemPrompt: 'A'.repeat(1000), // Large system prompt
          description: 'B'.repeat(200)
        })
      );
      
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('agent-25');
      mockWorkspaceConfig.get.withArgs('agents').returns(manyAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'agent-25');
      assert.strictEqual(config.agents.length, 50);
    });
  });

  suite('Error Handling and Recovery', () => {
    test('should recover from VS Code API errors during load', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').throws(new Error('VS Code API error'));
      mockWorkspaceConfig.get.withArgs('agents').throws(new Error('VS Code API error'));

      const config = await configManager.loadConfiguration();

      // Should return default configuration on error
      assert.deepStrictEqual(config, DEFAULT_EXTENSION_CONFIG);
    });

    test('should recover from VS Code API errors during save', async () => {
      const testConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [DEFAULT_COORDINATOR_AGENT]
      };

      mockWorkspaceConfig.update.withArgs('entryAgent').rejects(new Error('Save failed'));
      mockWorkspaceConfig.update.withArgs('agents').rejects(new Error('Save failed'));

      await assert.rejects(
        () => configManager.saveConfiguration(testConfig),
        ConfigurationError
      );
    });

    test('should handle partial save failures', async () => {
      const testConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [DEFAULT_COORDINATOR_AGENT]
      };

      // First update succeeds, second fails
      mockWorkspaceConfig.update.withArgs('entryAgent').resolves();
      mockWorkspaceConfig.update.withArgs('agents').rejects(new Error('Agents save failed'));

      await assert.rejects(
        () => configManager.saveConfiguration(testConfig),
        ConfigurationError
      );
    });

    test('should handle configuration corruption gracefully', async () => {
      // Simulate corrupted configuration data
      mockWorkspaceConfig.get.withArgs('entryAgent').returns({ invalid: 'object' });
      mockWorkspaceConfig.get.withArgs('agents').returns('not-an-array');
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      // Should handle corruption and return valid configuration
      assert.ok(config);
      assert.ok(typeof config.entryAgent === 'string');
      assert.ok(Array.isArray(config.agents));
    });
  });

  suite('Configuration Change Handling', () => {
    test('should handle rapid configuration changes', async () => {
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      // Simulate rapid configuration changes
      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];

      // Fire multiple changes rapidly
      const promises = [
        changeHandler(changeEvent),
        changeHandler(changeEvent),
        changeHandler(changeEvent)
      ];

      await Promise.all(promises);

      // Should handle all changes without errors
      assert.ok(listener.callCount >= 1);
    });

    test('should handle configuration change errors gracefully', async () => {
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      // Simulate error during configuration load
      mockWorkspaceConfig.get.throws(new Error('Configuration load error'));

      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];

      // Should not throw error
      await assert.doesNotReject(() => changeHandler(changeEvent));
    });

    test('should handle listener exceptions gracefully', async () => {
      const faultyListener = sinon.stub().throws(new Error('Listener error'));
      const goodListener = sinon.stub();
      
      configManager.onConfigurationChanged(faultyListener);
      configManager.onConfigurationChanged(goodListener);

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);

      const changeEvent = {
        affectsConfiguration: sinon.stub().returns(true)
      };

      const changeHandler = mockOnDidChangeConfiguration.getCall(0).args[0];

      // Should not throw and should still call good listener
      await assert.doesNotReject(() => changeHandler(changeEvent));
      
      assert.ok(faultyListener.calledOnce);
      assert.ok(goodListener.calledOnce);
    });
  });

  suite('Agent Management Edge Cases', () => {
    test('should handle duplicate agent names during update', async () => {
      const agents = [
        createTestAgent('agent1'),
        createTestAgent('agent2')
      ];

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('agent1');
      mockWorkspaceConfig.get.withArgs('agents').returns(agents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);
      mockWorkspaceConfig.update.resolves();

      // Try to add agent with duplicate name
      const duplicateAgent = createTestAgent('agent1', { description: 'Updated description' });

      await configManager.updateAgentConfiguration('agent1', duplicateAgent);

      // Should update existing agent, not add duplicate
      const updateCall = mockWorkspaceConfig.update.getCall(1); // Second call is for agents
      const savedAgents = updateCall.args[1] as AgentConfiguration[];
      
      assert.strictEqual(savedAgents.length, 2);
      const updatedAgent = savedAgents.find(a => a.name === 'agent1');
      assert.strictEqual(updatedAgent?.description, 'Updated description');
    });

    test('should handle removing non-existent agent gracefully', async () => {
      const agents = [createTestAgent('existing-agent')];

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('existing-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns(agents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      // Should not throw when removing non-existent agent
      await assert.doesNotReject(() => 
        configManager.removeAgentConfiguration('non-existent-agent')
      );
    });

    test('should handle removing entry agent when it is the only agent', async () => {
      const agents = [createTestAgent('only-agent')];

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('only-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns(agents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);
      mockWorkspaceConfig.update.resolves();

      await configManager.removeAgentConfiguration('only-agent');

      // Should reset to default configuration
      assert.ok(mockWorkspaceConfig.update.calledWith('entryAgent', DEFAULT_EXTENSION_CONFIG.entryAgent));
      assert.ok(mockWorkspaceConfig.update.calledWith('agents', DEFAULT_EXTENSION_CONFIG.agents));
    });
  });

  suite('Validation and Fixing', () => {
    test('should fix multiple configuration issues', async () => {
      // Configuration with multiple issues
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('non-existent');
      mockWorkspaceConfig.get.withArgs('agents').returns([
        createTestAgent('valid-agent'),
        null, // Invalid agent
        createTestAgent('another-valid')
      ]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);
      mockWorkspaceConfig.update.resolves();

      const result = await configManager.validateAndFixConfiguration();

      assert.strictEqual(result.fixed, true);
      assert.ok(result.errors.length > 0);
    });

    test('should handle validation errors during fix attempt', async () => {
      mockWorkspaceConfig.get.throws(new Error('Validation error'));

      const result = await configManager.validateAndFixConfiguration();

      assert.strictEqual(result.fixed, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors[0].includes('Failed to validate'));
    });
  });

  suite('Memory and Resource Management', () => {
    test('should properly dispose of resources', () => {
      const disposeSpy = sinon.spy();
      mockOnDidChangeConfiguration.returns({ dispose: disposeSpy });

      const newConfigManager = new ConfigurationManager();
      newConfigManager.dispose();

      assert.ok(disposeSpy.calledOnce);
    });

    test('should handle multiple dispose calls gracefully', () => {
      const disposeSpy = sinon.spy();
      mockOnDidChangeConfiguration.returns({ dispose: disposeSpy });

      const newConfigManager = new ConfigurationManager();
      
      // Multiple dispose calls should not throw
      assert.doesNotThrow(() => {
        newConfigManager.dispose();
        newConfigManager.dispose();
        newConfigManager.dispose();
      });
    });

    test('should clear listeners on dispose', () => {
      const listener = sinon.stub();
      configManager.onConfigurationChanged(listener);

      configManager.dispose();

      // Listeners array should be cleared
      assert.strictEqual(configManager['configurationChangeListeners'].length, 0);
    });
  });

  suite('Special Characters and Encoding', () => {
    test('should handle special characters in agent names', async () => {
      const specialAgents = [
        createTestAgent('agent-with-hyphens'),
        createTestAgent('agent_with_underscores'),
        createTestAgent('agent123'),
        createTestAgent('агент'), // Cyrillic characters
        createTestAgent('代理人') // Chinese characters
      ];

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('agent-with-hyphens');
      mockWorkspaceConfig.get.withArgs('agents').returns(specialAgents);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      const config = await configManager.loadConfiguration();

      assert.strictEqual(config.entryAgent, 'agent-with-hyphens');
      assert.strictEqual(config.agents.length, 5);
    });

    test('should handle unicode in system prompts and descriptions', async () => {
      const unicodeAgent = createTestAgent('unicode-agent', {
        systemPrompt: 'You are an agent with unicode: 🤖 ñáéíóú αβγδε',
        description: 'Agent with émojis and àccénts',
        useFor: 'Tësting ünïcödé support 中文'
      });

      mockWorkspaceConfig.get.withArgs('entryAgent').returns('unicode-agent');
      mockWorkspaceConfig.get.withArgs('agents').returns([unicodeAgent]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);
      mockWorkspaceConfig.update.resolves();

      const config = await configManager.loadConfiguration();
      await configManager.saveConfiguration(config);

      assert.ok(config.agents[0].systemPrompt.includes('🤖'));
      assert.ok(config.agents[0].description.includes('émojis'));
      assert.ok(config.agents[0].useFor.includes('中文'));
    });
  });

  suite('Concurrent Operations', () => {
    test('should handle concurrent load operations', async () => {
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('coordinator');
      mockWorkspaceConfig.get.withArgs('agents').returns([DEFAULT_COORDINATOR_AGENT]);
      mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
      mockWorkspaceConfig.has.withArgs('agents').returns(true);

      // Start multiple load operations concurrently
      const loadPromises = [
        configManager.loadConfiguration(),
        configManager.loadConfiguration(),
        configManager.loadConfiguration()
      ];

      const results = await Promise.all(loadPromises);

      // All should succeed and return consistent results
      results.forEach(config => {
        assert.strictEqual(config.entryAgent, 'coordinator');
        assert.strictEqual(config.agents.length, 1);
      });
    });

    test('should handle concurrent save operations', async () => {
      const testConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [DEFAULT_COORDINATOR_AGENT]
      };

      mockWorkspaceConfig.update.resolves();

      // Start multiple save operations concurrently
      const savePromises = [
        configManager.saveConfiguration(testConfig),
        configManager.saveConfiguration(testConfig),
        configManager.saveConfiguration(testConfig)
      ];

      // All should complete without errors
      await assert.doesNotReject(() => Promise.all(savePromises));
    });
  });
});