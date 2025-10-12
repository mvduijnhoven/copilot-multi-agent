/**
 * Interfaces and types for system prompt building and delegation target management
 */

import { ExtensionConfiguration, AgentConfiguration, DelegationPermissions } from './agent-configuration';

/**
 * Represents a delegation target with name and description
 */
export interface DelegationTarget {
  name: string;
  useFor: string;
}

/**
 * Interface for building extended system prompts with delegation information
 */
export interface ISystemPromptBuilder {
  /**
   * Builds an extended system prompt that includes delegation information
   * @param basePrompt The original system prompt for the agent
   * @param agentName The name of the agent receiving the system prompt
   * @param configuration The complete extension configuration
   * @returns The extended system prompt with delegation information
   */
  buildSystemPrompt(
    basePrompt: string,
    agentName: string,
    configuration: ExtensionConfiguration
  ): string;

  /**
   * Determines available delegation targets for a specific agent
   * @param agentName The name of the agent to get delegation targets for
   * @param configuration The complete extension configuration
   * @returns Array of delegation targets the agent can delegate to
   */
  getDelegationTargets(
    agentName: string,
    configuration: ExtensionConfiguration
  ): DelegationTarget[];

  /**
   * Formats the delegation section to be appended to system prompts
   * @param targets Array of delegation targets
   * @returns Formatted delegation section string
   */
  formatDelegationSection(targets: DelegationTarget[]): string;

  /**
   * Gets enumerated agent names for delegateWork tool based on delegation permissions
   * @param agentName The name of the agent to get enumerated names for
   * @param configuration The complete extension configuration
   * @returns Array of agent names that can be used in delegateWork tool
   */
  getEnumeratedAgentNames(
    agentName: string,
    configuration: ExtensionConfiguration
  ): string[];
}