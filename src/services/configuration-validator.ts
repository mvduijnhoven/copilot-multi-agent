/**
 * Enhanced configuration validation service with runtime validation,
 * clear error messages, defaults, and migration support
 */

import { 
  ExtensionConfiguration,
  AgentConfiguration,
  DelegationPermissions,
  ToolPermissions,
  ValidationResult,
  ConfigurationValidator as BaseValidator,
  DEFAULT_EXTENSION_CONFIG
} from '../models/agent-configuration';
import { ConfigurationError } from '../models/errors';
import { ErrorHandler, createErrorContext } from './error-handler';

export interface ValidationOptions {
  strict: boolean;
  allowDefaults: boolean;
  migrateConfig: boolean;
}

export interface MigrationResult {
  migrated: boolean;
  changes: string[];
  config: ExtensionConfiguration;
}

export interface ConfigurationDefaults {
  agents: AgentConfiguration[];
  toolPermissions: ToolPermissions;
  delegationPermissions: DelegationPermissions;
}

/**
 * Enhanced configuration validator with runtime validation and migration
 */
export class EnhancedConfigurationValidator {
  private static readonly SUPPORTED_CONFIG_VERSIONS = ['1.0.0'];
  private static readonly CURRENT_CONFIG_VERSION = '1.0.0';
  private static readonly MAX_AGENTS = 20;
  private static readonly MAX_PROMPT_LENGTH = 5000;
  private static readonly MAX_DESCRIPTION_LENGTH = 500;

