/**
 * Interface for configuration management service
 */

import { ExtensionConfiguration, CoordinatorConfiguration, AgentConfiguration } from '../models';

export interface ConfigurationManager {
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
}