/**
 * Configuration management service for VS Code settings integration
 */

import * as vscode from 'vscode';
import { 
  ExtensionConfiguration, 
  AgentConfiguration,
  ConfigurationValidator,
  DEFAULT_EXTENSION_CONFIG,
  ValidationResult
} from '../models';
import { ErrorHandler, createErrorContext } from './error-handler';
import { ConfigurationError } from '../models/errors';

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
   * Gets the entry agent configuration
   * @returns The entry agent configuration or null if not found
   */
  getEntryAgent(): Promise<AgentConfiguration | null>;
  
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
  private static readonly ENTRY_AGENT_KEY = 'entryAgent';
  private static readonly AGENTS_KEY = 'agents';
  
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
    const errorHandler = ErrorHandler.getInstance();
    
    try {
      const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
      
      // Check if user has explicitly configured values
      const hasExplicitEntryAgent = config.has(ConfigurationManager.ENTRY_AGENT_KEY);
      const hasExplicitAgents = config.has(ConfigurationManager.AGENTS_KEY);
      
      // Load entry agent and agents configuration
      const entryAgent = config.get<string>(ConfigurationManager.ENTRY_AGENT_KEY);
      const agents = config.get<AgentConfiguration[]>(ConfigurationManager.AGENTS_KEY, []);
      
      // If no explicit configuration exists, return defaults
      if (!hasExplicitEntryAgent && !hasExplicitAgents) {
        return DEFAULT_EXTENSION_CONFIG;
      }
      
      // Build configuration object from user's explicit configuration
      const rawConfig: ExtensionConfiguration = {
        entryAgent: entryAgent || '',
        agents: agents || []
      };
      
      // Validate configuration
      const validationResult = ConfigurationValidator.validateExtensionConfiguration(rawConfig);
      
      // Handle entry agent validation and fallback for backward compatibility
      // Some tests and legacy code expect this behavior
      const entryAgentValidation = ConfigurationValidator.validateAndGetEntryAgent(rawConfig.entryAgent, rawConfig.agents);
      if (entryAgentValidation.entryAgent && entryAgentValidation.entryAgent !== rawConfig.entryAgent) {
        // Use the resolved entry agent (could be fallback or default)
        console.warn('Entry agent resolved to:', entryAgentValidation.entryAgent);
        rawConfig.entryAgent = entryAgentValidation.entryAgent;
      } else if (!entryAgentValidation.isValid && rawConfig.agents.length > 0) {
        // Entry agent is invalid and no fallback provided, use first agent
        const fallbackAgent = ConfigurationValidator.getDefaultEntryAgent(rawConfig.agents);
        if (fallbackAgent) {
          console.warn('Entry agent validation failed, using fallback:', entryAgentValidation.errors);
          rawConfig.entryAgent = fallbackAgent;
        }
      }
      
      if (!validationResult.isValid) {
        // Log validation errors
        await errorHandler.handleError(
          new ConfigurationError(`Configuration validation failed: ${validationResult.errors.join(', ')}`),
          createErrorContext(undefined, undefined, 'loadConfiguration', { 
            errors: validationResult.errors
          }),
          { notifyUser: false }
        );
        
        // Return the configuration with entry agent fixed if possible
        // This preserves the user's configuration choices while fixing critical issues
        return rawConfig;
      }
      
      return rawConfig;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error loading configuration:', errorMessage);
      
      // Handle error and return default configuration
      await errorHandler.handleError(
        new ConfigurationError(`Failed to load configuration: ${errorMessage}`),
        createErrorContext(undefined, undefined, 'loadConfiguration'),
        { notifyUser: false }
      );
      
      return DEFAULT_EXTENSION_CONFIG;
    }
  }

  /**
   * Saves configuration to VS Code settings
   */
  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    const errorHandler = ErrorHandler.getInstance();
    
    try {
      // Validate configuration before saving
      const validationResult = ConfigurationValidator.validateExtensionConfiguration(config);
      
      if (!validationResult.isValid) {
        const errorMessage = `Cannot save invalid configuration: ${validationResult.errors.join(', ')}`;
        await errorHandler.handleError(
          new ConfigurationError(errorMessage),
          createErrorContext(undefined, undefined, 'saveConfiguration', { 
            errors: validationResult.errors,
            config 
          })
        );
        throw new ConfigurationError(errorMessage);
      }
      
      const vsCodeConfig = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
      
      // Save entry agent setting
      await vsCodeConfig.update(
        ConfigurationManager.ENTRY_AGENT_KEY, 
        config.entryAgent, 
        vscode.ConfigurationTarget.Global
      );
      
      // Save agents configuration
      await vsCodeConfig.update(
        ConfigurationManager.AGENTS_KEY, 
        config.agents, 
        vscode.ConfigurationTarget.Global
      );
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error saving configuration:', errorMessage);
      
      if (error instanceof ConfigurationError) {
        throw error;
      }
      
      const configError = new ConfigurationError(`Failed to save configuration: ${errorMessage}`);
      await errorHandler.handleError(
        configError,
        createErrorContext(undefined, undefined, 'saveConfiguration', { config })
      );
      
      throw configError;
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
    return DEFAULT_EXTENSION_CONFIG;
  }

  /**
   * Gets the entry agent configuration
   */
  async getEntryAgent(): Promise<AgentConfiguration | null> {
    // Load raw configuration without automatic fixing for this method
    const vsCodeConfig = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
    const entryAgentName = vsCodeConfig.get<string>(ConfigurationManager.ENTRY_AGENT_KEY);
    const agents = vsCodeConfig.get<AgentConfiguration[]>(ConfigurationManager.AGENTS_KEY, []);
    
    if (!entryAgentName) {
      return null;
    }
    
    return agents.find(agent => agent.name === entryAgentName) || null;
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
  async getAgentConfiguration(agentName: string): Promise<AgentConfiguration | null> {
    const config = await this.loadConfiguration();
    return config.agents.find(agent => agent.name === agentName) || null;
  }

  /**
   * Updates a specific agent configuration
   */
  async updateAgentConfiguration(agentName: string, agentConfig: AgentConfiguration): Promise<void> {
    const config = await this.loadConfiguration();
    
    const agentIndex = config.agents.findIndex(agent => agent.name === agentName);
    if (agentIndex >= 0) {
      config.agents[agentIndex] = agentConfig;
    } else {
      config.agents.push(agentConfig);
    }
    
    await this.saveConfiguration(config);
  }

  /**
   * Removes an agent configuration
   */
  async removeAgentConfiguration(agentName: string): Promise<void> {
    const config = await this.loadConfiguration();
    const agentIndex = config.agents.findIndex(agent => agent.name === agentName);
    
    if (agentIndex >= 0) {
      config.agents.splice(agentIndex, 1);
      
      // If we're removing the entry agent, update to use the first remaining agent
      if (config.entryAgent === agentName && config.agents.length > 0) {
        config.entryAgent = config.agents[0].name;
      } else if (config.entryAgent === agentName && config.agents.length === 0) {
        // Reset to default if no agents left
        const defaultConfig = this.getDefaultConfiguration();
        config.entryAgent = defaultConfig.entryAgent;
        config.agents = defaultConfig.agents;
      }
      
      await this.saveConfiguration(config);
    }
  }

  /**
   * Gets all agent names
   */
  async getAllAgentNames(): Promise<string[]> {
    // Load raw configuration to get actual configured agents
    const vsCodeConfig = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
    const agents = vsCodeConfig.get<AgentConfiguration[]>(ConfigurationManager.AGENTS_KEY, []);
    return agents.map(agent => agent.name);
  }

  /**
   * Updates the entry agent setting
   */
  async updateEntryAgent(entryAgentName: string): Promise<void> {
    const config = await this.loadConfiguration();
    
    // Validate that the entry agent exists
    const entryAgentValidation = ConfigurationValidator.validateEntryAgent(entryAgentName, config.agents);
    if (!entryAgentValidation.isValid) {
      throw new ConfigurationError(`Invalid entry agent: ${entryAgentValidation.errors.join(', ')}`);
    }
    
    config.entryAgent = entryAgentName;
    await this.saveConfiguration(config);
  }

  /**
   * Resets configuration to defaults
   */
  async resetToDefaults(): Promise<void> {
    const defaultConfig = this.getDefaultConfiguration();
    await this.saveConfiguration(defaultConfig);
    console.log('Configuration reset to defaults');
  }

  /**
   * Validates and fixes current configuration
   */
  async validateAndFixConfiguration(): Promise<{ fixed: boolean; errors: string[]; warnings: string[] }> {
    try {
      // Load raw configuration without automatic fixing
      const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIGURATION_SECTION);
      const rawEntryAgent = config.get<string>(ConfigurationManager.ENTRY_AGENT_KEY);
      const rawAgents = config.get<AgentConfiguration[]>(ConfigurationManager.AGENTS_KEY, []);
      
      const rawConfig: ExtensionConfiguration = {
        entryAgent: rawEntryAgent || '',
        agents: rawAgents || []
      };
      
      const validationResult = ConfigurationValidator.validateExtensionConfiguration(rawConfig);
      
      if (!validationResult.isValid) {
        // Try to fix common issues
        let fixedConfig = { ...rawConfig };
        let fixed = false;
        
        // Fix entry agent if invalid
        const entryAgentValidation = ConfigurationValidator.validateAndGetEntryAgent(fixedConfig.entryAgent, fixedConfig.agents);
        if (!entryAgentValidation.isValid) {
          // Get fallback entry agent
          const fallbackEntryAgent = ConfigurationValidator.getDefaultEntryAgent(fixedConfig.agents);
          if (fallbackEntryAgent) {
            fixedConfig.entryAgent = fallbackEntryAgent;
            fixed = true;
          }
        }
        
        // If we made fixes, save the configuration
        if (fixed) {
          await this.saveConfiguration(fixedConfig);
        }
        
        return {
          fixed,
          errors: validationResult.errors,
          warnings: []
        };
      }
      
      return {
        fixed: false,
        errors: [],
        warnings: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        fixed: false,
        errors: [`Failed to validate and fix configuration: ${errorMessage}`],
        warnings: []
      };
    }
  }
}