  /**
   * Validates configuration with enhanced error messages and context
   */
  static validateWithContext(
    config: any,
    context: string = 'configuration',
    options: Partial<ValidationOptions> = {}
  ): ValidationResult {
    const defaultOptions: ValidationOptions = {
      strict: true,
      allowDefaults: true,
      migrateConfig: true
    };

    const finalOptions = { ...defaultOptions, ...options };
    const errors: string[] = [];

    try {
      // Basic structure validation
      if (!config || typeof config !== 'object') {
        errors.push(`${context} must be a valid configuration object`);
        return { isValid: false, errors };
      }

      // Version check and migration
      if (finalOptions.migrateConfig) {
        const migrationResult = this.migrateConfiguration(config);
        if (migrationResult.migrated) {
          config = migrationResult.config;
          console.log(`Configuration migrated: ${migrationResult.changes.join(', ')}`);
        }
      }

      // Validate agents array
      const agentsValidation = this.validateAgentsWithContext(
        config.agents,
        `${context}.agents`,
        finalOptions
      );
      errors.push(...agentsValidation.errors);

      // Validate entry agent setting
      const entryAgentValidation = this.validateEntryAgentWithContext(
        config.entryAgent,
        config.agents,
        `${context}.entryAgent`,
        finalOptions
      );
      errors.push(...entryAgentValidation.errors);

      // Cross-validation (agent references, circular dependencies, etc.)
      const crossValidation = this.validateCrossReferences(
        config,
        `${context}`,
        finalOptions
      );
      errors.push(...crossValidation.errors);

      // Performance and limits validation
      const limitsValidation = this.validateLimits(config, `${context}`, finalOptions);
      errors.push(...limitsValidation.errors);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      errors.push(`${context} validation failed: ${errorMessage}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates entry agent setting with enhanced context
   */
  private static validateEntryAgentWithContext(
    entryAgent: any,
    agents: any[],
    context: string,
    options: ValidationOptions
  ): ValidationResult {
    const errors: string[] = [];

    if (!entryAgent) {
      if (options.allowDefaults && agents && agents.length > 0) {
        console.log(`${context}: Using first agent as default entry agent`);
        return { isValid: true, errors: [] };
      } else {
        errors.push(`${context}: Entry agent setting is required`);
        return { isValid: false, errors };
      }
    }

    if (typeof entryAgent !== 'string') {
      errors.push(`${context}: Must be a string, got ${typeof entryAgent}`);
      return { isValid: false, errors };
    }

    const trimmedEntryAgent = entryAgent.trim();
    if (trimmedEntryAgent.length === 0) {
      errors.push(`${context}: Cannot be empty or whitespace only`);
      return { isValid: false, errors };
    }

    // Validate that entry agent exists in agents array
    if (agents && Array.isArray(agents)) {
      const agentExists = agents.some((agent: any) => agent?.name === trimmedEntryAgent);
      if (!agentExists) {
        errors.push(`${context}: Entry agent "${trimmedEntryAgent}" does not exist in the agents configuration`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates agents array with enhanced context
   */
  private static validateAgentsWithContext(
    agents: any,
    context: string,
    options: ValidationOptions
  ): ValidationResult {
    const errors: string[] = [];

    if (!agents) {
      if (options.allowDefaults) {
        console.log(`${context}: Using default agents configuration`);
        return { isValid: true, errors: [] };
      } else {
        errors.push(`${context}: Agents configuration is required`);
        return { isValid: false, errors };
      }
    }

    if (!Array.isArray(agents)) {
      errors.push(`${context}: Must be an array, got ${typeof agents}`);
      return { isValid: false, errors };
    }

    if (agents.length === 0) {
      errors.push(`${context}: At least one agent must be configured`);
      return { isValid: false, errors };
    }

    // Validate agent count limits
    if (agents.length > this.MAX_AGENTS) {
      errors.push(`${context}: Too many agents (${agents.length}), maximum is ${this.MAX_AGENTS}`);
    }

    // Track agent names for duplicate detection
    const agentNames = new Set<string>();

    agents.forEach((agent: any, index: number) => {
      const agentContext = `${context}[${index}]`;

      // Validate agent structure
      const agentValidation = this.validateAgentWithContext(agent, agentContext, options);
      errors.push(...agentValidation.errors);

      // Check for duplicate names
      if (agent?.name) {
        if (agentNames.has(agent.name)) {
          errors.push(`${agentContext}.name: Duplicate agent name "${agent.name}"`);
        } else {
          agentNames.add(agent.name);
        }
      }
    });

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates individual agent configuration with enhanced context
   */
  private static validateAgentWithContext(
    agent: any,
    context: string,
    options: ValidationOptions
  ): ValidationResult {
    const errors: string[] = [];

    if (!agent || typeof agent !== 'object') {
      errors.push(`${context}: Must be an object, got ${typeof agent}`);
      return { isValid: false, errors };
    }

    // Validate agent name
    const nameValidation = this.validateAgentName(agent.name, `${context}.name`);
    errors.push(...nameValidation.errors);

    // Validate required fields
    const fieldValidations = [
      {
        field: 'systemPrompt',
        validator: (value: any) => this.validateSystemPrompt(value, `${context}.systemPrompt`)
      },
      {
        field: 'description',
        validator: (value: any) => this.validateDescription(value, `${context}.description`)
      },
      {
        field: 'useFor',
        validator: (value: any) => this.validateUseFor(value, `${context}.useFor`)
      },
      {
        field: 'delegationPermissions',
        validator: (value: any) => this.validateDelegationPermissionsWithContext(value, `${context}.delegationPermissions`, options.allowDefaults)
      },
      {
        field: 'toolPermissions',
        validator: (value: any) => this.validateToolPermissionsWithContext(value, `${context}.toolPermissions`, options.allowDefaults)
      }
    ];

    fieldValidations.forEach(({ field, validator }) => {
      const validation = validator(agent[field]);
      errors.push(...validation.errors);
    });

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates agent name with enhanced error messages
   */
  private static validateAgentName(name: any, context: string): ValidationResult {
    const errors: string[] = [];

    if (name === null || name === undefined) {
      errors.push(`${context}: Agent name is required`);
      return { isValid: false, errors };
    }

    if (typeof name !== 'string') {
      errors.push(`${context}: Must be a string, got ${typeof name}`);
      return { isValid: false, errors };
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      errors.push(`${context}: Cannot be empty or whitespace only`);
      return { isValid: false, errors };
    }

    if (trimmedName.length > 50) {
      errors.push(`${context}: Too long (${trimmedName.length} characters), maximum is 50`);
    }

    if (!/^[a-zA-Z0-9-_]+$/.test(trimmedName)) {
      errors.push(`${context}: Can only contain letters, numbers, hyphens, and underscores. Got "${trimmedName}"`);
    }



    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates system prompt with enhanced error messages
   */
  private static validateSystemPrompt(prompt: any, context: string): ValidationResult {
    const errors: string[] = [];

    if (!prompt) {
      errors.push(`${context}: System prompt is required`);
      return { isValid: false, errors };
    }

    if (typeof prompt !== 'string') {
      errors.push(`${context}: Must be a string, got ${typeof prompt}`);
      return { isValid: false, errors };
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      errors.push(`${context}: Cannot be empty or whitespace only`);
    }

    if (trimmedPrompt.length > this.MAX_PROMPT_LENGTH) {
      errors.push(`${context}: Too long (${trimmedPrompt.length} characters), maximum is ${this.MAX_PROMPT_LENGTH}`);
    }

    if (trimmedPrompt.length < 10) {
      errors.push(`${context}: Too short (${trimmedPrompt.length} characters), minimum is 10`);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates description with enhanced error messages
   */
  private static validateDescription(description: any, context: string): ValidationResult {
    const errors: string[] = [];

    if (!description) {
      errors.push(`${context}: Description is required`);
      return { isValid: false, errors };
    }

    if (typeof description !== 'string') {
      errors.push(`${context}: Must be a string, got ${typeof description}`);
      return { isValid: false, errors };
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
      errors.push(`${context}: Cannot be empty or whitespace only`);
    }

    if (trimmedDescription.length > this.MAX_DESCRIPTION_LENGTH) {
      errors.push(`${context}: Too long (${trimmedDescription.length} characters), maximum is ${this.MAX_DESCRIPTION_LENGTH}`);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates useFor field with enhanced error messages
   */
  private static validateUseFor(useFor: any, context: string): ValidationResult {
    const errors: string[] = [];

    if (!useFor) {
      errors.push(`${context}: Use for description is required`);
      return { isValid: false, errors };
    }

    if (typeof useFor !== 'string') {
      errors.push(`${context}: Must be a string, got ${typeof useFor}`);
      return { isValid: false, errors };
    }

    const trimmedUseFor = useFor.trim();
    if (trimmedUseFor.length === 0) {
      errors.push(`${context}: Cannot be empty or whitespace only`);
    }

    if (trimmedUseFor.length > this.MAX_DESCRIPTION_LENGTH) {
      errors.push(`${context}: Too long (${trimmedUseFor.length} characters), maximum is ${this.MAX_DESCRIPTION_LENGTH}`);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates delegation permissions with enhanced context
   */
  private static validateDelegationPermissionsWithContext(
    permissions: any,
    context: string,
    allowDefaults: boolean = false
  ): ValidationResult {
    const errors: string[] = [];

    if (!permissions) {
      if (allowDefaults) {
        // Allow null/undefined permissions when defaults are enabled
        return { isValid: true, errors: [] };
      }
      errors.push(`${context}: Delegation permissions are required`);
      return { isValid: false, errors };
    }

    if (typeof permissions !== 'object') {
      errors.push(`${context}: Must be an object, got ${typeof permissions}`);
      return { isValid: false, errors };
    }

    const { type } = permissions;
    if (!type) {
      errors.push(`${context}.type: Permission type is required`);
    } else if (!['all', 'none', 'specific'].includes(type)) {
      errors.push(`${context}.type: Must be "all", "none", or "specific", got "${type}"`);
    }

    if (type === 'specific') {
      const { agents } = permissions;
      if (!agents) {
        errors.push(`${context}.agents: Agent list is required for specific permissions`);
      } else if (!Array.isArray(agents)) {
        errors.push(`${context}.agents: Must be an array, got ${typeof agents}`);
      } else {
        if (agents.length === 0) {
          errors.push(`${context}.agents: Cannot be empty for specific permissions`);
        }

        agents.forEach((agent, index) => {
          if (typeof agent !== 'string') {
            errors.push(`${context}.agents[${index}]: Must be a string, got ${typeof agent}`);
          } else if (agent.trim().length === 0) {
            errors.push(`${context}.agents[${index}]: Cannot be empty or whitespace only`);
          }
        });

        // Check for duplicates
        const uniqueAgents = new Set(agents);
        if (uniqueAgents.size !== agents.length) {
          errors.push(`${context}.agents: Contains duplicate agent names`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates tool permissions with enhanced context
   */
  private static validateToolPermissionsWithContext(
    permissions: any,
    context: string,
    allowDefaults: boolean = false
  ): ValidationResult {
    const errors: string[] = [];

    if (!permissions) {
      if (allowDefaults) {
        // Allow null/undefined permissions when defaults are enabled
        return { isValid: true, errors: [] };
      }
      errors.push(`${context}: Tool permissions are required`);
      return { isValid: false, errors };
    }

    if (typeof permissions !== 'object') {
      errors.push(`${context}: Must be an object, got ${typeof permissions}`);
      return { isValid: false, errors };
    }

    const { type } = permissions;
    if (!type) {
      errors.push(`${context}.type: Permission type is required`);
    } else if (!['all', 'none', 'specific'].includes(type)) {
      errors.push(`${context}.type: Must be "all", "none", or "specific", got "${type}"`);
    }

    if (type === 'specific') {
      const { tools } = permissions;
      if (!tools) {
        errors.push(`${context}.tools: Tool list is required for specific permissions`);
      } else if (!Array.isArray(tools)) {
        errors.push(`${context}.tools: Must be an array, got ${typeof tools}`);
      } else {
        if (tools.length === 0) {
          errors.push(`${context}.tools: Cannot be empty for specific permissions`);
        }

        tools.forEach((tool, index) => {
          if (typeof tool !== 'string') {
            errors.push(`${context}.tools[${index}]: Must be a string, got ${typeof tool}`);
          } else if (tool.trim().length === 0) {
            errors.push(`${context}.tools[${index}]: Cannot be empty or whitespace only`);
          }
        });

        // Check for duplicates
        const uniqueTools = new Set(tools);
        if (uniqueTools.size !== tools.length) {
          errors.push(`${context}.tools: Contains duplicate tool names`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates cross-references between agents
   */
  private static validateCrossReferences(
    config: any,
    context: string,
    options: ValidationOptions
  ): ValidationResult {
    const errors: string[] = [];

    try {
      // Collect all agent names
      const allAgentNames = new Set<string>();
      if (config.agents && Array.isArray(config.agents)) {
        config.agents.forEach((agent: any) => {
          if (agent?.name) {
            allAgentNames.add(agent.name);
          }
        });
      }

      // Validate agent delegation references
      if (config.agents && Array.isArray(config.agents)) {
        config.agents.forEach((agent: any, agentIndex: number) => {
          if (agent?.delegationPermissions?.type === 'specific') {
            const agentDelegations = agent.delegationPermissions.agents || [];
            agentDelegations.forEach((targetAgent: string, delegationIndex: number) => {
              if (!allAgentNames.has(targetAgent)) {
                errors.push(`${context}.agents[${agentIndex}].delegationPermissions.agents[${delegationIndex}]: References non-existent agent "${targetAgent}"`);
              }
            });
          }
        });
      }

      // Check for potential circular delegation
      const circularCheck = this.detectCircularDelegation(config);
      if (circularCheck.hasCircular) {
        errors.push(`${context}: Potential circular delegation detected: ${circularCheck.cycles.join(', ')}`);
      }

    } catch (error) {
      errors.push(`${context}: Error validating cross-references: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates configuration limits and performance constraints
   */
  private static validateLimits(
    config: any,
    context: string,
    options: ValidationOptions
  ): ValidationResult {
    const errors: string[] = [];

    // Check total agent count
    const totalAgents = config.agents?.length || 0;
    if (totalAgents > this.MAX_AGENTS) {
      errors.push(`${context}: Too many total agents (${totalAgents}), maximum is ${this.MAX_AGENTS}`);
    }

    // Check for excessive delegation complexity
    let totalDelegationTargets = 0;
    if (config.agents && Array.isArray(config.agents)) {
      config.agents.forEach((agent: any) => {
        if (agent?.delegationPermissions?.type === 'specific') {
          totalDelegationTargets += agent.delegationPermissions.agents?.length || 0;
        }
      });
    }

    if (totalDelegationTargets > 100) {
      errors.push(`${context}: Too many delegation relationships (${totalDelegationTargets}), consider simplifying`);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Detects potential circular delegation patterns
   */
  private static detectCircularDelegation(config: any): { hasCircular: boolean; cycles: string[] } {
    const cycles: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const buildDelegationGraph = (): Map<string, string[]> => {
      const graph = new Map<string, string[]>();

      // Add agent delegations
      if (config.agents && Array.isArray(config.agents)) {
        config.agents.forEach((agent: any) => {
          if (agent?.name) {
            if (agent.delegationPermissions?.type === 'specific') {
              graph.set(agent.name, agent.delegationPermissions.agents || []);
            } else if (agent.delegationPermissions?.type === 'all') {
              const allOtherAgents = config.agents.map((a: any) => a.name).filter((n: string) => n !== agent.name && Boolean(n));
              graph.set(agent.name, allOtherAgents);
            }
          }
        });
      }

      return graph;
    };

    const dfs = (node: string, path: string[], graph: Map<string, string[]>): boolean => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).concat(node);
        cycles.push(cycle.join(' -> '));
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor, [...path], graph)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    const graph = buildDelegationGraph();
    let hasCircular = false;

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node, [], graph)) {
          hasCircular = true;
        }
      }
    }

