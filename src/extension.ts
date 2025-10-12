/**
 * Multi-Agent Extension for VS Code
 * Provides multi-agent capabilities through VS Code Chat Participant API
 */

import * as vscode from 'vscode';
import * as path from 'path';

// Import core services and models
import { 
  ConfigurationManager,
  DefaultAgentEngine,
  MultiAgentChatParticipant,
  DefaultToolFilter,
  DefaultDelegationEngine,
  ErrorHandler
} from './services';
import { 
  CompatibilityChecker,
  GracefulDegradationManager
} from './services/compatibility-checker';
import { 
  ExtensionConfiguration,
  MultiAgentError,
  MultiAgentErrorType,
  ConfigurationError
} from './models';
import { 
  EXTENSION_ID,
  CHAT_PARTICIPANT_ID,
  DEFAULT_EXTENSION_CONFIG
} from './constants';

/**
 * Extension state management
 */
interface ExtensionState {
  configurationManager: ConfigurationManager;
  agentEngine: DefaultAgentEngine;
  toolFilter: DefaultToolFilter;
  delegationEngine: DefaultDelegationEngine;
  chatParticipant: MultiAgentChatParticipant;
  errorHandler: ErrorHandler;
  degradationManager: GracefulDegradationManager;
  isInitialized: boolean;
  initializationError?: Error;
  compatibilityMode: boolean;
}

let extensionState: ExtensionState | undefined;

/**
 * Extension activation function
 * Called when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log(`Activating ${EXTENSION_ID} extension...`);

  try {
    // Perform compatibility check first
    console.log('Performing compatibility check...');
    const compatibilityResult = await CompatibilityChecker.checkCompatibility();
    
    if (!compatibilityResult.isCompatible) {
      console.warn('Compatibility issues detected:', compatibilityResult.errors);
      
      // Show compatibility warning to user
      const action = await vscode.window.showWarningMessage(
        'Multi-Agent extension detected compatibility issues. Some features may not work properly.',
        'View Details',
        'Continue Anyway',
        'Cancel'
      );
      
      if (action === 'View Details') {
        const report = await CompatibilityChecker.createCompatibilityReport();
        const doc = await vscode.workspace.openTextDocument({
          content: report,
          language: 'plaintext'
        });
        await vscode.window.showTextDocument(doc);
      } else if (action === 'Cancel') {
        console.log('Extension activation cancelled by user due to compatibility issues');
        return;
      }
      // Continue with "Continue Anyway"
    }

    // Initialize extension state with compatibility awareness
    extensionState = await initializeExtension(context, compatibilityResult);
    
    // Register extension components (with graceful degradation)
    await registerExtensionComponents(context, extensionState);
    
    // Set up configuration monitoring
    setupConfigurationMonitoring(extensionState);
    
    // Register commands
    registerCommands(context, extensionState);
    
    // Log activation status
    const statusMessage = extensionState.compatibilityMode 
      ? `${EXTENSION_ID} extension activated in compatibility mode`
      : `${EXTENSION_ID} extension activated successfully`;
    console.log(statusMessage);
    
    // Show activation notification (optional, can be disabled in settings)
    const config = vscode.workspace.getConfiguration('copilotMultiAgent');
    const showActivationMessage = config.get<boolean>('showActivationMessage', false);
    
    if (showActivationMessage) {
      const message = extensionState.compatibilityMode
        ? 'Copilot Multi-Agent extension is active in compatibility mode. Some features may be limited.'
        : 'Copilot Multi-Agent extension is now active! Use @multi-agent in chat to get started.';
      
      vscode.window.showInformationMessage(
        message,
        'Open Settings',
        ...(extensionState.compatibilityMode ? ['View Compatibility Report'] : [])
      ).then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'copilotMultiAgent');
        } else if (selection === 'View Compatibility Report') {
          vscode.commands.executeCommand('copilot-multi-agent.showCompatibilityReport');
        }
      });
    }

  } catch (error) {
    console.error('Failed to activate extension:', error);
    
    // Store initialization error for diagnostics
    if (extensionState) {
      extensionState.initializationError = error instanceof Error ? error : new Error(String(error));
      extensionState.isInitialized = false;
    }
    
    // Show error notification to user with enhanced options
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(
      `Failed to activate Copilot Multi-Agent extension: ${errorMessage}`,
      'View Logs',
      'Open Settings',
      'Report Issue'
    ).then(selection => {
      if (selection === 'View Logs') {
        vscode.commands.executeCommand('workbench.action.showLogs');
      } else if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'copilotMultiAgent');
      } else if (selection === 'Report Issue') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/copilot-multi-agent/issues'));
      }
    });
    
    // Don't throw - allow VS Code to continue functioning
    // The extension will be in a degraded state but won't crash VS Code
  }
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export async function deactivate(): Promise<void> {
  console.log(`Deactivating ${EXTENSION_ID} extension...`);

  try {
    if (extensionState) {
      // Dispose of all components in reverse order of initialization
      await disposeExtensionComponents(extensionState);
      extensionState = undefined;
    }
    
    console.log(`${EXTENSION_ID} extension deactivated successfully`);
  } catch (error) {
    console.error('Error during extension deactivation:', error);
    // Don't throw during deactivation to avoid issues
  }
}

/**
 * Initializes the extension and creates all core components
 */
