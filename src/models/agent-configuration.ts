/**
 * Core interfaces for agent configuration and management
 */

export interface AgentConfiguration {
  name: string;
  systemPrompt: string;
  description: string;
  useFor: string;
  delegationPermissions: DelegationPermissions;
  toolPermissions: ToolPermissions;
}

export interface CoordinatorConfiguration extends Omit<AgentConfiguration, 'name'> {
  name: 'coordinator';
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
  coordinator: CoordinatorConfiguration;
  customAgents: AgentConfiguration[];
}

export interface AgentExecutionContext {
  agentName: string;
  conversationId: string;
  parentConversationId?: string;
  systemPrompt: string;
  availableTools: any[]; // Will be typed as vscode.LanguageModelTool[] when available
  delegationChain: string[];
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

    if (!permissions || typeof permissions !== 'object') {
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

    if (!permissions || typeof permissions !== 'object') {
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

    if (!config || typeof config !== 'object') {
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
   * Validates coordinator configuration
   */
  static validateCoordinatorConfiguration(config: any): ValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('Coordinator configuration must be an object');
      return { isValid: false, errors };
    }

    // Coordinator must have name 'coordinator'
    if (config.name !== 'coordinator') {
      errors.push('Coordinator name must be "coordinator"');
    }

    // Validate other fields using agent validation
    const agentValidation = this.validateAgentConfiguration({
      ...config,
      name: 'coordinator' // Override name for validation
    });
    
    // Filter out name-related errors since we handle that separately
    const filteredErrors = agentValidation.errors.filter(error => 
      !error.includes('Agent name')
    );
    errors.push(...filteredErrors);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates extension configuration
   */
  static validateExtensionConfiguration(config: any): ValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('Extension configuration must be an object');
      return { isValid: false, errors };
    }

    // Validate coordinator
    if (!config.coordinator) {
      errors.push('Coordinator configuration is required');
    } else {
      const coordinatorValidation = this.validateCoordinatorConfiguration(config.coordinator);
      errors.push(...coordinatorValidation.errors.map(error => `Coordinator: ${error}`));
    }

    // Validate custom agents
    if (!Array.isArray(config.customAgents)) {
      errors.push('Custom agents must be an array');
    } else {
      const agentNames = new Set<string>();
      agentNames.add('coordinator'); // Reserve coordinator name

      config.customAgents.forEach((agent: any, index: number) => {
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

      // Validate delegation references
      const allAgentNames = Array.from(agentNames);
      config.customAgents.forEach((agent: any, index: number) => {
        if (agent?.delegationPermissions?.type === 'specific') {
          agent.delegationPermissions.agents?.forEach((targetAgent: string) => {
            if (!allAgentNames.includes(targetAgent)) {
              errors.push(`Agent ${index + 1}: References non-existent agent "${targetAgent}" in delegation permissions`);
            }
          });
        }
      });

      // Validate coordinator delegation references
      if (config.coordinator?.delegationPermissions?.type === 'specific') {
        config.coordinator.delegationPermissions.agents?.forEach((targetAgent: string) => {
          if (!allAgentNames.includes(targetAgent)) {
            errors.push(`Coordinator: References non-existent agent "${targetAgent}" in delegation permissions`);
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Default configurations
 */
export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfiguration = {
  name: 'coordinator',
  systemPrompt: 'You are a coordinator agent responsible for orchestrating tasks and delegating work to specialized agents. Analyze the user\'s request and determine if it can be handled directly or if it should be delegated to a more specialized agent.',
  description: 'Coordinates work between specialized agents',
  useFor: 'Task orchestration and delegation',
  delegationPermissions: { type: 'all' },
  toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
};

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfiguration = {
  coordinator: DEFAULT_COORDINATOR_CONFIG,
  customAgents: []
};