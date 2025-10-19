/**
 * Agent engine service for managing agent execution contexts and lifecycle
 */

import { 
  AgentConfiguration, 
  AgentExecutionContext, 
  AgentExecutionError, 
  ExtensionConfiguration,
  AgentLoopResult,
  ToolInvocation,
  ConversationManager,
  AgentLoopStateManager,
  ToolInvocationTracker
} from '../models';
import { ToolFilter } from './tool-filter';
import { ISystemPromptBuilder } from '../models/system-prompt-builder';
import { v4 as uuidv4 } from 'uuid';

export interface AgentEngine {
  /**
   * Initializes an agent with its configuration
   * @param config The agent configuration
   * @param extensionConfig The complete extension configuration for delegation context
   * @param model The language model to use for agent execution
   * @returns The agent execution context
   */
  initializeAgent(
    config: AgentConfiguration, 
    extensionConfig?: ExtensionConfiguration,
    model?: any
  ): Promise<AgentExecutionContext>;
  
  /**
   * Executes an agent with the given context and input
   * @param context The agent execution context
   * @param input The input message or request
   * @returns Promise resolving to the agent's response
   */
  executeAgent(context: AgentExecutionContext, input: string): Promise<string>;

  /**
   * Executes an agentic loop for entry agents
   * @param context The agent execution context
   * @param initialMessage The initial user message
   * @param tools Available tools for the agent
   * @param token Cancellation token
   * @returns Promise resolving to the loop result
   */
  executeAgenticLoop(
    context: AgentExecutionContext,
    initialMessage: string,
    tools: any[],
    token?: any
  ): Promise<AgentLoopResult>;

  /**
   * Handles delegated requests with agentic loops
   * @param context The agent execution context
   * @param delegatedWork The work description from delegation
   * @param tools Available tools for the agent
   * @param token Cancellation token
   * @returns Promise resolving to the report content
   */
  handleDelegatedRequest(
    context: AgentExecutionContext,
    delegatedWork: string,
    tools: any[],
    token?: any
  ): Promise<string>;
  
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
  private systemPromptBuilder: ISystemPromptBuilder;

  constructor(toolFilter: ToolFilter, systemPromptBuilder: ISystemPromptBuilder) {
    this.toolFilter = toolFilter;
    this.systemPromptBuilder = systemPromptBuilder;
  }