async function initializeExtension(
  context: vscode.ExtensionContext, 
  compatibilityResult?: any
): Promise<ExtensionState> {
  console.log('Initializing extension components...');

  try {
    // Initialize graceful degradation manager
    const degradationManager = new GracefulDegradationManager();
    await degradationManager.initialize();
    
    const compatibilityMode = degradationManager.isInFallbackMode();
    
    if (compatibilityMode) {
      console.log('Initializing in compatibility mode due to detected issues');
    }

    // Initialize error handler first
    const errorHandler = ErrorHandler.getInstance();
    
    // Initialize configuration manager
    const configurationManager = new ConfigurationManager();
    
    // Load and validate initial configuration
    let config: ExtensionConfiguration;
    try {
      config = await configurationManager.loadConfiguration();
      console.log('Configuration loaded successfully');
    } catch (configError) {
      console.warn('Failed to load configuration, using defaults:', configError);
      config = DEFAULT_EXTENSION_CONFIG;
      
      // Try to save default configuration
      try {
        await configurationManager.saveConfiguration(config);
        console.log('Default configuration saved');
      } catch (saveError) {
        console.warn('Failed to save default configuration:', saveError);
      }
    }
    
    // Initialize tool filter
    const toolFilter = new DefaultToolFilter(configurationManager);
    
    // Initialize agent engine
    const agentEngine = new DefaultAgentEngine(toolFilter);
    
    // Initialize delegation engine
    const delegationEngine = new DefaultDelegationEngine(agentEngine, configurationManager);
    
    // Get extension icon path
    const iconPath = getExtensionIconPath(context);
    
    // Initialize chat participant (with compatibility awareness)
    let chatParticipant: MultiAgentChatParticipant;
    
    if (degradationManager.isFeatureAvailable('chatParticipant')) {
      chatParticipant = new MultiAgentChatParticipant(
        configurationManager,
        agentEngine,
        toolFilter,
        delegationEngine,
        iconPath
      );
      console.log('Chat participant initialized successfully');
    } else {
      console.warn('Chat participant disabled due to compatibility issues');
      // Create a stub chat participant that won't register
      chatParticipant = new MultiAgentChatParticipant(
        configurationManager,
        agentEngine,
        toolFilter,
        delegationEngine,
        iconPath
      );
    }
    
    console.log('Extension components initialized successfully');
    
    return {
      configurationManager,
      agentEngine,
      toolFilter,
      delegationEngine,
      chatParticipant,
      errorHandler,
      degradationManager,
      isInitialized: true,
      compatibilityMode
    };

  } catch (error) {
    console.error('Failed to initialize extension components:', error);
    throw new ConfigurationError(
      `Extension initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      undefined,
      { originalError: error }
    );
  }
}

/**
 * Registers extension components with VS Code
 */
async function registerExtensionComponents(
  context: vscode.ExtensionContext,
  state: ExtensionState
): Promise<void> {
  console.log('Registering extension components...');

  try {
    // Register chat participant only if feature is available
    if (state.degradationManager.isFeatureAvailable('chatParticipant')) {
      try {
        state.chatParticipant.register();
        console.log('Chat participant registered');
        
        // Add chat participant to disposables for cleanup
        context.subscriptions.push({
          dispose: () => state.chatParticipant.dispose()
        });
      } catch (chatError) {
        console.warn('Failed to register chat participant, continuing without it:', chatError);
        
        // Disable chat participant feature
        state.degradationManager.getDisabledFeatures().push('chatParticipant');
        
        // Show user notification
        vscode.window.showWarningMessage(
          'Chat participant could not be registered. Multi-agent features will be available through commands only.',
          'View Commands'
        ).then(selection => {
          if (selection === 'View Commands') {
            vscode.commands.executeCommand('workbench.action.showCommands');
          }
        });
      }
    } else {
      console.log('Chat participant registration skipped due to compatibility issues');
      
      // Show user notification about fallback mode
      vscode.window.showInformationMessage(
        'Multi-agent extension is running in compatibility mode. Use command palette for functionality.',
        'View Commands'
      ).then(selection => {
        if (selection === 'View Commands') {
          vscode.commands.executeCommand('workbench.action.showCommands');
        }
      });
    }
    
    // Add configuration manager to disposables
    context.subscriptions.push({
      dispose: () => state.configurationManager.dispose()
    });
    
    // Add periodic cleanup for delegation engine
    const cleanupInterval = setInterval(() => {
      try {
        state.delegationEngine.cleanup();
      } catch (error) {
        console.warn('Error during delegation engine cleanup:', error);
      }
    }, 60000); // Cleanup every minute
    
    context.subscriptions.push({
      dispose: () => clearInterval(cleanupInterval)
    });
    
    // Set up compatibility monitoring
    const compatibilityCheckInterval = setInterval(async () => {
      try {
        // Periodically check if disabled features can be re-enabled
        const disabledFeatures = state.degradationManager.getDisabledFeatures();
        for (const feature of disabledFeatures) {
          const enabled = await state.degradationManager.attemptFeatureEnable(feature);
          if (enabled) {
            console.log(`Feature '${feature}' has been re-enabled`);
            
            // If chat participant was re-enabled, try to register it
            if (feature === 'chatParticipant' && !state.chatParticipant.isRegistered()) {
              try {
                state.chatParticipant.register();
                console.log('Chat participant registered after compatibility improvement');
                
                vscode.window.showInformationMessage(
                  'Multi-agent chat participant is now available!'
                );
              } catch (regError) {
                console.warn('Failed to register chat participant after re-enable:', regError);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error during compatibility monitoring:', error);
      }
    }, 300000); // Check every 5 minutes
    
    context.subscriptions.push({
      dispose: () => clearInterval(compatibilityCheckInterval)
    });
    
    console.log('Extension components registered successfully');

  } catch (error) {
    console.error('Failed to register extension components:', error);
    
    // In compatibility mode, don't throw - continue with degraded functionality
    if (state.compatibilityMode) {
      console.warn('Continuing in compatibility mode despite registration errors');
      
      vscode.window.showWarningMessage(
        'Some multi-agent features could not be initialized. Extension is running in limited mode.',
        'View Status'
      ).then(selection => {
        if (selection === 'View Status') {
          vscode.commands.executeCommand('copilot-multi-agent.showStatus');
        }
      });
    } else {
      throw new ConfigurationError(
        `Component registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { originalError: error }
      );
    }
  }
}