    return { hasCircular, cycles };
  }

  /**
   * Migrates configuration to current version
   */
  static migrateConfiguration(config: any): MigrationResult {
    const changes: string[] = [];
    let migrated = false;
    let migratedConfig = JSON.parse(JSON.stringify(config));

    // Add version if missing
    if (!migratedConfig.version) {
      migratedConfig.version = this.CURRENT_CONFIG_VERSION;
      changes.push('Added version field');
      migrated = true;
    }

    // Migrate from old coordinator/customAgents structure to new agents structure
    if (migratedConfig.coordinator || migratedConfig.customAgents) {
      const agents: any[] = [];
      
      // Add coordinator as first agent if it exists
      if (migratedConfig.coordinator) {
        agents.push(migratedConfig.coordinator);
      }
      
      // Add custom agents
      if (Array.isArray(migratedConfig.customAgents)) {
        agents.push(...migratedConfig.customAgents);
      }
      
      migratedConfig.agents = agents;
      
      // Set entry agent if not already set
      if (!migratedConfig.entryAgent && agents.length > 0) {
        migratedConfig.entryAgent = agents[0].name;
      }
      
      // Remove old structure
      delete migratedConfig.coordinator;
      delete migratedConfig.customAgents;
      
      changes.push('Migrated from coordinator/customAgents structure to unified agents structure');
      migrated = true;
    }

    // Ensure agents is an array
    if (!Array.isArray(migratedConfig.agents)) {
      migratedConfig.agents = DEFAULT_EXTENSION_CONFIG.agents;
      changes.push('Initialized agents array with default configuration');
      migrated = true;
    }

    // Ensure entryAgent is set
    if (!migratedConfig.entryAgent && migratedConfig.agents.length > 0) {
      migratedConfig.entryAgent = migratedConfig.agents[0].name;
      changes.push('Set entry agent to first configured agent');
      migrated = true;
    }

    // Migrate old permission formats (if any legacy formats exist)
    const migratePermissions = (permissions: any, type: string): any => {
      if (!permissions) {
        return type === 'delegation' 
          ? { type: 'none' }
          : { type: 'all' };
      }

      // Handle legacy boolean format
      if (typeof permissions === 'boolean') {
        changes.push(`Migrated legacy ${type} permissions from boolean to object format`);
        migrated = true;
        return permissions ? { type: 'all' } : { type: 'none' };
      }

      return permissions;
    };

    // Migrate agent permissions
    if (migratedConfig.agents && Array.isArray(migratedConfig.agents)) {
      migratedConfig.agents.forEach((agent: any, index: number) => {
        agent.delegationPermissions = migratePermissions(agent.delegationPermissions, 'delegation');
        agent.toolPermissions = migratePermissions(agent.toolPermissions, 'tool');
      });
    }

    return {
      migrated,
      changes,
      config: migratedConfig
    };
  }

  /**
   * Gets default configuration with all required fields
   */
  static getDefaultConfiguration(): ExtensionConfiguration {
    return JSON.parse(JSON.stringify(DEFAULT_EXTENSION_CONFIG));
  }

  /**
   * Applies defaults to partial configuration
   */
  static applyDefaults(partialConfig: Partial<ExtensionConfiguration>): ExtensionConfiguration {
    const defaultConfig = this.getDefaultConfiguration();

    return {
      entryAgent: partialConfig.entryAgent || defaultConfig.entryAgent,
      agents: partialConfig.agents || defaultConfig.agents
    };
  }

  /**
   * Validates and fixes configuration with error handling
   */
  static async validateAndFix(
    config: any,
    context: string = 'configuration'
  ): Promise<{ config: ExtensionConfiguration; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let fixedConfig: ExtensionConfiguration;

    try {
      // First, try migration
      const migrationResult = this.migrateConfiguration(config);
      if (migrationResult.migrated) {
        warnings.push(...migrationResult.changes.map(change => `Migration: ${change}`));
      }

      // Validate the migrated config
      const validation = this.validateWithContext(migrationResult.config, context);
      
      if (validation.isValid) {
        fixedConfig = migrationResult.config;
      } else {
        // If validation fails, apply defaults and try again
        warnings.push('Configuration validation failed, applying defaults');
        fixedConfig = this.applyDefaults(migrationResult.config);
        
        // Validate the fixed config
        const fixedValidation = this.validateWithContext(fixedConfig, context);
        if (!fixedValidation.isValid) {
          // If even defaults fail, use complete default config
          errors.push(...fixedValidation.errors);
          fixedConfig = this.getDefaultConfiguration();
          warnings.push('Using complete default configuration due to validation failures');
        }
      }

      // Log validation results
      if (errors.length > 0) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handleError(
          new ConfigurationError(`Configuration validation failed: ${errors.join(', ')}`),
          createErrorContext(undefined, undefined, 'validateConfiguration', { errors, warnings }),
          { notifyUser: false }
        );
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Configuration processing failed: ${errorMessage}`);
      fixedConfig = this.getDefaultConfiguration();
      warnings.push('Using complete default configuration due to processing error');
    }

    return { config: fixedConfig, errors, warnings };
  }
}

/**
 * Utility function for runtime configuration validation
 */
export async function validateConfiguration(
  config: any,
  context: string = 'configuration'
): Promise<{ isValid: boolean; config: ExtensionConfiguration; errors: string[]; warnings: string[] }> {
  const result = await EnhancedConfigurationValidator.validateAndFix(config, context);
  
  return {
    isValid: result.errors.length === 0,
    config: result.config,
    errors: result.errors,
    warnings: result.warnings
  };
}