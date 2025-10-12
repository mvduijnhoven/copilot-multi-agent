/**
 * Agent engine service for managing agent execution contexts and lifecycle
 */

import { AgentConfiguration, AgentExecutionContext, AgentExecutionError } from '../models';
import { ToolFilter } from './tool-filter';
import { v4 as uuidv4 } from 'uuid';

export interface AgentEngine {
  /**
   * Initializes an agent with its configuration
   * @param config The agent configuration
   * @returns The agent execution context
   */
  initializeAgent(config: AgentConfiguration): Promise<AgentExecutionContext>;
  
  /**
   * Executes an agent with the given context and input
   * @param context The agent execution context
   * @param input The input message or request
   * @returns Promise resolving to the agent's response
   */
  executeAgent(context: AgentExecutionContext, input: string): Promise<string>;
  
  /**
   * Gets an agent's execution context by name
   * @param agentName The name of the agent
   * @returns The agent's execution context if found
   */
  getAgentContext(agentName: string): AgentExecutionContext | undefined;
  
  /**
   * Terminates an agent's execution
   * @param agentName The name of the agent to terminate
   */
  terminateAgent(agentName: string): void;
  
  /**
   * Lists all active agent contexts
   * @returns Array of active agent execution contexts
   */
  getActiveAgents(): AgentExecutionContext[];
}

/**
 * Concrete implementation of the AgentEngine interface
 */
export class DefaultAgentEngine implements AgentEngine {
  private activeContexts: Map<string, AgentExecutionContext> = new Map();
  private toolFilter: ToolFilter;

  constructor(toolFilter: ToolFilter) {
    this.toolFilter = toolFilter;
  }

  /**
   * Initializes an agent with its configuration
   */
  async initializeAgent(config: AgentConfiguration): Promise<AgentExecutionContext> {
    try {
      // Generate unique conversation ID
      const conversationId = uuidv4();
      
      // Get available tools for this agent
      const availableTools = await this.toolFilter.getAvailableTools(config.name);
      
      // Create execution context
      const context: AgentExecutionContext = {
        agentName: config.name,
        conversationId,
        systemPrompt: config.systemPrompt,
        availableTools,
        delegationChain: [],
        availableDelegationTargets: []
      };

      // Store the context
      this.activeContexts.set(config.name, context);

      return context;
    } catch (error) {
      throw new AgentExecutionError(
        `Failed to initialize agent "${config.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        config.name,
        { originalError: error }
      );
    }
  }

  /**
   * Creates a child agent context for delegation
   */
  async initializeChildAgent(
    config: AgentConfiguration, 
    parentContext: AgentExecutionContext
  ): Promise<AgentExecutionContext> {
    try {
      // Generate unique conversation ID for child
      const conversationId = uuidv4();
      
      // Get available tools for this agent
      const availableTools = await this.toolFilter.getAvailableTools(config.name);
      
      // Create child execution context with delegation chain
      const context: AgentExecutionContext = {
        agentName: config.name,
        conversationId,
        parentConversationId: parentContext.conversationId,
        systemPrompt: config.systemPrompt,
        availableTools,
        delegationChain: [...parentContext.delegationChain, parentContext.agentName],
        availableDelegationTargets: []
      };

      // Validate delegation chain to prevent circular delegation
      if (context.delegationChain.includes(config.name)) {
        throw new AgentExecutionError(
          `Circular delegation detected: ${context.delegationChain.join(' -> ')} -> ${config.name}`,
          config.name,
          { delegationChain: context.delegationChain }
        );
      }

      // Store the context
      this.activeContexts.set(`${config.name}-${conversationId}`, context);

      return context;
    } catch (error) {
      throw new AgentExecutionError(
        `Failed to initialize child agent "${config.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        config.name,
        { 
          originalError: error,
          parentContext: parentContext.agentName 
        }
      );
    }
  }

