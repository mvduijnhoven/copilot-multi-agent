/**
 * Delegation engine service for orchestrating work between agents
 */

import { 
  DelegationEngine, 
  DelegationRequest, 
  DelegationReport,
  AgentConfiguration,
  AgentExecutionContext,
  ExtensionConfiguration
} from '../models';
import { AgentEngine } from './agent-engine';
import { IConfigurationManager } from './configuration-manager';
import { 
  DelegationError, 
  ConfigurationError, 
  AgentExecutionError, 
  CircularDelegationError,
  MultiAgentError
} from '../models/errors';

/**
 * Concrete implementation of the DelegationEngine interface
 */
/**
 * Conversation management interface for tracking agent conversations
 */
interface ConversationManager {
  createConversation(agentName: string, parentConversationId?: string): string;
  getConversation(conversationId: string): ConversationContext | undefined;
  getChildConversations(parentConversationId: string): ConversationContext[];
  terminateConversation(conversationId: string): void;
  cleanupOrphanedConversations(): void;
  markConversationFailed(conversationId: string, error?: Error): void;
  markConversationCancelled(conversationId: string): void;
}

/**
 * Conversation context for tracking agent conversations
 */
interface ConversationContext {
  conversationId: string;
  agentName: string;
  parentConversationId?: string;
  childConversationIds: string[];
  createdAt: Date;
  lastActivity: Date;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  delegationChain: string[];
}