/**
 * Sets up configuration change monitoring
 */
function setupConfigurationMonitoring(state: ExtensionState): void {
  console.log('Setting up configuration monitoring...');

  // Listen for configuration changes and update components
  state.configurationManager.onConfigurationChanged(async (newConfig) => {
    try {
      console.log('Configuration changed, updating components...');
      
      // Notify components of configuration changes
      // Note: Individual components handle their own configuration updates
      // through their own configuration change listeners
      
      console.log('Configuration update completed');
    } catch (error) {
      console.error('Error handling configuration change:', error);
      
      // Show user notification for configuration errors
      vscode.window.showWarningMessage(
        'Configuration update failed. Some multi-agent features may not work correctly.',
        'View Logs',
        'Reset Configuration'
      ).then(selection => {
        if (selection === 'View Logs') {
          vscode.commands.executeCommand('workbench.action.showLogs');
        } else if (selection === 'Reset Configuration') {
          vscode.commands.executeCommand('copilot-multi-agent.resetConfiguration');
        }
      });
    }
  });
  
  console.log('Configuration monitoring set up successfully');
}

/**
 * Registers extension commands
 */
function registerCommands(context: vscode.ExtensionContext, state: ExtensionState): void {
  console.log('Registering extension commands...');

  // Command: Reset configuration to defaults
  const resetConfigCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.resetConfiguration',
    async () => {
      try {
        const result = await vscode.window.showWarningMessage(
          'This will reset all multi-agent configuration to defaults. Continue?',
          { modal: true },
          'Reset Configuration'
        );
        
        if (result === 'Reset Configuration') {
          await state.configurationManager.resetToDefaults();
          vscode.window.showInformationMessage('Multi-agent configuration reset to defaults');
        }
      } catch (error) {
        console.error('Error resetting configuration:', error);
        vscode.window.showErrorMessage(
          `Failed to reset configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  // Command: Validate and fix configuration
  const validateConfigCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.validateConfiguration',
    async () => {
      try {
        const result = await state.configurationManager.validateAndFixConfiguration();
        
        if (result.fixed) {
          const message = [
            'Configuration has been validated and fixed.',
            result.errors.length > 0 ? `Errors fixed: ${result.errors.length}` : '',
            result.warnings.length > 0 ? `Warnings: ${result.warnings.length}` : ''
          ].filter(Boolean).join(' ');
          
          vscode.window.showInformationMessage(message);
        } else {
          vscode.window.showInformationMessage('Configuration is valid - no changes needed');
        }
      } catch (error) {
        console.error('Error validating configuration:', error);
        vscode.window.showErrorMessage(
          `Failed to validate configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  // Command: Show extension status
  const showStatusCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.showStatus',
    async () => {
      try {
        const isRegistered = state.chatParticipant.isRegistered();
        const delegationStats = state.delegationEngine.getDelegationStats();
        const conversationStats = state.delegationEngine.getConversationStats();
        const degradationStatus = state.degradationManager.getStatusMessage();
        const disabledFeatures = state.degradationManager.getDisabledFeatures();
        
        const statusMessage = [
          `Multi-Agent Extension Status:`,
          `• Initialized: ${state.isInitialized ? '✅' : '❌'}`,
          `• Compatibility Mode: ${state.compatibilityMode ? '⚠️ Yes' : '✅ No'}`,
          `• Chat Participant: ${isRegistered ? '✅ Registered' : '❌ Not Registered'}`,
          `• Active Delegations: ${delegationStats.active}`,
          `• Active Conversations: ${conversationStats.active}`,
          disabledFeatures.length > 0 ? `• Disabled Features: ${disabledFeatures.join(', ')}` : '',
          `• Status: ${degradationStatus}`,
          state.initializationError ? `• Error: ${state.initializationError.message}` : ''
        ].filter(Boolean).join('\n');
        
        const actions = ['Close'];
        if (state.compatibilityMode) {
          actions.unshift('View Compatibility Report');
        }
        if (disabledFeatures.length > 0) {
          actions.unshift('Check Compatibility');
        }
        
        const selection = await vscode.window.showInformationMessage(
          statusMessage, 
          { modal: true },
          ...actions
        );
        
        if (selection === 'View Compatibility Report') {
          vscode.commands.executeCommand('copilot-multi-agent.showCompatibilityReport');
        } else if (selection === 'Check Compatibility') {
          vscode.commands.executeCommand('copilot-multi-agent.checkCompatibility');
        }
      } catch (error) {
        console.error('Error showing status:', error);
        vscode.window.showErrorMessage('Failed to retrieve extension status');
      }
    }
  );

  // Command: Open extension settings
  const openSettingsCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.openSettings',
    () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'copilotMultiAgent');
    }
  );

  // Command: Show compatibility report
  const showCompatibilityReportCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.showCompatibilityReport',
    async () => {
      try {
        const report = await CompatibilityChecker.createCompatibilityReport();
        const doc = await vscode.workspace.openTextDocument({
          content: report,
          language: 'plaintext'
        });
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        console.error('Error generating compatibility report:', error);
        vscode.window.showErrorMessage(
          `Failed to generate compatibility report: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  // Command: Check compatibility
  const checkCompatibilityCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.checkCompatibility',
    async () => {
      try {
        const compatibility = await CompatibilityChecker.checkCompatibility();
        const runtime = await CompatibilityChecker.performRuntimeCheck();
        
        const statusIcon = compatibility.isCompatible && runtime.canProceed ? '✅' : '⚠️';
        const statusText = compatibility.isCompatible && runtime.canProceed ? 'Compatible' : 'Issues Detected';
        
        const message = [
          `${statusIcon} Compatibility Status: ${statusText}`,
          `VS Code Version: ${compatibility.vscodeVersion}`,
          `Errors: ${compatibility.errors.length}`,
          `Warnings: ${compatibility.warnings.length}`,
          `Fallback Mode: ${runtime.fallbackMode ? 'Yes' : 'No'}`
        ].join('\n');
        
        const action = await vscode.window.showInformationMessage(
          message,
          { modal: true },
          'View Full Report',
          'Refresh Check'
        );
        
        if (action === 'View Full Report') {
          vscode.commands.executeCommand('copilot-multi-agent.showCompatibilityReport');
        } else if (action === 'Refresh Check') {
          vscode.commands.executeCommand('copilot-multi-agent.checkCompatibility');
        }
      } catch (error) {
        console.error('Error checking compatibility:', error);
        vscode.window.showErrorMessage(
          `Failed to check compatibility: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );

  // Command: Enable/disable compatibility mode
  const toggleCompatibilityModeCommand = vscode.commands.registerCommand(
    'copilot-multi-agent.toggleCompatibilityMode',
    async () => {
      try {
        const currentMode = state.compatibilityMode;
        const action = await vscode.window.showInformationMessage(
          `Compatibility mode is currently ${currentMode ? 'enabled' : 'disabled'}. Would you like to ${currentMode ? 'disable' : 'enable'} it?`,
          { modal: true },
          currentMode ? 'Disable' : 'Enable'
        );
        
        if (action) {
          // This would require extension restart to take effect
          vscode.window.showInformationMessage(
            'Compatibility mode changes require extension restart to take effect.',
            'Restart Extension'
          ).then(selection => {
            if (selection === 'Restart Extension') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
        }
      } catch (error) {
        console.error('Error toggling compatibility mode:', error);
        vscode.window.showErrorMessage('Failed to toggle compatibility mode');
      }
    }
  );

  // Add commands to disposables
  context.subscriptions.push(
    resetConfigCommand,
    validateConfigCommand,
    showStatusCommand,
    openSettingsCommand,
    showCompatibilityReportCommand,
    checkCompatibilityCommand,
    toggleCompatibilityModeCommand
  );
  
  console.log('Extension commands registered successfully');
}

/**
 * Gets the extension icon path
 */
function getExtensionIconPath(context: vscode.ExtensionContext): vscode.Uri | undefined {
  try {
    // Look for icon files in the extension's resources
    const iconPaths = [
      'resources/icon.png',
      'resources/icon.svg',
      'images/icon.png',
      'images/icon.svg',
      'icon.png',
      'icon.svg'
    ];
    
    for (const iconPath of iconPaths) {
      const fullPath = path.join(context.extensionPath, iconPath);
      try {
        // Check if file exists (this is a simple check, in production you might want to use fs.existsSync)
        const iconUri = vscode.Uri.file(fullPath);
        return iconUri;
      } catch {
        // Continue to next path
      }
    }
    
    return undefined;
  } catch (error) {
    console.warn('Failed to get extension icon path:', error);
    return undefined;
  }
}

/**
 * Disposes of all extension components
 */
async function disposeExtensionComponents(state: ExtensionState): Promise<void> {
  console.log('Disposing extension components...');

  const disposePromises: Promise<void>[] = [];

  // Dispose components in reverse order of initialization
  try {
    // Dispose chat participant
    if (state.chatParticipant) {
      disposePromises.push(Promise.resolve(state.chatParticipant.dispose()));
    }
    
    // Dispose delegation engine (cleanup active delegations)
    if (state.delegationEngine) {
      disposePromises.push(Promise.resolve(state.delegationEngine.cleanup()));
    }
    
    // Dispose configuration manager
    if (state.configurationManager) {
      disposePromises.push(Promise.resolve(state.configurationManager.dispose()));
    }
    
    // Wait for all disposals to complete
    await Promise.allSettled(disposePromises);
    
    console.log('Extension components disposed successfully');
  } catch (error) {
    console.error('Error disposing extension components:', error);
    // Don't throw during disposal
  }
}

/**
 * Gets the current extension state (for testing and diagnostics)
 */
export function getExtensionState(): ExtensionState | undefined {
  return extensionState;
}

/**
 * Checks if the extension is properly initialized
 */
export function isExtensionInitialized(): boolean {
  return extensionState?.isInitialized ?? false;
}

/**
 * Gets extension initialization error if any
 */
export function getInitializationError(): Error | undefined {
  return extensionState?.initializationError;
}
