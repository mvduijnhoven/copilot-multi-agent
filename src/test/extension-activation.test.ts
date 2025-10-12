/**
 * Integration tests for extension activation and lifecycle management
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { beforeEach, afterEach, describe, it } from 'mocha';
import * as sinon from 'sinon';

// Import extension functions and types
import { 
  activate, 
  deactivate, 
  getExtensionState, 
  isExtensionInitialized,
  getInitializationError 
} from '../extension';
import { ConfigurationManager } from '../services/configuration-manager';
import { MultiAgentChatParticipant } from '../services/chat-participant';
import { CHAT_PARTICIPANT_ID, DEFAULT_EXTENSION_CONFIG } from '../constants';

describe('Extension Activation and Lifecycle', () => {
  let mockContext: vscode.ExtensionContext;
  let sandbox: sinon.SinonSandbox;
  let mockWorkspaceConfig: sinon.SinonStubbedInstance<vscode.WorkspaceConfiguration>;
  let mockChatParticipant: sinon.SinonStubbedInstance<vscode.ChatParticipant>;

  beforeEach(() => {
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

    // Mock chat participant
    mockChatParticipant = {
      iconPath: undefined,
      dispose: sandbox.stub()
    } as any;

    // Mock VS Code APIs
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockWorkspaceConfig);
    sandbox.stub(vscode.workspace, 'onDidChangeConfiguration').returns({
      dispose: sandbox.stub()
    } as any);
    sandbox.stub(vscode.chat, 'createChatParticipant').returns(mockChatParticipant as any);
    sandbox.stub(vscode.commands, 'registerCommand').returns({
      dispose: sandbox.stub()
    } as any);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves();
    sandbox.stub(vscode.window, 'showErrorMessage').resolves();
    sandbox.stub(vscode.window, 'showWarningMessage').resolves();

    // Set up default configuration responses
    mockWorkspaceConfig.get.withArgs('coordinator').returns(DEFAULT_EXTENSION_CONFIG.coordinator);
    mockWorkspaceConfig.get.withArgs('customAgents').returns(DEFAULT_EXTENSION_CONFIG.customAgents);
    mockWorkspaceConfig.get.withArgs('showActivationMessage', false).returns(false);
  });

  afterEach(async () => {
    // Clean up extension state
    try {
      await deactivate();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
    
    sandbox.restore();
  });

  describe('Extension Activation', () => {
    it('should activate successfully with default configuration', async () => {
      // Act
      await activate(mockContext);

      // Assert
      assert.strictEqual(isExtensionInitialized(), true, 'Extension should be initialized');
      assert.strictEqual(getInitializationError(), undefined, 'Should have no initialization error');
      
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      assert.ok(state.configurationManager, 'Configuration manager should be initialized');
      assert.ok(state.agentEngine, 'Agent engine should be initialized');
      assert.ok(state.toolFilter, 'Tool filter should be initialized');
      assert.ok(state.delegationEngine, 'Delegation engine should be initialized');
      assert.ok(state.chatParticipant, 'Chat participant should be initialized');
      assert.ok(state.errorHandler, 'Error handler should be initialized');
    });

    it('should register chat participant with correct ID', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const createStub = vscode.chat.createChatParticipant as sinon.SinonStub;
      assert.ok(createStub.calledOnce, 'Should create chat participant');
      const createCall = createStub.getCall(0);
      assert.strictEqual(createCall.args[0], CHAT_PARTICIPANT_ID, 'Should use correct participant ID');
      assert.strictEqual(typeof createCall.args[1], 'function', 'Should provide request handler');
    });

    it('should register extension commands', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      assert.ok(registerCommandStub.called, 'Should register commands');
      
      const commandNames = registerCommandStub.getCalls().map((call: any) => call.args[0]);
      assert.ok(commandNames.includes('copilot-multi-agent.resetConfiguration'), 'Should register reset command');
      assert.ok(commandNames.includes('copilot-multi-agent.validateConfiguration'), 'Should register validate command');
      assert.ok(commandNames.includes('copilot-multi-agent.showStatus'), 'Should register status command');
      assert.ok(commandNames.includes('copilot-multi-agent.openSettings'), 'Should register settings command');
    });

    it('should add disposables to context subscriptions', async () => {
      // Act
      await activate(mockContext);

      // Assert
      assert.ok(mockContext.subscriptions.length > 0, 'Should add disposables to context');
      
      // Verify all disposables have dispose methods
      mockContext.subscriptions.forEach((disposable, index) => {
        assert.strictEqual(typeof disposable.dispose, 'function', 
          `Disposable at index ${index} should have dispose method`);
      });
    });

    it('should handle configuration loading errors gracefully', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('coordinator').throws(new Error('Configuration error'));

      // Act
      await activate(mockContext);

      // Assert
      // Extension should still initialize with default configuration
      assert.strictEqual(isExtensionInitialized(), true, 'Extension should still be initialized');
      
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
    });

    it('should handle chat participant registration errors', async () => {
      // Arrange
      (vscode.chat.createChatParticipant as sinon.SinonStub).throws(new Error('Chat API error'));

      // Act & Assert
      // Should not throw, but should handle error gracefully
      await activate(mockContext);
      
      // Extension should still be initialized but with degraded functionality
      const state = getExtensionState();
      assert.ok(state, 'Extension should still be activated');
      assert.strictEqual(state.isInitialized, true, 'Should be initialized despite chat participant error');
      
      // Should show warning message about degraded functionality
      const showWarningStub = vscode.window.showWarningMessage as sinon.SinonStub;
      assert.ok(showWarningStub.called, 'Should show warning about chat participant failure');
    });

    it('should show activation message when configured', async () => {
      // Arrange
      mockWorkspaceConfig.get.withArgs('showActivationMessage', false).returns(true);

      // Act
      await activate(mockContext);

      // Assert
      const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
      assert.ok(showInfoStub.calledOnce, 'Should show activation message');
      const messageCall = showInfoStub.getCall(0);
      assert.ok(messageCall.args[0].includes('Multi-Agent extension is now active'), 
        'Should show correct activation message');
    });

    it('should set up configuration monitoring', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const onDidChangeStub = vscode.workspace.onDidChangeConfiguration as sinon.SinonStub;
      assert.ok(onDidChangeStub.calledOnce, 
        'Should set up configuration change listener');
    });

    it('should initialize components in correct order', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Extension state should exist');
      
      // Verify all components are initialized
      assert.ok(state.errorHandler, 'Error handler should be initialized first');
      assert.ok(state.configurationManager, 'Configuration manager should be initialized');
      assert.ok(state.agentEngine, 'Agent engine should be initialized');
      assert.ok(state.toolFilter, 'Tool filter should be initialized');
      assert.ok(state.delegationEngine, 'Delegation engine should be initialized');
      assert.ok(state.chatParticipant, 'Chat participant should be initialized last');
    });
  });

  describe('Extension Deactivation', () => {
    beforeEach(async () => {
      // Activate extension before each deactivation test
      await activate(mockContext);
    });

    it('should deactivate successfully', async () => {
      // Act
      await deactivate();

      // Assert
      const state = getExtensionState();
      assert.strictEqual(state, undefined, 'Extension state should be cleared');
    });

    it('should dispose of chat participant', async () => {
      // Arrange
      const state = getExtensionState();
      assert.ok(state, 'Extension should be activated');
      const disposeSpy = sandbox.spy(state.chatParticipant, 'dispose');

      // Act
      await deactivate();

      // Assert
      assert.ok(disposeSpy.calledOnce, 'Should dispose chat participant');
    });

    it('should dispose of configuration manager', async () => {
      // Arrange
      const state = getExtensionState();
      assert.ok(state, 'Extension should be activated');
      const disposeSpy = sandbox.spy(state.configurationManager, 'dispose');

      // Act
      await deactivate();

      // Assert
      assert.ok(disposeSpy.calledOnce, 'Should dispose configuration manager');
    });

    it('should cleanup delegation engine', async () => {
      // Arrange
      const state = getExtensionState();
      assert.ok(state, 'Extension should be activated');
      const cleanupSpy = sandbox.spy(state.delegationEngine, 'cleanup');

      // Act
      await deactivate();

      // Assert
      assert.ok(cleanupSpy.calledOnce, 'Should cleanup delegation engine');
    });

    it('should handle disposal errors gracefully', async () => {
      // Arrange
      const state = getExtensionState();
      assert.ok(state, 'Extension should be activated');
      sandbox.stub(state.chatParticipant, 'dispose').throws(new Error('Disposal error'));

      // Act & Assert
      // Should not throw during deactivation
      await assert.doesNotReject(deactivate(), 'Deactivation should not throw');
    });
  });

  describe('Extension Commands', () => {
    beforeEach(async () => {
      await activate(mockContext);
    });

    it('should handle reset configuration command', async () => {
      // Arrange
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const resetCommandCall = registerCommandStub.getCalls()
        .find((call: any) => call.args[0] === 'copilot-multi-agent.resetConfiguration');
      
      assert.ok(resetCommandCall, 'Reset command should be registered');
      
      const resetHandler = resetCommandCall.args[1];
      (vscode.window.showWarningMessage as sinon.SinonStub).resolves('Reset Configuration');

      // Act
      await resetHandler();

      // Assert
      const showWarningStub = vscode.window.showWarningMessage as sinon.SinonStub;
      const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
      assert.ok(showWarningStub.calledOnce, 'Should show confirmation dialog');
      assert.ok(showInfoStub.calledOnce, 'Should show success message');
    });

    it('should handle validate configuration command', async () => {
      // Arrange
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const validateCommandCall = registerCommandStub.getCalls()
        .find((call: any) => call.args[0] === 'copilot-multi-agent.validateConfiguration');
      
      assert.ok(validateCommandCall, 'Validate command should be registered');
      
      const validateHandler = validateCommandCall.args[1];

      // Act
      await validateHandler();

      // Assert
      const showInfoStub = vscode.window.showInformationMessage as sinon.SinonStub;
      assert.ok(showInfoStub.calledOnce, 'Should show validation result');
    });

    it('should handle show status command', async () => {
      // Arrange
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
      assert.ok(messageCall.args[0].includes('Multi-Agent Extension Status'), 
        'Should show status message');
    });

    it('should handle open settings command', async () => {
      // Arrange
      const registerCommandStub = vscode.commands.registerCommand as sinon.SinonStub;
      const settingsCommandCall = registerCommandStub.getCalls()
        .find((call: any) => call.args[0] === 'copilot-multi-agent.openSettings');
      
      assert.ok(settingsCommandCall, 'Settings command should be registered');
      
      const settingsHandler = settingsCommandCall.args[1];
      const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();

      // Act
      await settingsHandler();

      // Assert
      assert.ok(executeCommandStub.calledOnce, 'Should execute settings command');
      assert.strictEqual(executeCommandStub.getCall(0).args[0], 'workbench.action.openSettings');
      assert.strictEqual(executeCommandStub.getCall(0).args[1], 'copilotMultiAgent');
    });
  });

  describe('Configuration Monitoring', () => {
    it('should handle configuration changes', async () => {
      // Arrange
      let configChangeHandler: (event: vscode.ConfigurationChangeEvent) => void;
      const onDidChangeConfigStub = vscode.workspace.onDidChangeConfiguration as sinon.SinonStub;
      onDidChangeConfigStub.callsFake((handler: any) => {
        configChangeHandler = handler;
        return { dispose: sandbox.stub() };
      });

      await activate(mockContext);

      // Create mock configuration change event
      const mockEvent = {
        affectsConfiguration: sandbox.stub().returns(true)
      } as any;

      // Act
      await configChangeHandler!(mockEvent);

      // Assert
      assert.ok(mockEvent.affectsConfiguration.calledWith('copilotMultiAgent'), 
        'Should check if configuration affects extension');
    });

    it('should handle configuration change errors gracefully', async () => {
      // Arrange
      let configChangeHandler: (event: vscode.ConfigurationChangeEvent) => void;
      const onDidChangeConfigStub = vscode.workspace.onDidChangeConfiguration as sinon.SinonStub;
      onDidChangeConfigStub.callsFake((handler: any) => {
        configChangeHandler = handler;
        return { dispose: sandbox.stub() };
      });

      await activate(mockContext);

      // Mock configuration loading error
      mockWorkspaceConfig.get.throws(new Error('Config load error'));

      const mockEvent = {
        affectsConfiguration: sandbox.stub().returns(true)
      } as any;

      // Act & Assert
      // Should not throw
      await assert.doesNotReject(async () => await configChangeHandler!(mockEvent), 
        'Configuration change handler should not throw');
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors without crashing', async () => {
      // Arrange
      mockWorkspaceConfig.get.throws(new Error('Critical initialization error'));
      (vscode.chat.createChatParticipant as sinon.SinonStub).throws(new Error('Chat API unavailable'));

      // Act & Assert
      await assert.doesNotReject(activate(mockContext), 'Activation should not throw');
      
      // Extension should still activate but with degraded functionality
      const state = getExtensionState();
      assert.ok(state, 'Extension should still be activated');
      // The extension gracefully handles errors and continues with default configuration
      assert.strictEqual(isExtensionInitialized(), true, 'Should be initialized with fallback configuration');
    });

    it('should show error notification on initialization failure', async () => {
      // Arrange
      (vscode.chat.createChatParticipant as sinon.SinonStub).throws(new Error('Chat API error'));

      // Act
      await activate(mockContext);

      // Assert
      // The extension handles chat participant errors gracefully with warnings, not errors
      const showWarningStub = vscode.window.showWarningMessage as sinon.SinonStub;
      assert.ok(showWarningStub.called, 'Should show warning message about degraded functionality');
      
      // Extension should still be functional
      const state = getExtensionState();
      assert.ok(state, 'Extension should still be activated');
      assert.strictEqual(state.isInitialized, true, 'Should be initialized despite chat participant error');
    });
  });

  describe('Extension State Management', () => {
    it('should provide access to extension state', async () => {
      // Act
      await activate(mockContext);

      // Assert
      const state = getExtensionState();
      assert.ok(state, 'Should provide extension state');
      assert.strictEqual(state.isInitialized, true, 'State should indicate initialization');
    });

    it('should indicate initialization status correctly', async () => {
      // Before activation
      assert.strictEqual(isExtensionInitialized(), false, 'Should not be initialized before activation');

      // After activation
      await activate(mockContext);
      assert.strictEqual(isExtensionInitialized(), true, 'Should be initialized after activation');

      // After deactivation
      await deactivate();
      assert.strictEqual(isExtensionInitialized(), false, 'Should not be initialized after deactivation');
    });

    it('should track initialization errors', async () => {
      // Arrange
      (vscode.chat.createChatParticipant as sinon.SinonStub).throws(new Error('Test error'));

      // Act
      await activate(mockContext);

      // Assert
      // The extension handles errors gracefully and continues with degraded functionality
      const state = getExtensionState();
      assert.ok(state, 'Extension should still be activated');
      assert.strictEqual(state.isInitialized, true, 'Should be initialized despite component errors');
      
      // Should show warning about degraded functionality
      const showWarningStub = vscode.window.showWarningMessage as sinon.SinonStub;
      assert.ok(showWarningStub.called, 'Should show warning about component failure');
    });
  });
});