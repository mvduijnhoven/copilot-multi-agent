/**
 * Core interfaces for agent configuration and management
 */

import { DelegationTarget } from './system-prompt-builder';

export interface AgentConfiguration {
  name: string;
  systemPrompt: string;
  description: string;
  useFor: string;
  delegationPermissions: DelegationPermissions;
  toolPermissions: ToolPermissions;
}

export type DelegationPermissions = 
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'specific'; agents: string[] };

export type ToolPermissions = 
  | { type: 'all' }
  | { type: 'none' }
  | { type: 'specific'; tools: string[] };

export interface ExtensionConfiguration {
  entryAgent: string;
  agents: AgentConfiguration[];
  version?: string;
}

export interface AgentExecutionContext {
  agentName: string;
  conversationId: string;
  parentConversationId?: string;
  systemPrompt: string;
  availableTools: any[]; // Will be typed as vscode.LanguageModelTool[] when available
  delegationChain: string[];
  availableDelegationTargets: DelegationTarget[];
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Configuration validation functions
 */
export class ConfigurationValidator {
  /**
   * Validates an agent name
   */
  static validateAgentName(name: string): ValidationResult {
    const errors: string[] = [];

    if (name === null || name === undefined || typeof name !== 'string') {
      errors.push('Agent name is required and must be a string');
    } else if (name.trim().length === 0) {
      errors.push('Agent name cannot be empty');
    } else {
      if (name.length > 50) {
        errors.push('Agent name must be 50 characters or less');
      }
      if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        errors.push('Agent name can only contain letters, numbers, hyphens, and underscores');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates delegation permissions
   */
  static validateDelegationPermissions(permissions: any): ValidationResult {
    const errors: string[] = [];

    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      errors.push('Delegation permissions must be an object');
      return { isValid: false, errors };
    }

    const { type } = permissions;
    if (!type || !['all', 'none', 'specific'].includes(type)) {
      errors.push('Delegation permissions type must be "all", "none", or "specific"');
    }

    if (type === 'specific') {
      const { agents } = permissions;
      if (!Array.isArray(agents)) {
        errors.push('Specific delegation permissions must include an agents array');
      } else {
        agents.forEach((agent, index) => {
          if (typeof agent !== 'string' || agent.trim().length === 0) {
            errors.push(`Agent at index ${index} must be a non-empty string`);
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates tool permissions
   */
  static validateToolPermissions(permissions: any): ValidationResult {
    const errors: string[] = [];

    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      errors.push('Tool permissions must be an object');
      return { isValid: false, errors };
    }

    const { type } = permissions;
    if (!type || !['all', 'none', 'specific'].includes(type)) {
      errors.push('Tool permissions type must be "all", "none", or "specific"');
    }

    if (type === 'specific') {
      const { tools } = permissions;
      if (!Array.isArray(tools)) {
        errors.push('Specific tool permissions must include a tools array');
      } else {
        tools.forEach((tool, index) => {
          if (typeof tool !== 'string' || tool.trim().length === 0) {
            errors.push(`Tool at index ${index} must be a non-empty string`);
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates an agent configuration
   */
  static validateAgentConfiguration(config: any): ValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      errors.push('Agent configuration must be an object');
      return { isValid: false, errors };
    }

    // Validate name
    const nameValidation = this.validateAgentName(config.name);
    errors.push(...nameValidation.errors);

    // Validate required string fields
    const requiredStringFields = ['systemPrompt', 'description', 'useFor'];
    requiredStringFields.forEach(field => {
      if (!config[field] || typeof config[field] !== 'string') {
        errors.push(`${field} is required and must be a string`);
      } else if (config[field].trim().length === 0) {
        errors.push(`${field} cannot be empty`);
      }
    });

    // Validate delegation permissions
    const delegationValidation = this.validateDelegationPermissions(config.delegationPermissions);
    errors.push(...delegationValidation.errors);

    // Validate tool permissions
    const toolValidation = this.validateToolPermissions(config.toolPermissions);
    errors.push(...toolValidation.errors);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates entry agent setting
   */
  static validateEntryAgent(entryAgent: string, agents: AgentConfiguration[]): ValidationResult {
    const errors: string[] = [];

    if (typeof entryAgent !== 'string') {
      errors.push('Entry agent must be a non-empty string');
      return { isValid: false, errors };
    }

    if (!entryAgent || entryAgent.trim().length === 0) {
      errors.push('Entry agent cannot be empty');
      return { isValid: false, errors };
    }

    // Check if entry agent exists in agents array
    const agentExists = agents.some(agent => agent.name === entryAgent);
    if (!agentExists) {
      errors.push(`Entry agent "${entryAgent}" does not exist in the agents configuration`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets the default entry agent from a list of agents
   */
  static getDefaultEntryAgent(agents: AgentConfiguration[]): string | null {
    if (agents.length === 0) {
      return null;
    }
    return agents[0].name;
  }

  /**
   * Validates and returns a safe entry agent name
   */
  static validateAndGetEntryAgent(entryAgent: string | undefined, agents: AgentConfiguration[]): ValidationResult & { entryAgent?: string } {
    const errors: string[] = [];

    if (agents.length === 0) {
      errors.push('Cannot determine entry agent: no agents configured');
      return { isValid: false, errors };
    }

    // If no entry agent specified, use first agent
    if (!entryAgent || entryAgent.trim().length === 0) {
      const defaultEntryAgent = this.getDefaultEntryAgent(agents);
      return {
        isValid: true,
        errors: [],
        entryAgent: defaultEntryAgent!
      };
    }

    // Validate specified entry agent
    const validation = this.validateEntryAgent(entryAgent, agents);
    return {
      ...validation,
      entryAgent: validation.isValid ? entryAgent : undefined
    };
  }

  /**
   * Validates extension configuration
   */
  static validateExtensionConfiguration(config: any): ValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      errors.push('Extension configuration must be an object');
      return { isValid: false, errors };
    }

    // Validate agents array
    if (!Array.isArray(config.agents)) {
      errors.push('Agents must be an array');
      return { isValid: false, errors };
    }

    if (config.agents.length === 0) {
      errors.push('At least one agent must be configured');
      return { isValid: false, errors };
    }

    // Validate each agent and collect names
    const agentNames = new Set<string>();
    config.agents.forEach((agent: any, index: number) => {
      const agentValidation = this.validateAgentConfiguration(agent);
      errors.push(...agentValidation.errors.map(error => `Agent ${index + 1}: ${error}`));

      // Check for duplicate names
      if (agent && agent.name) {
        if (agentNames.has(agent.name)) {
          errors.push(`Agent ${index + 1}: Duplicate agent name "${agent.name}"`);
        } else {
          agentNames.add(agent.name);
        }
      }
    });

    // Validate entry agent
    if (config.entryAgent !== undefined && config.entryAgent !== null) {
      const entryAgentValidation = this.validateEntryAgent(config.entryAgent, config.agents);
      errors.push(...entryAgentValidation.errors);
    }

    // Validate delegation references
    const allAgentNames = Array.from(agentNames);
    config.agents.forEach((agent: any, index: number) => {
      if (agent?.delegationPermissions?.type === 'specific') {
        agent.delegationPermissions.agents?.forEach((targetAgent: string) => {
          if (!allAgentNames.includes(targetAgent)) {
            errors.push(`Agent ${index + 1}: References non-existent agent "${targetAgent}" in delegation permissions`);
          }
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Default configurations
 */
export const DEFAULT_COORDINATOR_AGENT: AgentConfiguration = {
  name: 'coordinator',
  systemPrompt: 'You are a coordinator agent responsible for orchestrating tasks and delegating work to specialized agents. Analyze the user\'s request and determine if it can be handled directly or if it should be delegated to a more specialized agent.',
  description: 'Coordinates work between specialized agents',
  useFor: 'Task orchestration and delegation',
  delegationPermissions: { type: 'all' },
  toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
};

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfiguration = {
  entryAgent: 'coordinator',
  agents: [DEFAULT_COORDINATOR_AGENT]
};