export class DefaultDelegationEngine implements DelegationEngine {
  private agentEngine: AgentEngine;
  private configurationManager: IConfigurationManager;
  private activeDelegations: Map<string, DelegationRequest> = new Map();
  private pendingReports: Map<string, DelegationReport> = new Map();
  private delegationPromises: Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }> = new Map();
  private conversations: Map<string, ConversationContext> = new Map();
  private conversationManager: ConversationManager;

  constructor(agentEngine: AgentEngine, configurationManager: IConfigurationManager) {
    this.agentEngine = agentEngine;
    this.configurationManager = configurationManager;
    this.conversationManager = new DefaultConversationManager(this.conversations);
  }

  /**
   * Delegates work from one agent to another
   */
  async delegateWork(
    fromAgent: string,
    toAgent: string,
    workDescription: string,
    reportExpectations: string
  ): Promise<string> {
    try {
      // Validate delegation is allowed
      if (!await this.isValidDelegation(fromAgent, toAgent)) {
        throw new DelegationError(
          `Delegation from "${fromAgent}" to "${toAgent}" is not allowed`,
          fromAgent,
          { fromAgent, toAgent, reason: 'delegation_not_allowed' }
        );
      }

      // Check for circular delegation
      if (this.wouldCreateCircularDelegation(fromAgent, toAgent)) {
        throw new CircularDelegationError(
          `Circular delegation detected: delegation from "${fromAgent}" to "${toAgent}" would create a loop`,
          fromAgent,
          { fromAgent, toAgent, delegationChain: this.getDelegationChain(fromAgent) }
        );
      }

      // Get agent configurations
      const fromAgentConfig = await this.getAgentConfiguration(fromAgent);
      const toAgentConfig = await this.getAgentConfiguration(toAgent);

      if (!fromAgentConfig) {
        throw new ConfigurationError(
          `Source agent "${fromAgent}" not found`,
          fromAgent
        );
      }

      if (!toAgentConfig) {
        throw new ConfigurationError(
          `Target agent "${toAgent}" not found`,
          fromAgent,
          { targetAgent: toAgent }
        );
      }

      // Get the parent context for delegation chain tracking
      const parentContext = this.agentEngine.getAgentContext(fromAgent);
      if (!parentContext) {
        throw new AgentExecutionError(
          `Parent agent context not found for "${fromAgent}"`,
          fromAgent
        );
      }

      // Create delegation request
      const delegationId = this.generateDelegationId(fromAgent, toAgent);
      const delegationRequest: DelegationRequest = {
        fromAgent,
        toAgent,
        workDescription,
        reportExpectations,
        timestamp: new Date()
      };

      // Store the delegation request
      this.activeDelegations.set(delegationId, delegationRequest);

      // Create a conversation for the delegation
      const childConversationId = this.conversationManager.createConversation(
        toAgent,
        parentContext.conversationId
      );

      // Get the complete extension configuration for delegation context
      const extensionConfig = await this.configurationManager.loadConfiguration();
      
      // Initialize the target agent as a child agent
      const childContext = await this.initializeChildAgent(
        toAgentConfig as AgentConfiguration,
        parentContext,
        extensionConfig
      );

      // Update the child context with the managed conversation ID
      childContext.conversationId = childConversationId;

      // Create a promise that will be resolved when the agent reports out
      const delegationPromise = new Promise<string>((resolve, reject) => {
        this.delegationPromises.set(childContext.conversationId, { resolve, reject });
        
        // Set a timeout to prevent hanging delegations
        setTimeout(() => {
          if (this.delegationPromises.has(childContext.conversationId)) {
            this.delegationPromises.delete(childContext.conversationId);
            this.activeDelegations.delete(delegationId);
            reject(new DelegationError(
              `Delegation to "${toAgent}" timed out`,
              fromAgent,
              { toAgent, timeout: true }
            ));
          }
        }, 300000); // 5 minute timeout
      });

      // Prepare the delegation input
      const delegationInput = this.prepareDelegationInput(workDescription, reportExpectations);

      // Execute the target agent with the delegation input
      // Note: This is a fire-and-forget operation, the result will come via reportOut
      this.agentEngine.executeAgent(childContext, delegationInput).catch(error => {
        // Mark conversation as failed
        this.conversationManager.markConversationFailed(childContext.conversationId, error);
        
        // If agent execution fails, reject the delegation promise
        const promise = this.delegationPromises.get(childContext.conversationId);
        if (promise) {
          this.delegationPromises.delete(childContext.conversationId);
          this.activeDelegations.delete(delegationId);
          promise.reject(new AgentExecutionError(
            `Agent execution failed for "${toAgent}": ${error.message}`,
            fromAgent,
            { toAgent, originalError: error }
          ));
        }
      });

      // Return the promise that will be resolved when reportOut is called
      return await delegationPromise;

    } catch (error) {
      if (error instanceof Error && 'type' in error) {
        throw error;
      }
      throw new DelegationError(
        `Delegation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fromAgent,
        { toAgent, originalError: error }
      );
    }
  }

  /**
   * Reports completion of delegated work
   */
  reportOut(agentName: string, report: string): void {
    try {
      // Find the agent's context to get the conversation ID
      const agentContext = this.agentEngine.getAgentContext(agentName);
      if (!agentContext) {
        // Try to find by searching all contexts
        const allContexts = this.agentEngine.getActiveAgents();
        const matchingContext = allContexts.find(ctx => ctx.agentName === agentName);
        if (matchingContext) {
          this.processReportOut(matchingContext, report);
          return;
        }
        
        throw new AgentExecutionError(
          `Agent context not found for "${agentName}"`,
          agentName
        );
      }

      this.processReportOut(agentContext, report);

    } catch (error) {
      console.error(`Error in reportOut for agent "${agentName}":`, error);
      // Try to find and reject any pending delegation promises for this agent
      const allContexts = this.agentEngine.getActiveAgents();
      const matchingContext = allContexts.find(ctx => ctx.agentName === agentName);
      if (matchingContext) {
        const promise = this.delegationPromises.get(matchingContext.conversationId);
        if (promise) {
          this.delegationPromises.delete(matchingContext.conversationId);
          promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  /**
   * Validates if delegation is allowed between two agents
   */
  async isValidDelegation(fromAgent: string, toAgent: string): Promise<boolean> {
    try {
      // Get the source agent configuration
      const fromAgentConfig = await this.getAgentConfiguration(fromAgent);
      if (!fromAgentConfig) {
        return false;
      }

      // Get the target agent configuration to ensure it exists
      const toAgentConfig = await this.getAgentConfiguration(toAgent);
      if (!toAgentConfig) {
        return false;
      }

      // Check delegation permissions
      const { delegationPermissions } = fromAgentConfig;
      
      switch (delegationPermissions.type) {
        case 'all':
          // Can delegate to any agent except itself
          return fromAgent !== toAgent;
          
        case 'none':
          // Cannot delegate to any agent
          return false;
          
        case 'specific':
          // Can only delegate to specific agents
          return delegationPermissions.agents.includes(toAgent) && fromAgent !== toAgent;
          
        default:
          return false;
      }
    } catch (error) {
      console.error(`Error validating delegation from "${fromAgent}" to "${toAgent}":`, error);
      return false;
    }
  }

  /**
   * Gets all active delegations
   */
  getActiveDelegations(): DelegationRequest[] {
    return Array.from(this.activeDelegations.values());
  }

  /**
   * Gets delegation request by ID
   */
  getDelegationRequest(delegationId: string): DelegationRequest | undefined {
    return this.activeDelegations.get(delegationId);
  }

  /**
   * Cancels an active delegation
   */
  cancelDelegation(delegationId: string): boolean {
    const delegation = this.activeDelegations.get(delegationId);
    if (!delegation) {
      return false;
    }

    // Find and terminate the target agent
    const allContexts = this.agentEngine.getActiveAgents();
    const targetContext = allContexts.find(ctx => 
      ctx.agentName === delegation.toAgent && 
      ctx.delegationChain.includes(delegation.fromAgent)
    );

    if (targetContext) {
      // Mark conversation as cancelled
      this.conversationManager.markConversationCancelled(targetContext.conversationId);

      // Reject the delegation promise
      const promise = this.delegationPromises.get(targetContext.conversationId);
      if (promise) {
        this.delegationPromises.delete(targetContext.conversationId);
        promise.reject(new DelegationError(
          `Delegation to "${delegation.toAgent}" was cancelled`,
          delegation.fromAgent,
          { cancelled: true }
        ));
      }

      // Terminate the agent and conversation tree
      this.terminateConversationTree(targetContext.conversationId);
      this.terminateAgentByConversation(targetContext.conversationId);
    }

    // Remove the delegation
    this.activeDelegations.delete(delegationId);
    return true;
  }

  /**
   * Cleans up completed or failed delegations
   */
  cleanup(): void {
    // Remove any orphaned delegation promises
    const activeConversationIds = new Set(
      this.agentEngine.getActiveAgents().map(ctx => ctx.conversationId)
    );

    for (const [conversationId, promise] of this.delegationPromises.entries()) {
      if (!activeConversationIds.has(conversationId)) {
        promise.reject(new DelegationError(
          'Delegation was cleaned up due to orphaned state',
          'unknown'
        ));
        this.delegationPromises.delete(conversationId);
      }
    }

    // Clean up old pending reports (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [key, report] of this.pendingReports.entries()) {
      if (report.timestamp < oneHourAgo) {
        this.pendingReports.delete(key);
      }
    }

    // Clean up orphaned conversations
    this.conversationManager.cleanupOrphanedConversations();
  }

  /**
   * Processes a report out from an agent
   */
  private processReportOut(agentContext: AgentExecutionContext, report: string): void {
    const delegationReport: DelegationReport = {
      agentName: agentContext.agentName,
      report,
      timestamp: new Date(),
      conversationId: agentContext.conversationId
    };

    // Update conversation activity
    this.updateConversationActivity(agentContext.conversationId);

    // Store the report
    this.pendingReports.set(agentContext.conversationId, delegationReport);

    // Find and resolve the delegation promise
    const promise = this.delegationPromises.get(agentContext.conversationId);
    if (promise) {
      this.delegationPromises.delete(agentContext.conversationId);
      promise.resolve(report);
    }

    // Clean up the delegation request
    const delegationId = this.findDelegationIdByAgent(agentContext.agentName, agentContext.delegationChain);
    if (delegationId) {
      this.activeDelegations.delete(delegationId);
    }

    // Mark conversation as completed and terminate the agent
    this.conversationManager.terminateConversation(agentContext.conversationId);
    this.terminateAgentByConversation(agentContext.conversationId);
  }

  /**
   * Generates a unique delegation ID
   */
  private generateDelegationId(fromAgent: string, toAgent: string): string {
    const timestamp = Date.now();
    return `${fromAgent}->${toAgent}-${timestamp}`;
  }

  /**
   * Prepares the input for a delegated agent
   */
  private prepareDelegationInput(workDescription: string, reportExpectations: string): string {
    return [
      'DELEGATION REQUEST:',
      '',
      'Work Description:',
      workDescription,
      '',
      'Report Expectations:',
      reportExpectations,
      '',
      'Please complete the requested work and use the "reportOut" tool to provide your findings.',
      'Your report should address the expectations outlined above.'
    ].join('\n');
  }

  /**
   * Finds delegation ID by agent name and delegation chain
   */
  private findDelegationIdByAgent(agentName: string, delegationChain: string[]): string | undefined {
    for (const [delegationId, delegation] of this.activeDelegations.entries()) {
      if (delegation.toAgent === agentName && delegationChain.includes(delegation.fromAgent)) {
        return delegationId;
      }
    }
    return undefined;
  }

  /**
   * Gets delegation statistics
   */
  getDelegationStats(): {
    active: number;
    completed: number;
    pending: number;
  } {
    return {
      active: this.activeDelegations.size,
      completed: this.pendingReports.size,
      pending: this.delegationPromises.size
    };
  }

  /**
   * Gets delegation history for an agent
   */
  async getDelegationHistory(agentName: string): Promise<{
    delegatedTo: DelegationRequest[];
    delegatedFrom: DelegationRequest[];
  }> {
    const allDelegations = Array.from(this.activeDelegations.values());
    
    return {
      delegatedTo: allDelegations.filter(d => d.fromAgent === agentName),
      delegatedFrom: allDelegations.filter(d => d.toAgent === agentName)
    };
  }

  /**
   * Helper method to get agent configuration
   */
  private async getAgentConfiguration(agentName: string): Promise<AgentConfiguration | null> {
    const config = await this.configurationManager.loadConfiguration();
    
    return config.agents.find(agent => agent.name === agentName) || null;
  }

  /**
   * Helper method to initialize child agent
   */
  private async initializeChildAgent(
    config: AgentConfiguration,
    parentContext: AgentExecutionContext,
    extensionConfig?: ExtensionConfiguration
  ): Promise<AgentExecutionContext> {
    // Use the agent engine's method if it exists, otherwise implement basic logic
    if ('initializeChildAgent' in this.agentEngine) {
      return (this.agentEngine as any).initializeChildAgent(config, parentContext, extensionConfig);
    }
    
    // Fallback implementation
    const childContext = await this.agentEngine.initializeAgent(config, extensionConfig);
    childContext.parentConversationId = parentContext.conversationId;
    childContext.delegationChain = [...parentContext.delegationChain, parentContext.agentName];
    
    return childContext;
  }

  /**
   * Helper method to terminate agent by conversation ID
   */
  private terminateAgentByConversation(conversationId: string): void {
    // Use the agent engine's method if it exists, otherwise implement basic logic
    if ('terminateAgentByConversation' in this.agentEngine) {
      (this.agentEngine as any).terminateAgentByConversation(conversationId);
      return;
    }
    
    // Fallback implementation - find agent by conversation ID and terminate
    const allAgents = this.agentEngine.getActiveAgents();
    const agent = allAgents.find(a => a.conversationId === conversationId);
    if (agent) {
      this.agentEngine.terminateAgent(agent.agentName);
    }
  }

  /**
   * Helper method to get delegation chain
   */
  private getDelegationChain(agentName: string): string[] {
    // Use the agent engine's method if it exists, otherwise implement basic logic
    if ('getDelegationChain' in this.agentEngine) {
      return (this.agentEngine as any).getDelegationChain(agentName);
    }
    
    // Fallback implementation
    const context = this.agentEngine.getAgentContext(agentName);
    return context ? [...context.delegationChain, context.agentName] : [];
  }

  /**
   * Helper method to check if delegation would create circular reference
   */
  private wouldCreateCircularDelegation(fromAgent: string, toAgent: string): boolean {
    // Use the agent engine's method if it exists, otherwise implement basic logic
    if ('wouldCreateCircularDelegation' in this.agentEngine) {
      return (this.agentEngine as any).wouldCreateCircularDelegation(fromAgent, toAgent);
    }
    
    // Fallback implementation
    const delegationChain = this.getDelegationChain(fromAgent);
    return delegationChain.includes(toAgent);
  }

  /**
   * Gets conversation context by ID
   */
  getConversationContext(conversationId: string): ConversationContext | undefined {
    return this.conversationManager.getConversation(conversationId);
  }

  /**
   * Gets all child conversations for a parent conversation
   */
  getChildConversations(parentConversationId: string): ConversationContext[] {
    return this.conversationManager.getChildConversations(parentConversationId);
  }

  /**
   * Gets all active conversations
   */
  getActiveConversations(): ConversationContext[] {
    return Array.from(this.conversations.values()).filter(c => c.status === 'active');
  }

  /**
   * Terminates a conversation and all its children
   */
  terminateConversationTree(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return;
    }

    // Recursively terminate child conversations
    conversation.childConversationIds.forEach(childId => {
      this.terminateConversationTree(childId);
    });

    // Terminate the conversation
    this.conversationManager.terminateConversation(conversationId);
  }

  /**
   * Updates conversation activity timestamp
   */
  updateConversationActivity(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.lastActivity = new Date();
    }
  }

  /**
   * Gets conversation statistics
   */
  getConversationStats(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const conversations = Array.from(this.conversations.values());
    return {
      total: conversations.length,
      active: conversations.filter(c => c.status === 'active').length,
      completed: conversations.filter(c => c.status === 'completed').length,
      failed: conversations.filter(c => c.status === 'failed').length,
      cancelled: conversations.filter(c => c.status === 'cancelled').length
    };
  }
}

/**
 * Default implementation of conversation manager
 */
class DefaultConversationManager implements ConversationManager {
  private conversations: Map<string, ConversationContext>;

  constructor(conversations: Map<string, ConversationContext>) {
    this.conversations = conversations;
  }

  /**
   * Creates a new conversation
   */
  createConversation(agentName: string, parentConversationId?: string): string {
    const conversationId = this.generateConversationId(agentName);
    const now = new Date();
    
    // Get delegation chain from parent if exists
    let delegationChain: string[] = [];
    if (parentConversationId) {
      const parentConversation = this.conversations.get(parentConversationId);
      if (parentConversation) {
        delegationChain = [...parentConversation.delegationChain, parentConversation.agentName];
        // Add this conversation as a child to the parent
        parentConversation.childConversationIds.push(conversationId);
      }
    }

    const conversation: ConversationContext = {
      conversationId,
      agentName,
      parentConversationId,
      childConversationIds: [],
      createdAt: now,
      lastActivity: now,
      status: 'active',
      delegationChain
    };

    this.conversations.set(conversationId, conversation);
    return conversationId;
  }

  /**
   * Gets a conversation by ID
   */
  getConversation(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Gets all child conversations for a parent
   */
  getChildConversations(parentConversationId: string): ConversationContext[] {
    return Array.from(this.conversations.values())
      .filter(c => c.parentConversationId === parentConversationId);
  }

  /**
   * Terminates a conversation
   */
  terminateConversation(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.status = 'completed';
      conversation.lastActivity = new Date();
      
      // Remove from parent's child list if it has a parent
      if (conversation.parentConversationId) {
        const parent = this.conversations.get(conversation.parentConversationId);
        if (parent) {
          const index = parent.childConversationIds.indexOf(conversationId);
          if (index > -1) {
            parent.childConversationIds.splice(index, 1);
          }
        }
      }
    }
  }

  /**
   * Cleans up orphaned conversations (conversations without active agents)
   */
  cleanupOrphanedConversations(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Find conversations that are old and inactive
    const conversationsToCleanup: string[] = [];
    
    for (const [conversationId, conversation] of this.conversations.entries()) {
      // Clean up conversations that are:
      // 1. Older than 1 hour and not active
      // 2. Have no parent and no children (orphaned)
      // 3. Are marked as failed or cancelled
      if (
        (conversation.lastActivity < oneHourAgo && conversation.status !== 'active') ||
        (!conversation.parentConversationId && conversation.childConversationIds.length === 0 && conversation.status !== 'active') ||
        (conversation.status === 'failed' || conversation.status === 'cancelled')
      ) {
        conversationsToCleanup.push(conversationId);
      }
    }

    // Remove orphaned conversations
    conversationsToCleanup.forEach(conversationId => {
      this.conversations.delete(conversationId);
    });
  }

  /**
   * Generates a unique conversation ID
   */
  private generateConversationId(agentName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${agentName}-${timestamp}-${random}`;
  }

  /**
   * Marks a conversation as failed
   */
  markConversationFailed(conversationId: string, error?: Error): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.status = 'failed';
      conversation.lastActivity = new Date();
    }
  }

  /**
   * Marks a conversation as cancelled
   */
  markConversationCancelled(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.status = 'cancelled';
      conversation.lastActivity = new Date();
    }
  }
}