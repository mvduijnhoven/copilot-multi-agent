/**
 * Integration tests for entry agent functionality in extension activation
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

// Import extension functions and types
import { 
  activate, 
  deactivate, 
  getExtensionState, 
  isExtensionInitialized
} from '../extension';
import { DEFAULT_EXTENSION_CONFIG } from '../constants';

suite('Entry Agent Integration Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let sandbox: sinon.SinonSandbox;
  let mockWorkspaceConfig: sinon.SinonStubbedInstance<vscode.WorkspaceConfiguration>;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    // Create mock extension context
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub().resolves(),
        keys: sandbox.stub().returns([])
      } as any,
      globalState: {
        get: sandbox.stub().returns(undefined),
        update: sandbox.stub().resolves(),
        setKeysForSync: sandbox.stub(),
        keys: sandbox.stub().returns([])
      } as any,
      extensionPath: '/mock/extension/path',
      extensionUri: vscode.Uri.file('/mock/extension/path'),
      environmentVariableCollection: {} as any,
      asAbsolutePath: sandbox.stub().callsFake((path: string) => `/mock/extension/path/${path}`),
      storageUri: vscode.Uri.file('/mock/storage'),
      globalStorageUri: vscode.Uri.file('/mock/global/storage'),
      logUri: vscode.Uri.file('/mock/logs'),
      storagePath: '/mock/storage',
      globalStoragePath: '/mock/global/storage',
      logPath: '/mock/logs',
      extensionMode: vscode.ExtensionMode.Test,
      extension: {} as any,
      secrets: {} as any,
      languageModelAccessInformation: {} as any
    };

    // Mock VS Code workspace configuration
    mockWorkspaceConfig = {
      get: sandbox.stub(),
      has: sandbox.stub(),
      inspect: sandbox.stub(),
      update: sandbox.stub().resolves()
    } as any;

    // Mock VS Code APIs
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockWorkspaceConfig);
    sandbox.stub(vscode.workspace, 'onDidChangeConfiguration').returns({
      dispose: sandbox.stub()
    } as any);
    sandbox.stub(vscode.chat, 'createChatParticipant').returns({
      iconPath: undefined,
      dispose: sandbox.stub()
    } as any);
    sandbox.stub(vscode.commands, 'registerCommand').returns({
      dispose: sandbox.stub()
    } as any);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves();
    sandbox.stub(vscode.window, 'showErrorMessage').resolves();
    sandbox.stub(vscode.window, 'showWarningMessage').resolves();

    // Set up default configuration responses
    mockWorkspaceConfig.get.withArgs('entryAgent').returns(DEFAULT_EXTENSION_CONFIG.entryAgent);
    mockWorkspaceConfig.get.withArgs('agents').returns(DEFAULT_EXTENSION_CONFIG.agents);
    mockWorkspaceConfig.get.withArgs('showActivationMessage', false).returns(false);
    mockWorkspaceConfig.has.withArgs('entryAgent').returns(true);
    mockWorkspaceConfig.has.withArgs('agents').returns(true);
  });

  teardown(async () => {
    // Clean up extension state
    try {
      await deactivate();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
    
    sandbox.restore();
  });

  suite('Entry Agent Manager Integration', () => {
    test('should initialize entry agent manager during activation', async () => {
      // Act
      await activate(mockContext);

      // Assert
      assert.strictEqual(isExtensionInitialized(), true, 'Extension should be initialized');
      
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      assert.ok(state.entryAgentManager, 'Entry agent manager should be initialized');
    });

    test('should resolve entry agent from configuration', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      const config = await state.configurationManager.loadConfiguration();
      const entryAgent = state.entryAgentManager.getEntryAgent(config);
      
      assert.ok(entryAgent, 'Should resolve entry agent');
      assert.strictEqual(typeof entryAgent.name, 'string', 'Entry agent should have a name');
      assert.strictEqual(typeof entryAgent.systemPrompt, 'string', 'Entry agent should have system prompt');
    });

    test('should handle entry agent fallback when configured agent not found', async () => {
      // Arrange - configure non-existent entry agent
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('nonexistent-agent');

      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      // Test the entry agent manager directly with invalid configuration
      const invalidConfig = {
        entryAgent: 'nonexistent-agent',
        agents: DEFAULT_EXTENSION_CONFIG.agents
      };
      const resolution = await state.entryAgentManager.resolveEntryAgent(invalidConfig);
      
      assert.ok(resolution.agent, 'Should resolve to fallback agent');
      assert.strictEqual(resolution.usedFallback, true, 'Should indicate fallback was used');
      assert.ok(resolution.warnings.length > 0, 'Should have warnings about fallback');
      
      // Should use first agent as fallback
      assert.strictEqual(resolution.agent.name, invalidConfig.agents[0].name, 'Should use first agent as fallback');
    });

    test('should validate entry agent configuration', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      const config = await state.configurationManager.loadConfiguration();
      const isValid = state.entryAgentManager.validateEntryAgent(config.entryAgent, config.agents);
      
      assert.strictEqual(isValid, true, 'Default entry agent configuration should be valid');
    });

    test('should provide entry agent status information', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      const config = await state.configurationManager.loadConfiguration();
      const status = await state.entryAgentManager.getEntryAgentStatus(config);
      
      assert.ok(status, 'Should provide status information');
      assert.strictEqual(typeof status.configured, 'string', 'Should have configured entry agent name');
      assert.strictEqual(typeof status.resolved, 'string', 'Should have resolved entry agent name');
      assert.strictEqual(typeof status.isValid, 'boolean', 'Should have validity status');
      assert.strictEqual(typeof status.usedFallback, 'boolean', 'Should have fallback status');
      assert.ok(Array.isArray(status.availableAgents), 'Should have available agents list');
      assert.ok(Array.isArray(status.errors), 'Should have errors array');
      assert.ok(Array.isArray(status.warnings), 'Should have warnings array');
    });

    test('should handle empty agents configuration gracefully', async () => {
      // Arrange - configure empty agents array
      mockWorkspaceConfig.get.withArgs('agents').returns([]);
      mockWorkspaceConfig.get.withArgs('entryAgent').returns('');

      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      const config = await state.configurationManager.loadConfiguration();
      const resolution = await state.entryAgentManager.resolveEntryAgent(config);
      
      assert.strictEqual(resolution.agent, null, 'Should not resolve any agent');
      assert.strictEqual(resolution.isValid, false, 'Should be invalid');
      assert.ok(resolution.errors.length > 0, 'Should have errors about empty configuration');
    });

    test('should get entry agent candidates', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      const config = await state.configurationManager.loadConfiguration();
      const candidates = state.entryAgentManager.getEntryAgentCandidates(config);
      
      assert.ok(Array.isArray(candidates), 'Should return array of candidates');
      assert.strictEqual(candidates.length, config.agents.length, 'Should return all configured agents as candidates');
      
      candidates.forEach(candidate => {
        assert.strictEqual(typeof candidate.name, 'string', 'Each candidate should have a name');
        assert.strictEqual(typeof candidate.systemPrompt, 'string', 'Each candidate should have system prompt');
      });
    });

    test('should validate agent suitability as entry agent', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      const config = await state.configurationManager.loadConfiguration();
      const firstAgent = config.agents[0];
      
      const suitability = state.entryAgentManager.validateAgentSuitabilityAsEntryAgent(firstAgent);
      
      assert.ok(suitability, 'Should return validation result');
      assert.strictEqual(typeof suitability.isValid, 'boolean', 'Should have validity status');
      assert.ok(Array.isArray(suitability.errors), 'Should have errors array');
      
      // Default configuration should be suitable
      assert.strictEqual(suitability.isValid, true, 'Default agent should be suitable as entry agent');
    });
  });

  suite('Entry Agent Command Integration', () => {
    test('should register entry agent status command', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      assert.ok(registerCommandStub.called, 'Should register commands');
      
      const commandNames = registerCommandStub.getCalls().map((call: any) => call.args[0]);
      assert.ok(commandNames.includes('copilot-multi-agent.showEntryAgentStatus'), 
        'Should register entry agent status command');
    });

    test('should execute entry agent status command', async () => {
      // Arrange
      await activate(mockContext);
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const entryAgentStatusCommandCall = registerCommandStub.getCalls()
        .find((call: any) => call.args[0] === 'copilot-multi-agent.showEntryAgentStatus');
      
      assert.ok(entryAgentStatusCommandCall, 'Entry agent status command should be registered');
      
      const statusHandler = entryAgentStatusCommandCall!.args[1];

      // Act
      await statusHandler();

      // Assert
      const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
      assert.ok(showInfoStub.calledOnce, 'Should show entry agent status information');
      const messageCall = showInfoStub.getCall(0);
      assert.ok(messageCall.args[0].includes('Entry Agent Status'), 
        'Should show entry agent status message');
    });

    test('should include entry agent info in main status command', async () => {
      // Arrange
      await activate(mockContext);
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const statusCommandCall = registerCommandStub.getCalls()
        .find((call: any) => call.args[0] === 'copilot-multi-agent.showStatus');
      
      assert.ok(statusCommandCall, 'Status command should be registered');
      
      const statusHandler = statusCommandCall.args[1];

      // Act
      await statusHandler();

      // Assert
      const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
      assert.ok(showInfoStub.calledOnce, 'Should show status information');
      const messageCall = showInfoStub.getCall(0);
      assert.ok(messageCall.args[0].includes('Entry Agent:'), 
        'Should include entry agent information in status');
    });
  });

  suite('Entry Agent Error Handling', () => {
    test('should handle entry agent manager initialization errors gracefully', async () => {
      // Arrange - this test verifies that even if there are issues, the extension continues
      mockWorkspaceConfig.get.withArgs('entryAgent').returns(null);
      mockWorkspaceConfig.get.withArgs('agents').returns(null);

      // Act & Assert
      await assert.doesNotReject(activate(mockContext), 'Activation should not throw');
      
      // Extension should still be initialized
      assert.strictEqual(isExtensionInitialized(), true, 'Extension should be initialized');
      
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      assert.ok(state.entryAgentManager, 'Entry agent manager should still be initialized');
    });

    test('should handle entry agent resolution errors in status command', async () => {
      // Arrange
      await activate(mockContext);
      
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      // Mock configuration manager to throw error
      sandbox.stub(state.configurationManager, 'loadConfiguration').throws(new Error('Config load error'));
      
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const entryAgentStatusCommandCall = registerCommandStub.getCalls()
        .find((call: any) => call.args[0] === 'copilot-multi-agent.showEntryAgentStatus');
      
      const statusHandler = entryAgentStatusCommandCall!.args[1];

      // Act & Assert
      await assert.doesNotReject(statusHandler(), 'Status command should not throw');
      
      const showErrorStub = vscode.window.showErrorMessage as sinon.SinonStub;
      assert.ok(showErrorStub.calledOnce, 'Should show error message');
    });
  });
});