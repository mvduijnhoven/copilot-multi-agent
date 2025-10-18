/**
 * Entry agent management service for handling entry agent selection and validation
 */

import { 
  ExtensionConfiguration, 
  AgentConfiguration,
  ConfigurationValidator,
  ValidationResult
} from '../models/agent-configuration';
import { ErrorHandler, createErrorContext } from './error-handler';
import { ConfigurationError } from '../models/errors';

export interface IEntryAgentManager {
  /**
   * Gets the entry agent configuration from the provided configuration
   * @param configuration The extension configuration
   * @returns The entry agent configuration or null if not found
   */
  getEntryAgent(configuration: ExtensionConfiguration): AgentConfiguration | null;
  
  /**
   * Validates that the specified entry agent exists in the agents array
   * @param entryAgentName The name of the entry agent to validate
   * @param agents The array of available agents
   * @returns True if valid, false otherwise
   */
  validateEntryAgent(entryAgentName: string, agents: AgentConfiguration[]): boolean;
  
  /**
   * Gets the default entry agent from the agents array (first agent)
   * @param agents The array of available agents
   * @returns The default entry agent configuration or null if no agents available
   */
  getDefaultEntryAgent(agents: AgentConfiguration[]): AgentConfiguration | null;
  
  /**
   * Resolves the entry agent with fallback logic and error handling
   * @param configuration The extension configuration
   * @returns The resolved entry agent configuration with validation result
   */
  resolveEntryAgent(configuration: ExtensionConfiguration): Promise<{
    agent: AgentConfiguration | null;
    isValid: boolean;
    errors: string[];
    warnings: string[];
    usedFallback: boolean;
  }>;
  
  /**
   * Validates entry agent configuration and provides detailed error information
   * @param entryAgentName The entry agent name to validate
   * @param agents The available agents
   * @returns Detailed validation result
   */
  validateEntryAgentWithDetails(entryAgentName: string, agents: AgentConfiguration[]): ValidationResult;

  /**
   * Gets entry agent name with fallback logic
   * @param configuration The extension configuration
   * @returns The entry agent name or null if not found
   */
  getEntryAgentName(configuration: ExtensionConfiguration): string | null;

  /**
   * Checks if the specified agent can serve as an entry agent
   * @param agentName The agent name to check
   * @param agents The available agents
   * @returns True if the agent can serve as entry agent
   */
  canServeAsEntryAgent(agentName: string, agents: AgentConfiguration[]): boolean;

  /**
   * Gets all possible entry agent candidates from the configuration
   * @param configuration The extension configuration
   * @returns Array of agent configurations that can serve as entry agents
   */
  getEntryAgentCandidates(configuration: ExtensionConfiguration): AgentConfiguration[];

  /**
   * Validates that an agent configuration is suitable for being an entry agent
   * @param agent The agent configuration to validate
   * @returns Validation result with suitability details
   */
  validateAgentSuitabilityAsEntryAgent(agent: AgentConfiguration): ValidationResult;

  /**
   * Updates entry agent in configuration with validation
   * @param configuration The configuration to update
   * @param newEntryAgentName The new entry agent name
   * @returns Update result with success status and messages
   */
  updateEntryAgent(
    configuration: ExtensionConfiguration, 
    newEntryAgentName: string
  ): Promise<{ success: boolean; errors: string[]; warnings: string[] }>;

  /**
   * Gets entry agent resolution status for debugging
   * @param configuration The extension configuration
   * @returns Detailed status information about entry agent resolution
   */
  getEntryAgentStatus(configuration: ExtensionConfiguration): Promise<{
    configured: string | null;
    resolved: string | null;
    isValid: boolean;
    usedFallback: boolean;
    availableAgents: string[];
    errors: string[];
    warnings: string[];
  }>;
}

/**
 * Entry agent manager implementation
 */
export class EntryAgentManager implements IEntryAgentManager {
  private errorHandler: ErrorHandler;
  
  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Gets the entry agent configuration from the provided configuration
   */
  getEntryAgent(configuration: ExtensionConfiguration): AgentConfiguration | null {
    if (!configuration || !configuration.agents || configuration.agents.length === 0) {
      return null;
    }

    const entryAgentName = configuration.entryAgent;
    if (!entryAgentName) {
      // Return first agent as default
      return configuration.agents[0];
    }

    // Find the specified entry agent
    const entryAgent = configuration.agents.find(agent => agent.name === entryAgentName);
    return entryAgent || null;
  }

