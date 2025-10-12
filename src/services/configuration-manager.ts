/**
 * Configuration management service for VS Code settings integration
 */

import * as vscode from 'vscode';
import { 
  ExtensionConfiguration, 
  CoordinatorConfiguration, 
  AgentConfiguration,
  ConfigurationValidator,
  DEFAULT_EXTENSION_CONFIG,
  ValidationResult
} from '../models';

export interface IConfigurationManager {
  /**
   * Loads the current configuration from VS Code settings
   * @returns The current extension configuration
   */
  loadConfiguration(): Promise<ExtensionConfiguration>;
  
  /**
   * Saves configuration to VS Code settings
   * @param config The configuration to save
   */
  saveConfiguration(config: ExtensionConfiguration): Promise<void>;
  
  /**
   * Validates a configuration object
   * @param config The configuration to validate
   * @returns True if valid, throws error if invalid
   */
  validateConfiguration(config: ExtensionConfiguration): boolean;
  
  /**
   * Gets the default configuration
   * @returns Default configuration object
   */
  getDefaultConfiguration(): ExtensionConfiguration;
  
  /**
   * Registers a listener for configuration changes
   * @param listener Function to call when configuration changes
   */
  onConfigurationChanged(listener: (config: ExtensionConfiguration) => void): void;
  
  /**
   * Disposes of the configuration manager and cleans up listeners
   */
  dispose(): void;
}

/**
 * Configuration manager implementation for VS Code settings
 */
export class ConfigurationManager implements IConfigurationManager {
  private static readonly CONFIGURATION_SECTION = 'copilotMultiAgent';
  private static readonly COORDINATOR_KEY = 'coordinator';
  private static readonly CUSTOM_AGENTS_KEY = 'customAgents';
  
  private configurationChangeListeners: ((config: ExtensionConfiguration) => void)[] = [];
  private disposables: vscode.Disposable[] = [];
  
  constructor() {
    // Register for configuration changes
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(
      this.handleConfigurationChange.bind(this)
    );
    this.disposables.push(configChangeDisposable);
  }

  /**
   * Loads the current configuration from VS Code settings
   */
  async loadConfiguration(): Promise<ExtensionConfiguration> {
    try {
      const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
      
      // Load coordinator configuration
      const coordinatorConfig = config.get<CoordinatorConfiguration>(ConfigurationManager.COORDINATOR_KEY);
      const customAgents = config.get<AgentConfiguration[]>(ConfigurationManager.CUSTOM_AGENTS_KEY, []);
      
      // Build configuration object
      const extensionConfig: ExtensionConfiguration = {
        coordinator: coordinatorConfig || DEFAULT_EXTENSION_CONFIG.coordinator,
        customAgents: customAgents || []
      };
      
      // Validate the loaded configuration
      const validation = ConfigurationValidator.validateExtensionConfiguration(extensionConfig);
      if (!validation.isValid) {
        console.warn('Invalid configuration loaded from settings:', validation.errors);
        // Return default configuration if current is invalid
        return DEFAULT_EXTENSION_CONFIG;
      }
      
      return extensionConfig;
    } catch (error) {
      console.error('Error loading configuration:', error);
      return DEFAULT_EXTENSION_CONFIG;
    }
  }

  /**
   * Saves configuration to VS Code settings
   */
  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    // Validate configuration before saving
    if (!this.validateConfiguration(config)) {
      throw new Error('Cannot save invalid configuration');
    }
    
    try {
      const vsCodeConfig = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
      
      // Save coordinator configuration
      await vsCodeConfig.update(
        ConfigurationManager.COORDINATOR_KEY, 
        config.coordinator, 
        vscode.ConfigurationTarget.Global
      );
      
      // Save custom agents configuration
      await vsCodeConfig.update(
        ConfigurationManager.CUSTOM_AGENTS_KEY, 
        config.customAgents, 
        vscode.ConfigurationTarget.Global
      );
      
    } catch (error) {
      console.error('Error saving configuration:', error);
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates a configuration object
   */
  validateConfiguration(config: ExtensionConfiguration): boolean {
    const validation = ConfigurationValidator.validateExtensionConfiguration(config);
    if (!validation.isValid) {
      console.error('Configuration validation failed:', validation.errors);
      return false;
    }
    return true;
  }

  /**
   * Gets the default configuration
   */
  getDefaultConfiguration(): ExtensionConfiguration {
    return JSON.parse(JSON.stringify(DEFAULT_EXTENSION_CONFIG));
  }

  /**
   * Registers a listener for configuration changes
   */
  onConfigurationChanged(listener: (config: ExtensionConfiguration) => void): void {
    this.configurationChangeListeners.push(listener);
  }

  /**
   * Removes a configuration change listener
   */
  removeConfigurationChangeListener(listener: (config: ExtensionConfiguration) => void): void {
    const index = this.configurationChangeListeners.indexOf(listener);
    if (index > -1) {
      this.configurationChangeListeners.splice(index, 1);
    }
  }

  /**
   * Disposes of the configuration manager and cleans up listeners
   */
  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables = [];
    this.configurationChangeListeners = [];
  }

  /**
   * Handles VS Code configuration changes
   */
  private async handleConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
    if (event.affectsConfiguration(ConfigurationManager.CONFIGURATION_SECTION)) {
      try {
        const newConfig = await this.loadConfiguration();
        
        // Notify all listeners of the configuration change
        this.configurationChangeListeners.forEach(listener => {
          try {
            listener(newConfig);
          } catch (error) {
            console.error('Error in configuration change listener:', error);
          }
        });
      } catch (error) {
        console.error('Error handling configuration change:', error);
      }
    }
  }

  /**
   * Gets a specific agent configuration by name
   */
  async getAgentConfiguration(agentName: string): Promise<AgentConfiguration | CoordinatorConfiguration | null> {
    const config = await this.loadConfiguration();
    
    if (agentName === 'coordinator') {
      return config.coordinator;
    }
    
    return config.customAgents.find(agent => agent.name === agentName) || null;
  }

  /**
   * Updates a specific agent configuration
   */
  async updateAgentConfiguration(agentName: string, agentConfig: AgentConfiguration | CoordinatorConfiguration): Promise<void> {
    const config = await this.loadConfiguration();
    
    if (agentName === 'coordinator') {
      config.coordinator = agentConfig as CoordinatorConfiguration;
    } else {
      const agentIndex = config.customAgents.findIndex(agent => agent.name === agentName);
      if (agentIndex >= 0) {
        config.customAgents[agentIndex] = agentConfig as AgentConfiguration;
      } else {
        config.customAgents.push(agentConfig as AgentConfiguration);
      }
    }
    
    await this.saveConfiguration(config);
  }

  /**
   * Removes a custom agent configuration
   */
  async removeAgentConfiguration(agentName: string): Promise<void> {
    if (agentName === 'coordinator') {
      throw new Error('Cannot remove coordinator agent');
    }
    
    const config = await this.loadConfiguration();
    const agentIndex = config.customAgents.findIndex(agent => agent.name === agentName);
    
    if (agentIndex >= 0) {
      config.customAgents.splice(agentIndex, 1);
      await this.saveConfiguration(config);
    }
  }

  /**
   * Gets all agent names (coordinator + custom agents)
   */
  async getAllAgentNames(): Promise<string[]> {
    const config = await this.loadConfiguration();
    return ['coordinator', ...config.customAgents.map(agent => agent.name)];
  }
}