  /**
   * Initializes an agent with its configuration
   */
  async initializeAgent(
    config: AgentConfiguration, 
    extensionConfig?: ExtensionConfiguration,
    model?: any
  ): Promise<AgentExecutionContext> {
    try {
      // Validate configuration
      if (!config) {
        throw new AgentExecutionError('Agent configuration is required', 'unknown');
      }
      
      if (!config.name) {
        throw new AgentExecutionError('Agent name is required', 'unknown');
      }
      
      // Generate unique conversation ID
      const conversationId = uuidv4();
      
      // Get available tools for this agent
      const availableTools = await this.toolFilter.getAvailableTools(config.name);
      
      // Build extended system prompt with delegation information if extension config is provided
      let systemPrompt = config.systemPrompt;
      let availableDelegationTargets: any[] = [];
      
      if (extensionConfig) {
        systemPrompt = this.systemPromptBuilder.buildSystemPrompt(
          config.systemPrompt,
          config.name,
          extensionConfig
        );
        
        availableDelegationTargets = this.systemPromptBuilder.getDelegationTargets(
          config.name,
          extensionConfig
        );
      }
      
      // Create execution context
      const context: AgentExecutionContext = {
        agentName: config.name,
        conversationId,
        systemPrompt,
        availableTools,
        delegationChain: [],
        availableDelegationTargets,
        // Agentic loop properties
        model,
        conversation: [],
        isAgenticLoop: false,
        toolInvocations: [],
        loopState: AgentLoopStateManager.createInitialState()
      };

      // Store the context
      this.activeContexts.set(config.name, context);

      return context;
    } catch (error) {
      const agentName = config?.name || 'unknown';
      throw new AgentExecutionError(
        `Failed to initialize agent "${agentName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        agentName,
        { originalError: error }
      );
    }
  }

  /**
   * Creates a child agent context for delegation
   */
  async initializeChildAgent(
    config: AgentConfiguration, 
    parentContext: AgentExecutionContext,
    extensionConfig?: ExtensionConfiguration
  ): Promise<AgentExecutionContext> {
    try {
      // Generate unique conversation ID for child
      const conversationId = uuidv4();
      
      // Get available tools for this agent
      const availableTools = await this.toolFilter.getAvailableTools(config.name);
      
      // Build extended system prompt with delegation information if extension config is provided
      let systemPrompt = config.systemPrompt;
      let availableDelegationTargets: any[] = [];
      
      if (extensionConfig) {
        systemPrompt = this.systemPromptBuilder.buildSystemPrompt(
          config.systemPrompt,
          config.name,
          extensionConfig
        );
        
        availableDelegationTargets = this.systemPromptBuilder.getDelegationTargets(
          config.name,
          extensionConfig
        );
      }
      
      // Create child execution context with delegation chain
      const context: AgentExecutionContext = {
        agentName: config.name,
        conversationId,
        parentConversationId: parentContext.conversationId,
        systemPrompt,
        availableTools,
        delegationChain: [...parentContext.delegationChain, parentContext.agentName],
        availableDelegationTargets,
        // Agentic loop properties
        model: parentContext.model,
        conversation: [],
        isAgenticLoop: false,
        toolInvocations: [],
        loopState: AgentLoopStateManager.createInitialState()
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
   * Executes an agentic loop for entry agents
   */
  async executeAgenticLoop(
    context: AgentExecutionContext,
    initialMessage: string,
    tools: any[],
    token?: any
  ): Promise<AgentLoopResult> {
    try {
      // Validate context and model
      if (!this.isValidContext(context)) {
        throw new AgentExecutionError(
          'Invalid agent execution context for agentic loop',
          context.agentName,
          { context }
        );
      }

      if (!context.model) {
        throw new AgentExecutionError(
          'Language model is required for agentic loop execution',
          context.agentName,
          { context }
        );
      }

      // Initialize conversation with system prompt and user message
      context.conversation = ConversationManager.initializeConversation(
        context.systemPrompt,
        initialMessage
      );
      context.isAgenticLoop = true;
      
      // Reset loop state
      context.loopState = AgentLoopStateManager.createInitialState();
      ToolInvocationTracker.clearInvocations(context);

      let finalResponse = '';
      
      // Start the agentic loop
      context.loopState.isActive = true;
      
      // Execute agentic loop
      while (AgentLoopStateManager.shouldContinueLoop(context.loopState)) {
        // Check for cancellation
        if (token?.isCancellationRequested) {
          AgentLoopStateManager.completeLoop(context.loopState);
          break;
        }

        AgentLoopStateManager.startIteration(context.loopState);

        try {
          // Send conversation to model (placeholder implementation)
          const response = await this.sendToModel(context, tools, token);
          finalResponse = response.text;
          
          // Add assistant response to conversation
          ConversationManager.addMessage(context.conversation, 'assistant', response.text);

          // Process tool calls if any
          if (response.toolCalls && response.toolCalls.length > 0) {
            for (const toolCall of response.toolCalls) {
              const startTime = Date.now();
              
              try {
                // Execute tool (placeholder implementation)
                const toolResult = await this.executeTool(toolCall, tools, context);
                const executionTime = Date.now() - startTime;
                
                // Record tool invocation
                const invocation = ToolInvocationTracker.createInvocation(
                  toolCall.name,
                  toolCall.parameters,
                  toolResult,
                  executionTime
                );
                ToolInvocationTracker.addInvocation(context, invocation);
                
                // Add tool result to conversation
                ConversationManager.addToolResult(context.conversation, toolCall.name, toolResult);
                
              } catch (toolError) {
                // Handle tool execution error
                const errorMessage = `Tool ${toolCall.name} failed: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`;
                ConversationManager.addMessage(context.conversation, 'user', errorMessage);
                
                console.error(`Tool execution error in agentic loop:`, toolError);
              }
            }
          } else {
            // No tool calls, end the loop
            context.loopState.hasToolInvocations = false;
            AgentLoopStateManager.completeLoop(context.loopState);
          }

        } catch (modelError) {
          console.error(`Model execution error in agentic loop:`, modelError);
          AgentLoopStateManager.completeLoop(context.loopState);
          throw new AgentExecutionError(
            `Model execution failed in agentic loop: ${modelError instanceof Error ? modelError.message : 'Unknown error'}`,
            context.agentName,
            { originalError: modelError, iteration: context.loopState.iterationCount }
          );
        }

        // Check for max iterations
        if (AgentLoopStateManager.hasReachedMaxIterations(context.loopState)) {
          console.warn(`Agent ${context.agentName} reached maximum iterations (${context.loopState.maxIterations})`);
          AgentLoopStateManager.completeLoop(context.loopState);
        }
      }

      return {
        finalResponse,
        toolInvocations: [...context.toolInvocations],
        conversationHistory: [...context.conversation],
        completed: !context.loopState.isActive,
        iterationCount: context.loopState.iterationCount
      };

    } catch (error) {
      throw new AgentExecutionError(
        `Failed to execute agentic loop for agent "${context.agentName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        context.agentName,
        { 
          originalError: error,
          context,
          iteration: context.loopState?.iterationCount || 0
        }
      );
    }
  }