  /**
   * Executes an agent with the given context and input
   */
  async executeAgent(context: AgentExecutionContext, input: string): Promise<string> {
    try {
      // Validate context
      if (!this.isValidContext(context)) {
        throw new AgentExecutionError(
          'Invalid agent execution context',
          context.agentName,
          { context }
        );
      }

      // Apply system prompt and context isolation
      const enhancedInput = this.applySystemPrompt(context, input);

      // For now, return a placeholder response since we don't have VS Code language model integration yet
      // This will be replaced with actual language model execution in a later task
      return `Agent ${context.agentName} processed: ${enhancedInput}`;
      
    } catch (error) {
      throw new AgentExecutionError(
        `Failed to execute agent "${context.agentName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        context.agentName,
        { 
          originalError: error,
          context 
        }
      );
    }
  }

  /**
   * Gets an agent's execution context by name
   */
  getAgentContext(agentName: string): AgentExecutionContext | undefined {
    return this.activeContexts.get(agentName);
  }

  /**
   * Gets an agent's execution context by conversation ID
   */
  getAgentContextByConversation(conversationId: string): AgentExecutionContext | undefined {
    for (const context of this.activeContexts.values()) {
      if (context.conversationId === conversationId) {
        return context;
      }
    }
    return undefined;
  }

  /**
   * Terminates an agent's execution
   */
  terminateAgent(agentName: string): void {
    // Find and remove contexts for this agent (including child contexts)
    const keysToRemove: string[] = [];
    
    for (const [key, context] of this.activeContexts.entries()) {
      // Remove the agent itself
      if (context.agentName === agentName) {
        keysToRemove.push(key);
      }
      // Remove any child agents that have this agent in their delegation chain
      else if (context.delegationChain.includes(agentName)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      this.activeContexts.delete(key);
    });
  }

  /**
   * Terminates an agent by conversation ID
   */
  terminateAgentByConversation(conversationId: string): void {
    for (const [key, context] of this.activeContexts.entries()) {
      if (context.conversationId === conversationId) {
        this.activeContexts.delete(key);
        break;
      }
    }
  }

  /**
   * Lists all active agent contexts
   */
  getActiveAgents(): AgentExecutionContext[] {
    return Array.from(this.activeContexts.values());
  }

  /**
   * Validates if a context is valid for execution
   */
  private isValidContext(context: AgentExecutionContext): boolean {
    return !!(
      context &&
      context.agentName &&
      context.conversationId &&
      context.systemPrompt &&
      Array.isArray(context.availableTools) &&
      Array.isArray(context.delegationChain)
    );
  }

  /**
   * Applies system prompt and context isolation to input
   */
  private applySystemPrompt(context: AgentExecutionContext, input: string): string {
    const systemContext = [
      `System: ${context.systemPrompt}`,
      `Agent: ${context.agentName}`,
      `Conversation: ${context.conversationId}`,
    ];

    if (context.parentConversationId) {
      systemContext.push(`Parent Conversation: ${context.parentConversationId}`);
    }

    if (context.delegationChain.length > 0) {
      systemContext.push(`Delegation Chain: ${context.delegationChain.join(' -> ')}`);
    }

    systemContext.push(`Available Tools: ${context.availableTools.map(tool => tool.name || 'unknown').join(', ')}`);
    systemContext.push('---');
    systemContext.push(`User Input: ${input}`);

    return systemContext.join('\n');
  }

  /**
   * Updates the available tools for an agent context
   */
  async updateAgentTools(agentName: string): Promise<void> {
    const context = this.activeContexts.get(agentName);
    if (context) {
      context.availableTools = await this.toolFilter.getAvailableTools(agentName);
    }
  }

  /**
   * Gets delegation chain for an agent to detect circular delegation
   */
  getDelegationChain(agentName: string): string[] {
    const context = this.activeContexts.get(agentName);
    return context ? [...context.delegationChain, context.agentName] : [];
  }

  /**
   * Checks if delegation would create a circular reference
   */
  wouldCreateCircularDelegation(fromAgent: string, toAgent: string): boolean {
    // Find the context for the fromAgent (could be stored with different keys)
    let fromContext: AgentExecutionContext | undefined;
    
    // First try direct lookup
    fromContext = this.activeContexts.get(fromAgent);
    
    // If not found, search through all contexts
    if (!fromContext) {
      for (const context of this.activeContexts.values()) {
        if (context.agentName === fromAgent) {
          fromContext = context;
          break;
        }
      }
    }
    
    if (!fromContext) {
      return false;
    }

    const fullChain = [...fromContext.delegationChain, fromContext.agentName];
    return fullChain.includes(toAgent);
  }
}