  /**
   * Validates that the specified entry agent exists in the agents array
   */
  validateEntryAgent(entryAgentName: string, agents: AgentConfiguration[]): boolean {
    const validation = ConfigurationValidator.validateEntryAgent(entryAgentName, agents);
    return validation.isValid;
  }

  /**
   * Gets the default entry agent from the agents array (first agent)
   */
  getDefaultEntryAgent(agents: AgentConfiguration[]): AgentConfiguration | null {
    if (!agents || agents.length === 0) {
      return null;
    }
    return agents[0];
  }

  /**
   * Resolves the entry agent with fallback logic and error handling
   */
  async resolveEntryAgent(configuration: ExtensionConfiguration): Promise<{
    agent: AgentConfiguration | null;
    isValid: boolean;
    errors: string[];
    warnings: string[];
    usedFallback: boolean;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let usedFallback = false;
    let agent: AgentConfiguration | null = null;

    try {
      // Validate configuration structure
      if (!configuration) {
        errors.push('Configuration is null or undefined');
        return { agent: null, isValid: false, errors, warnings, usedFallback };
      }

      if (!configuration.agents || !Array.isArray(configuration.agents)) {
        errors.push('No agents configured');
        return { agent: null, isValid: false, errors, warnings, usedFallback };
      }

      if (configuration.agents.length === 0) {
        errors.push('Agents array is empty');
        return { agent: null, isValid: false, errors, warnings, usedFallback };
      }

      const entryAgentName = configuration.entryAgent;

      // Case 1: No entry agent specified - use first agent as default
      if (!entryAgentName || entryAgentName.trim().length === 0) {
        agent = this.getDefaultEntryAgent(configuration.agents);
        if (agent) {
          warnings.push(`No entry agent specified, using first agent "${agent.name}" as default`);
          usedFallback = true;
          return { agent, isValid: true, errors, warnings, usedFallback };
        } else {
          errors.push('No agents available for default entry agent');
          return { agent: null, isValid: false, errors, warnings, usedFallback };
        }
      }

      // Case 2: Entry agent specified - validate it exists
      const validation = this.validateEntryAgentWithDetails(entryAgentName, configuration.agents);
      
      if (validation.isValid) {
        // Entry agent is valid - find and return it
        agent = configuration.agents.find(a => a.name === entryAgentName) || null;
        if (agent) {
          return { agent, isValid: true, errors, warnings, usedFallback };
        } else {
          // This shouldn't happen if validation passed, but handle it
          errors.push(`Entry agent "${entryAgentName}" validated but not found in agents array`);
        }
      } else {
        // Entry agent is invalid - try fallback
        errors.push(...validation.errors);
        
        const fallbackAgent = this.getDefaultEntryAgent(configuration.agents);
        if (fallbackAgent) {
          agent = fallbackAgent;
          warnings.push(`Entry agent "${entryAgentName}" not found, falling back to "${fallbackAgent.name}"`);
          usedFallback = true;
          
          // Log the error for debugging but don't fail the operation
          await this.errorHandler.handleError(
            new ConfigurationError(`Entry agent "${entryAgentName}" not found, using fallback`),
            createErrorContext(undefined, undefined, 'resolveEntryAgent', { 
              entryAgentName, 
              availableAgents: configuration.agents.map(a => a.name),
              fallbackAgent: fallbackAgent.name
            }),
            { notifyUser: false }
          );
          
          return { agent, isValid: true, errors: [], warnings, usedFallback };
        } else {
          errors.push('No fallback agent available');
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Error resolving entry agent: ${errorMessage}`);
      
      await this.errorHandler.handleError(
        new ConfigurationError(`Failed to resolve entry agent: ${errorMessage}`),
        createErrorContext(undefined, undefined, 'resolveEntryAgent', { configuration }),
        { notifyUser: false }
      );
    }

    return { agent, isValid: false, errors, warnings, usedFallback };
  }

  /**
   * Validates entry agent configuration and provides detailed error information
   */
  validateEntryAgentWithDetails(entryAgentName: string, agents: AgentConfiguration[]): ValidationResult {
    return ConfigurationValidator.validateEntryAgent(entryAgentName, agents);
  }

  /**
   * Gets entry agent name with fallback logic
   */
  getEntryAgentName(configuration: ExtensionConfiguration): string | null {
    const agent = this.getEntryAgent(configuration);
    return agent ? agent.name : null;
  }

  /**
   * Checks if the specified agent can serve as an entry agent
   */
  canServeAsEntryAgent(agentName: string, agents: AgentConfiguration[]): boolean {
    return agents.some(agent => agent.name === agentName);
  }

  /**
   * Gets all possible entry agent candidates from the configuration
   */
  getEntryAgentCandidates(configuration: ExtensionConfiguration): AgentConfiguration[] {
    if (!configuration || !configuration.agents || !Array.isArray(configuration.agents)) {
      return [];
    }
    return configuration.agents.slice(); // Return a copy
  }

  /**
   * Validates that an agent configuration is suitable for being an entry agent
   */
  validateAgentSuitabilityAsEntryAgent(agent: AgentConfiguration): ValidationResult {
    const errors: string[] = [];

    if (!agent) {
      errors.push('Agent configuration is null or undefined');
      return { isValid: false, errors };
    }

    // Basic agent validation
    const agentValidation = ConfigurationValidator.validateAgentConfiguration(agent);
    if (!agentValidation.isValid) {
      errors.push(...agentValidation.errors.map(error => `Agent validation failed: ${error}`));
    }

    // Entry agents should have some basic capabilities
    if (agent.systemPrompt && agent.systemPrompt.trim().length < 10) {
      errors.push('Entry agent should have a meaningful system prompt');
    }

    if (!agent.description || agent.description.trim().length === 0) {
      errors.push('Entry agent should have a description');
    }

    if (!agent.useFor || agent.useFor.trim().length === 0) {
      errors.push('Entry agent should have a "useFor" description');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Updates entry agent in configuration with validation
   */
  async updateEntryAgent(
    configuration: ExtensionConfiguration, 
    newEntryAgentName: string
  ): Promise<{ success: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate the new entry agent
      const validation = this.validateEntryAgentWithDetails(newEntryAgentName, configuration.agents);
      
      if (!validation.isValid) {
        errors.push(...validation.errors);
        return { success: false, errors, warnings };
      }

      // Find the agent to ensure it exists
      const targetAgent = configuration.agents.find(agent => agent.name === newEntryAgentName);
      if (!targetAgent) {
        errors.push(`Agent "${newEntryAgentName}" not found in configuration`);
        return { success: false, errors, warnings };
      }

      // Validate agent suitability
      const suitabilityValidation = this.validateAgentSuitabilityAsEntryAgent(targetAgent);
      if (!suitabilityValidation.isValid) {
        warnings.push(...suitabilityValidation.errors.map(error => `Warning: ${error}`));
      }

      // Update the configuration
      const oldEntryAgent = configuration.entryAgent;
      configuration.entryAgent = newEntryAgentName;

      if (oldEntryAgent && oldEntryAgent !== newEntryAgentName) {
        warnings.push(`Entry agent changed from "${oldEntryAgent}" to "${newEntryAgentName}"`);
      }

      return { success: true, errors, warnings };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to update entry agent: ${errorMessage}`);
      
      await this.errorHandler.handleError(
        new ConfigurationError(`Failed to update entry agent: ${errorMessage}`),
        createErrorContext(undefined, undefined, 'updateEntryAgent', { 
          configuration, 
          newEntryAgentName 
        }),
        { notifyUser: false }
      );

      return { success: false, errors, warnings };
    }
  }

  /**
   * Gets entry agent resolution status for debugging
   */
  async getEntryAgentStatus(configuration: ExtensionConfiguration): Promise<{
    configured: string | null;
    resolved: string | null;
    isValid: boolean;
    usedFallback: boolean;
    availableAgents: string[];
    errors: string[];
    warnings: string[];
  }> {
    const resolution = await this.resolveEntryAgent(configuration);
    
    return {
      configured: configuration.entryAgent || null,
      resolved: resolution.agent ? resolution.agent.name : null,
      isValid: resolution.isValid,
      usedFallback: resolution.usedFallback,
      availableAgents: configuration.agents ? configuration.agents.map(a => a.name) : [],
      errors: resolution.errors,
      warnings: resolution.warnings
    };
  }
}