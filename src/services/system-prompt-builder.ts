/**
 * Service for building extended system prompts with delegation information
 */

import { 
  ISystemPromptBuilder, 
  DelegationTarget 
} from '../models/system-prompt-builder';
import { 
  ExtensionConfiguration, 
  AgentConfiguration, 
  DelegationPermissions 
} from '../models/agent-configuration';

/**
 * Implementation of system prompt builder that extends agent system prompts
 * with delegation information based on their permissions
 */
export class SystemPromptBuilder implements ISystemPromptBuilder {
  
  /**
   * Builds an extended system prompt that includes delegation information
   */
  buildSystemPrompt(
    basePrompt: string,
    agentName: string,
    configuration: ExtensionConfiguration
  ): string {
    // Get delegation targets for this agent
    const delegationTargets = this.getDelegationTargets(agentName, configuration);
    
    // If no delegation targets, return the base prompt unchanged
    if (delegationTargets.length === 0) {
      return basePrompt;
    }
    
    // Build extended prompt with delegation information
    const delegationSection = this.formatDelegationSection(delegationTargets);
    
    return `${basePrompt}\n\n${delegationSection}`;
  }

  /**
   * Determines available delegation targets for a specific agent
   */
  getDelegationTargets(
    agentName: string,
    configuration: ExtensionConfiguration
  ): DelegationTarget[] {
    // Find the agent configuration
    const agentConfig = this.findAgentConfiguration(agentName, configuration);
    
    if (!agentConfig) {
      return [];
    }
    
    // Get delegation permissions
    const delegationPermissions = agentConfig.delegationPermissions;
    
    // Handle different delegation permission types
    switch (delegationPermissions.type) {
      case 'none':
        return [];
        
      case 'all':
        return this.getAllOtherAgents(agentName, configuration);
        
      case 'specific':
        return this.getSpecificAgents(delegationPermissions.agents, configuration);
        
      default:
        return [];
    }
  }

  /**
   * Formats the delegation section to be appended to system prompts
   */
  formatDelegationSection(targets: DelegationTarget[]): string {
    if (targets.length === 0) {
      return '';
    }
    
    const targetList = targets
      .map(target => `- **${target.name}**: ${target.useFor}`)
      .join('\n');
    
    const agentNames = targets.map(target => target.name).join(', ');
    
    return `## Available Agents for Delegation

You can delegate work to the following agents using the delegateWork tool:

${targetList}

When using the delegateWork tool, use one of these agent names: ${agentNames}`;
  }

  /**
   * Gets enumerated agent names for delegateWork tool based on delegation permissions
   */
  getEnumeratedAgentNames(
    agentName: string,
    configuration: ExtensionConfiguration
  ): string[] {
    const delegationTargets = this.getDelegationTargets(agentName, configuration);
    return delegationTargets.map(target => target.name);
  }

  /**
   * Finds agent configuration by name
   */
  private findAgentConfiguration(
    agentName: string,
    configuration: ExtensionConfiguration
  ): AgentConfiguration | null {
    return configuration.agents.find(agent => agent.name === agentName) || null;
  }

  /**
   * Gets all other agents except the current one
   */
  private getAllOtherAgents(
    currentAgentName: string,
    configuration: ExtensionConfiguration
  ): DelegationTarget[] {
    const targets: DelegationTarget[] = [];
    
    // Add all agents except current one
    configuration.agents.forEach(agent => {
      if (agent.name !== currentAgentName) {
        targets.push({
          name: agent.name,
          useFor: agent.useFor
        });
      }
    });
    
    return targets;
  }

  /**
   * Gets specific agents by their names
   */
  private getSpecificAgents(
    agentNames: string[],
    configuration: ExtensionConfiguration
  ): DelegationTarget[] {
    const targets: DelegationTarget[] = [];
    
    agentNames.forEach(agentName => {
      const agentConfig = this.findAgentConfiguration(agentName, configuration);
      if (agentConfig) {
        targets.push({
          name: agentConfig.name,
          useFor: agentConfig.useFor
        });
      }
    });
    
    return targets;
  }
}