  /**
   * Handles delegated requests with agentic loops
   */
  async handleDelegatedRequest(
    context: AgentExecutionContext,
    delegatedWork: string,
    tools: any[],
    token?: any
  ): Promise<string> {
    try {
      // Validate context and model
      if (!this.isValidContext(context)) {
        throw new AgentExecutionError(
          'Invalid agent execution context for delegated request',
          context.agentName,
          { context }
        );
      }

      if (!context.model) {
        throw new AgentExecutionError(
          'Language model is required for delegated request execution',
          context.agentName,
          { context }
        );
      }

      // Initialize conversation with system prompt and delegated work
      context.conversation = ConversationManager.initializeConversation(
        context.systemPrompt,
        delegatedWork
      );
      context.isAgenticLoop = true;
      
      // Reset loop state
      context.loopState = AgentLoopStateManager.createInitialState();
      ToolInvocationTracker.clearInvocations(context);

      let reportContent = '';
      
      // Start the agentic loop
      context.loopState.isActive = true;
      
      // Execute agentic loop until reportOut is called
      while (AgentLoopStateManager.shouldContinueLoop(context.loopState) && !context.loopState.reportOutCalled) {
        // Check for cancellation
        if (token?.isCancellationRequested) {
          AgentLoopStateManager.completeLoop(context.loopState);
          break;
        }

        AgentLoopStateManager.startIteration(context.loopState);

        try {
          // Send conversation to model (placeholder implementation)
          const response = await this.sendToModel(context, tools, token);
          
          // Add assistant response to conversation
          ConversationManager.addMessage(context.conversation, 'assistant', response.text);

          // Process tool calls if any
          if (response.toolCalls && response.toolCalls.length > 0) {
            for (const toolCall of response.toolCalls) {
              const startTime = Date.now();
              
              try {
                // Special handling for reportOut tool
                if (toolCall.name === 'reportOut') {
                  reportContent = toolCall.parameters?.report || response.text;
                  const invocation = ToolInvocationTracker.createInvocation(
                    toolCall.name,
                    toolCall.parameters,
                    reportContent,
                    Date.now() - startTime
                  );
                  ToolInvocationTracker.addInvocation(context, invocation);
                  AgentLoopStateManager.completeLoop(context.loopState, reportContent);
                  break; // Exit tool processing loop
                } else {
                  // Execute other tools normally
                  const toolResult = await this.executeTool(toolCall, tools, context);
                  const executionTime = Date.now() - startTime;
                  
                  // Record tool invocation
                  const invocation = ToolInvocationTracker.createInvocation(
                    toolCall.name,
                    toolCall.parameters,
                    toolResult,
                    executionTime
                  );
                  ToolInvocationTracker.addInvocation(context, invocation);
                  
                  // Add tool result to conversation
                  ConversationManager.addToolResult(context.conversation, toolCall.name, toolResult);
                }
                
              } catch (toolError) {
                // Handle tool execution error
                const errorMessage = `Tool ${toolCall.name} failed: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`;
                ConversationManager.addMessage(context.conversation, 'user', errorMessage);
                
                console.error(`Tool execution error in delegated request:`, toolError);
              }
            }
          } else {
            // No tools called, prompt agent to complete task
            ConversationManager.addMessage(
              context.conversation, 
              'user', 
              'Please complete your task and call reportOut with your findings.'
            );
          }

        } catch (modelError) {
          console.error(`Model execution error in delegated request:`, modelError);
          AgentLoopStateManager.completeLoop(context.loopState);
          throw new AgentExecutionError(
            `Model execution failed in delegated request: ${modelError instanceof Error ? modelError.message : 'Unknown error'}`,
            context.agentName,
            { originalError: modelError, iteration: context.loopState.iterationCount }
          );
        }

        // Check for max iterations
        if (AgentLoopStateManager.hasReachedMaxIterations(context.loopState)) {
          console.warn(`Delegated agent ${context.agentName} reached maximum iterations without calling reportOut`);
          // Provide fallback report
          reportContent = `Task completed after ${context.loopState.iterationCount} iterations. Agent did not explicitly call reportOut.`;
          AgentLoopStateManager.completeLoop(context.loopState, reportContent);
        }
      }

      // Handle case where agent didn't call reportOut
      if (!context.loopState.reportOutCalled && !reportContent) {
        const lastMessage = ConversationManager.getLastMessage(context.conversation);
        reportContent = lastMessage?.content || 'Task completed but no explicit report provided.';
      }

      return reportContent;

    } catch (error) {
      throw new AgentExecutionError(
        `Failed to handle delegated request for agent "${context.agentName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        context.agentName,
        { 
          originalError: error,
          context,
          iteration: context.loopState?.iterationCount || 0
        }
      );
    }
  }

  /**
   * Sends conversation to language model (placeholder implementation)
   */
  private async sendToModel(context: AgentExecutionContext, tools: any[], token?: any): Promise<{ text: string; toolCalls?: any[] }> {
    // This is a placeholder implementation
    // In the actual implementation, this would use vscode.LanguageModelChat
    
    if (!context.model) {
      throw new Error('Language model not available');
    }

    try {
      // Check if model has a sendRequest method (for mock models)
      if (context.model && typeof context.model.sendRequest === 'function') {
        return await context.model.sendRequest(context.conversation, { tools }, token);
      }
      
      // Fallback: simulate model response for testing
      // In real implementation: const response = await context.model.sendRequest(context.conversation, { tools }, token);
      
      const lastMessage = ConversationManager.getLastMessage(context.conversation);
      const userContent = lastMessage?.content || '';
      
      // Simulate different responses based on content
      if (userContent.includes('delegate') && tools.some(t => t.name === 'delegateWork')) {
        return {
          text: 'I need to delegate this task to a specialized agent.',
          toolCalls: [{
            name: 'delegateWork',
            parameters: {
              agentName: 'specialist',
              workDescription: 'Handle the specialized task',
              reportExpectations: 'Provide detailed results'
            }
          }]
        };
      } else if (context.isAgenticLoop && context.delegationChain.length > 0) {
        // Delegated agent should call reportOut
        return {
          text: 'Task completed successfully.',
          toolCalls: [{
            name: 'reportOut',
            parameters: {
              report: 'Task has been completed as requested.'
            }
          }]
        };
      } else {
        // Regular response without tools
        return {
          text: `Agent ${context.agentName} processed the request: ${userContent}`,
          toolCalls: []
        };
      }
      
    } catch (error) {
      throw new Error(`Model execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Executes a tool call (placeholder implementation)
   */
  private async executeTool(toolCall: any, tools: any[], context: AgentExecutionContext): Promise<any> {
    // This is a placeholder implementation
    // In the actual implementation, this would execute the actual tool
    
    const tool = tools.find(t => t.name === toolCall.name);
    if (!tool) {
      throw new Error(`Tool ${toolCall.name} not found`);
    }

    try {
      // Placeholder: simulate tool execution
      // In real implementation: const result = await tool.invoke({ parameters: toolCall.parameters }, token);
      
      if (toolCall.name === 'reportOut') {
        return `Report submitted: ${toolCall.parameters?.report || 'No report content'}`;
      } else if (toolCall.name === 'delegateWork') {
        return `Work delegated to ${toolCall.parameters?.agentName || 'unknown agent'}`;
      } else {
        return `Tool ${toolCall.name} executed with parameters: ${JSON.stringify(toolCall.parameters)}`;
      }
      
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      Array.isArray(context.delegationChain) &&
      Array.isArray(context.conversation) &&
      Array.isArray(context.toolInvocations) &&
      context.loopState &&
      typeof context.isAgenticLoop === 'boolean'
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
    // First try to find by exact agent name
    let context = this.activeContexts.get(agentName);
    
    // If not found, look for child agents with this name
    if (!context) {
      for (const [key, ctx] of this.activeContexts.entries()) {
        if (ctx.agentName === agentName) {
          context = ctx;
          break;
        }
      }
    }
    
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