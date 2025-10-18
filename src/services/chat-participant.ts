/**
 * Multi-agent chat participant implementation for VS Code Chat API integration
 */

import * as vscode from 'vscode';
import { ConfigurationManager } from './configuration-manager';
import { DefaultAgentEngine } from './agent-engine';
import { ToolFilter } from './tool-filter';
import { DefaultDelegationEngine } from './delegation-engine';
import { EntryAgentManager } from './entry-agent-manager';
import {
  CHAT_PARTICIPANT_ID,
  CHAT_PARTICIPANT_NAME,
  DEFAULT_EXTENSION_CONFIG
} from '../constants';
import {
  AgentExecutionError,
  MultiAgentError,
  MultiAgentErrorType,
  ConfigurationError,
  DelegationError
} from '../models/errors';
import { AgentExecutionContext, AgentConfiguration } from '../models/agent-configuration';

export interface IMultiAgentChatParticipant {
  /**
   * The unique identifier for this chat participant
   */
  readonly id: string;

  /**
   * Optional icon path for the chat participant
   */
  readonly iconPath?: vscode.Uri;

  /**
   * Handles incoming chat requests
   * @param request The chat request
   * @param context The chat context
   * @param stream The response stream
   * @param token Cancellation token
   * @returns Promise resolving to chat result
   */
  handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult>;

  /**
   * Registers the chat participant with VS Code
   */
  register(): void;

  /**
   * Disposes of the chat participant
   */
  dispose(): void;
}

/**
 * Multi-agent chat participant implementation
 */
export class MultiAgentChatParticipant implements IMultiAgentChatParticipant {
  public readonly id: string = CHAT_PARTICIPANT_ID;
  public readonly iconPath?: vscode.Uri;

  private chatParticipant?: vscode.ChatParticipant;
  private configurationManager: ConfigurationManager;
  private agentEngine: DefaultAgentEngine;
  private toolFilter: ToolFilter;
  private delegationEngine: DefaultDelegationEngine;
  private entryAgentManager: EntryAgentManager;
  private disposables: vscode.Disposable[] = [];

  constructor(
    configurationManager: ConfigurationManager,
    agentEngine: DefaultAgentEngine,
    toolFilter: ToolFilter,
    delegationEngine: DefaultDelegationEngine,
    iconPath?: vscode.Uri
  ) {
    this.configurationManager = configurationManager;
    this.agentEngine = agentEngine;
    this.toolFilter = toolFilter;
    this.delegationEngine = delegationEngine;
    this.entryAgentManager = new EntryAgentManager();
    this.iconPath = iconPath;
  }

  /**
   * Registers the chat participant with VS Code
   */
  register(): void {
    try {
      // Create the chat participant
      this.chatParticipant = vscode.chat.createChatParticipant(
        this.id,
        this.handleRequest.bind(this)
      );

      // Set participant properties (these may not be available in all VS Code versions)
      try {
        (this.chatParticipant as any).name = CHAT_PARTICIPANT_NAME;
        (this.chatParticipant as any).description = 'Multi-agent coordinator for specialized AI assistance';
        (this.chatParticipant as any).isSticky = true;
      } catch (error) {
        console.log('Some chat participant properties not available in this VS Code version:', error);
      }

      if (this.iconPath) {
        this.chatParticipant.iconPath = this.iconPath;
      }

      // Add to disposables for cleanup
      this.disposables.push(this.chatParticipant);

      console.log(`Multi-agent chat participant registered with ID: ${this.id}`);
    } catch (error) {
      console.error('Failed to register chat participant:', error);
      throw new ConfigurationError(
        `Failed to register chat participant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Handles incoming chat requests and routes them to the coordinator agent
   */
  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    // Log request for debugging
    this.logRequest(request, context);

    try {
      // Validate request
      const validation = this.validateRequest(request);
      if (!validation.isValid) {
        await this.streamErrorResponse(stream, new Error(validation.error || 'Invalid request'));
        return { metadata: { command: request.command || '', requestId: (request as any).requestId || 'unknown' } };
      }

      // Check for cancellation
      if (token.isCancellationRequested) {
        stream.markdown('⏹️ Request was cancelled.');
        return { metadata: { command: request.command || '', requestId: (request as any).requestId || 'unknown' } };
      }

      // Load current configuration with error handling
      let config;
      try {
        config = await this.configurationManager.loadConfiguration();
      } catch (configError) {
        await this.handleConfigurationError(stream, configError, request);
        return { metadata: { command: request.command || '', requestId: (request as any).requestId || 'unknown' } };
      }

      // Resolve entry agent using EntryAgentManager with fallback logic
      const entryAgentResolution = await this.entryAgentManager.resolveEntryAgent(config);

      // Handle entry agent resolution errors and warnings
      if (!entryAgentResolution.isValid || !entryAgentResolution.agent) {
        await this.handleEntryAgentResolutionError(stream, entryAgentResolution, request);
        return { metadata: { command: request.command || '', requestId: (request as any).requestId || 'unknown' } };
      }

      // Show warnings if fallback was used
      if (entryAgentResolution.usedFallback && entryAgentResolution.warnings.length > 0) {
        stream.markdown('⚠️ **Entry Agent Notice**: ' + entryAgentResolution.warnings.join(', ') + '\n\n');
      }

      // Initialize entry agent with error handling
      let entryAgentContext;
      try {
        entryAgentContext = await this.initializeEntryAgent(entryAgentResolution.agent);
      } catch (initError) {
        await this.handleAgentExecutionError(stream, initError, request);
        return { metadata: { command: request.command || '', requestId: (request as any).requestId || 'unknown' } };
      }

      // Process the request through the entry agent with comprehensive error handling
      try {
        await this.processEntryAgentRequest(
          entryAgentContext,
          entryAgentResolution.agent,
          request,
          context,
          stream,
          token
        );
      } catch (processError) {
        if (processError instanceof vscode.CancellationError) {
          stream.markdown('⏹️ Request processing was cancelled.');
        } else if (processError && typeof processError === 'object' && 'type' in processError) {
          const multiAgentError = processError as MultiAgentError;
          switch (multiAgentError.type) {
            case MultiAgentErrorType.CONFIGURATION_ERROR:
              await this.handleConfigurationError(stream, multiAgentError, request);
              break;
            case MultiAgentErrorType.AGENT_EXECUTION_ERROR:
            case MultiAgentErrorType.DELEGATION_ERROR:
              await this.handleAgentExecutionError(stream, multiAgentError, request);
              break;
            default:
              await this.streamErrorResponse(stream, multiAgentError);
          }
        } else {
          await this.handleAgentExecutionError(stream, processError, request);
        }
      }

      return {
        metadata: {
          command: request.command || '',
          requestId: (request as any).requestId || 'unknown',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Unexpected error handling chat request:', error);

      // Final fallback error handling
      try {
        await this.streamErrorResponse(stream, error);
      } catch (streamError) {
        console.error('Failed to stream error response:', streamError);
        // Last resort: try to stream a basic message
        try {
          stream.markdown('❌ An unexpected error occurred. Please try again.');
        } catch (finalError) {
          console.error('Complete failure to communicate error to user:', finalError);
        }
      }

      return {
        metadata: {
          command: request.command || '',
          requestId: (request as any).requestId || 'unknown',
          error: true
        }
      };
    }
  }

  /**
   * Initializes the entry agent with current configuration
   */
  private async initializeEntryAgent(entryAgentConfig: AgentConfiguration): Promise<AgentExecutionContext> {
    try {
      // Ensure we have a valid entry agent configuration
      const config = entryAgentConfig;

      // Load the complete extension configuration for delegation context
      const extensionConfig = await this.configurationManager.loadConfiguration();

      // Initialize the coordinator agent with extended system prompt
      const context = await this.agentEngine.initializeAgent(config, extensionConfig);

      return context;
    } catch (error) {
      throw new AgentExecutionError(
        `Failed to initialize coordinator agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'coordinator',
        { originalError: error }
      );
    }
  }

  /**
   * Processes a request through the entry agent
   */
  private async processEntryAgentRequest(
    entryAgentContext: AgentExecutionContext,
    entryAgentConfig: AgentConfiguration,
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Extract the user's message
      const userMessage = request.prompt || '';

      // Check for cancellation before processing
      if (token.isCancellationRequested) {
        return;
      }

      // Stream initial response with entry agent name
      stream.markdown(`🤖 **${entryAgentConfig.name}** (Entry Agent) is processing your request...\n\n`);

      // Apply tool filtering for entry agent
      const filteredTools = await this.toolFilter.getAvailableTools(entryAgentConfig.name);
      entryAgentContext.availableTools = filteredTools;

      // Provision delegation tools if delegation is allowed
      const delegationTools = await this.provisionDelegationTools(entryAgentConfig, entryAgentContext);

      // Stream information about available capabilities
      await this.streamEntryAgentCapabilities(stream, entryAgentContext, entryAgentConfig, delegationTools);

      // Check for cancellation before executing
      if (token.isCancellationRequested) {
        return;
      }

      // Execute the entry agent with enhanced context and streaming
      const enhancedContext = await this.enhanceEntryAgentContext(entryAgentContext, request, context);

      // Create response promise for streaming
      const responsePromise = this.executeEntryAgentWithTools(enhancedContext, entryAgentConfig, userMessage, delegationTools, token);

      // Stream response with progress updates
      stream.markdown('**Response:**\n\n');
      await this.streamResponseWithProgress(stream, responsePromise, token);

      // Add context information
      stream.markdown('\n\n---\n');
      stream.markdown(`*Agent: ${entryAgentContext.agentName}*\n`);
      stream.markdown(`*Description: ${entryAgentConfig.description}*\n`);
      stream.markdown(`*Use For: ${entryAgentConfig.useFor}*\n`);
      stream.markdown(`*Tools Available: ${entryAgentContext.availableTools.length}*\n`);

      if (delegationTools.length > 0) {
        stream.markdown(`*Delegation Enabled: ${delegationTools.map(t => (t as any).name || 'unknown').join(', ')}*\n`);
      }

      // Show available agents for delegation if delegation is enabled
      if (entryAgentConfig.delegationPermissions.type !== 'none') {
        const availableAgents = await this.getAvailableAgentsForDelegation(entryAgentConfig);
        if (availableAgents.length > 0) {
          stream.markdown(`*Available Agents: ${availableAgents.join(', ')}*\n`);
        }
      }

    } catch (error) {
      throw new AgentExecutionError(
        `Failed to process entry agent request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entryAgentConfig.name,
        { originalError: error, request: request.prompt }
      );
    }
  }

  /**
   * Provisions delegation tools for the entry agent based on permissions
   */
  private async provisionDelegationTools(
    entryAgentConfig: AgentConfiguration,
    entryAgentContext: AgentExecutionContext
  ): Promise<vscode.LanguageModelTool<any>[]> {
    const delegationTools: vscode.LanguageModelTool<any>[] = [];

    // Check if delegation is allowed
    if (entryAgentConfig.delegationPermissions.type === 'none') {
      return delegationTools;
    }

    try {
      // Load current configuration for tool creation
      const extensionConfig = await this.configurationManager.loadConfiguration();

      // Check if entry agent has access to delegation tools
      const hasDelegate = await this.toolFilter.hasToolAccess(entryAgentConfig.name, 'delegateWork');
      const hasReport = await this.toolFilter.hasToolAccess(entryAgentConfig.name, 'reportOut');

      if (hasDelegate) {
        // Import and create delegateWork tool instance
        const { DelegateWorkTool } = await import('../tools/delegate-work-tool.js');
        const { SystemPromptBuilder } = await import('./system-prompt-builder.js');
        
        const systemPromptBuilder = new SystemPromptBuilder();
        const delegateWorkTool = new DelegateWorkTool(
          this.delegationEngine,
          entryAgentConfig.name,
          systemPromptBuilder,
          extensionConfig
        );
        
        delegationTools.push(delegateWorkTool);
      }

      if (hasReport) {
        // Import and create reportOut tool instance
        const { ReportOutTool } = await import('../tools/report-out-tool.js');
        
        const reportOutTool = new ReportOutTool(
          this.delegationEngine,
          entryAgentConfig.name,
          entryAgentContext.conversationId
        );
        
        delegationTools.push(reportOutTool);
      }

    } catch (error) {
      console.error('Failed to provision delegation tools:', error);
      // Return empty array on error to prevent breaking the flow
    }

    return delegationTools;
  }

  /**
   * Streams information about entry agent capabilities
   */
  private async streamEntryAgentCapabilities(
    stream: vscode.ChatResponseStream,
    entryAgentContext: AgentExecutionContext,
    entryAgentConfig: AgentConfiguration,
    delegationTools: vscode.LanguageModelTool<any>[]
  ): Promise<void> {
    stream.markdown(`**${entryAgentConfig.name} Capabilities:**\n`);
    stream.markdown(`- Description: ${entryAgentConfig.description}\n`);
    stream.markdown(`- Use For: ${entryAgentConfig.useFor}\n`);
    stream.markdown(`- Available Tools: ${entryAgentContext.availableTools.length}\n`);

    // Show tool names for debugging (limit to first 10 to avoid clutter)
    if (entryAgentContext.availableTools.length > 0) {
      const toolNames = entryAgentContext.availableTools
        .map(tool => tool.name || 'unknown')
        .slice(0, 10);
      const displayNames = toolNames.join(', ');
      const moreCount = entryAgentContext.availableTools.length - toolNames.length;

      stream.markdown(`- Tool Names: ${displayNames}${moreCount > 0 ? ` (+${moreCount} more)` : ''}\n`);
    }

    if (delegationTools.length > 0) {
      stream.markdown(`- Delegation Tools: ${delegationTools.map(t => (t as any).name || 'unknown').join(', ')}\n`);
    } else {
      stream.markdown('- Delegation: Disabled\n');
    }

    stream.markdown('\n');
  }

  /**
   * Enhances entry agent context with additional information
   */
  private async enhanceEntryAgentContext(
    entryAgentContext: AgentExecutionContext,
    request: vscode.ChatRequest,
    context: vscode.ChatContext
  ): Promise<AgentExecutionContext> {
    // Add chat context information to the entry agent context
    const enhancedContext = { ...entryAgentContext };

    // Include chat history if available
    if (context.history && context.history.length > 0) {
      // Add recent chat history to help entry agent understand context
      const recentHistory = context.history.slice(-3); // Last 3 messages
      enhancedContext.systemPrompt += '\n\nRecent conversation context:\n' +
        recentHistory.map((msg: any) => `${msg.participant || 'User'}: ${msg.prompt || msg.response || ''}`).join('\n');
    }

    // Add request references if available
    if (request.references && request.references.length > 0) {
      enhancedContext.systemPrompt += '\n\nReferenced files/locations:\n' +
        request.references.map((ref: any) => `- ${ref.id || ref.uri || ref}`).join('\n');
    }

    return enhancedContext;
  }

  /**
   * Executes the entry agent with tools and streaming support
   */
  private async executeEntryAgentWithTools(
    entryAgentContext: AgentExecutionContext,
    entryAgentConfig: AgentConfiguration,
    userMessage: string,
    delegationTools: vscode.LanguageModelTool<any>[],
    token: vscode.CancellationToken
  ): Promise<string> {
    try {
      // Check for cancellation before starting
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }

      // Try to use VS Code Language Model API if available
      if (this.isLanguageModelAvailable()) {
        return await this.executeWithLanguageModel(
          entryAgentContext,
          entryAgentConfig,
          userMessage,
          delegationTools,
          token
        );
      }

      // Fallback to simulation for environments where language model is not available
      return await this.executeWithSimulation(
        entryAgentContext,
        entryAgentConfig,
        userMessage,
        delegationTools,
        token
      );

    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }

      // Handle execution errors gracefully
      throw new AgentExecutionError(
        `Entry agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entryAgentConfig.name,
        { originalError: error, userMessage }
      );
    }
  }

  /**
   * Executes the entry agent using VS Code Language Model API
   */
  private async executeWithLanguageModel(
    entryAgentContext: AgentExecutionContext,
    entryAgentConfig: AgentConfiguration,
    userMessage: string,
    delegationTools: vscode.LanguageModelTool<any>[],
    token: vscode.CancellationToken
  ): Promise<string> {
    try {
      // Check for cancellation
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }

      // Get available language models
      const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
      });

      if (models.length === 0) {
        console.warn('No suitable language models available, falling back to simulation');
        return await this.executeWithSimulation(
          entryAgentContext,
          entryAgentConfig,
          userMessage,
          delegationTools,
          token
        );
      }

      const model = models[0];

      // Prepare messages with system prompt and user input
      const messages = [
        vscode.LanguageModelChatMessage.User(entryAgentContext.systemPrompt),
        vscode.LanguageModelChatMessage.User(userMessage)
      ];

      // Prepare request options with tools if available
      const requestOptions: any = {};
      if (delegationTools.length > 0) {
        requestOptions.tools = delegationTools;
      }

      // Send request to language model
      const response = await model.sendRequest(messages, requestOptions, token);

      // Collect response text
      let responseText = '';
      for await (const fragment of response.text) {
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }
        responseText += fragment;
      }

      return responseText || 'No response received from language model';

    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }

      console.warn('Language model execution failed, falling back to simulation:', error);
      return await this.executeWithSimulation(
        entryAgentContext,
        entryAgentConfig,
        userMessage,
        delegationTools,
        token
      );
    }
  }

  /**
   * Executes the entry agent with simulation (fallback)
   */
  private async executeWithSimulation(
    entryAgentContext: AgentExecutionContext,
    entryAgentConfig: AgentConfiguration,
    userMessage: string,
    delegationTools: vscode.LanguageModelTool<any>[],
    token: vscode.CancellationToken
  ): Promise<string> {
    // Check for cancellation
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    let response = `I'm ${entryAgentConfig.name}, your entry agent. I've analyzed your request: "${userMessage}"\n\n`;
    response += `My role: ${entryAgentConfig.description}\n`;
    response += `I specialize in: ${entryAgentConfig.useFor}\n\n`;

    // Simulate coordinator decision-making with error handling
    if (delegationTools.length > 0) {
      response += "I have delegation capabilities available. ";

      // Simple heuristics to suggest delegation based on entry agent's capabilities
      const canHandleDirectly = this.canEntryAgentHandleRequest(userMessage, entryAgentConfig);

      if (canHandleDirectly) {
        response += "Based on my specialization, I can handle this request directly.\n\n";
        response += "Processing your request with my available tools...";
      } else {
        // Suggest delegation based on request content
        if (userMessage.toLowerCase().includes('code review') || userMessage.toLowerCase().includes('review')) {
          response += "This looks like a code review task that could benefit from a specialized code review agent.\n\n";
          response += "I would typically use the `delegateWork` tool to assign this to a code review specialist.";
        } else if (userMessage.toLowerCase().includes('test') || userMessage.toLowerCase().includes('testing')) {
          response += "This appears to be a testing-related request that could be handled by a testing specialist.\n\n";
          response += "I would typically use the `delegateWork` tool to assign this to a testing agent.";
        } else if (userMessage.toLowerCase().includes('document') || userMessage.toLowerCase().includes('docs')) {
          response += "This seems like a documentation task that could benefit from a documentation specialist.\n\n";
          response += "I would typically use the `delegateWork` tool to assign this to a documentation agent.";
        } else {
          response += "I can handle this request directly or delegate it to a specialized agent if needed.\n\n";
          response += "Available delegation tools: " + delegationTools.map(t => (t as any).name || 'unknown').join(', ');
        }
      }
    } else {
      response += "I'll handle this request directly as delegation is not currently enabled.\n\n";
      response += "Processing your request with my available tools...";
    }

    // Check for cancellation before returning
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    return response;
  }

  /**
   * Checks if VS Code Language Model API is available
   */
  private isLanguageModelAvailable(): boolean {
    try {
      return !!(vscode.lm && vscode.lm.selectChatModels && typeof vscode.lm.selectChatModels === 'function');
    } catch (error) {
      return false;
    }
  }

  /**
   * Determines if the entry agent can handle the request directly based on its specialization
   */
  private canEntryAgentHandleRequest(userMessage: string, entryAgentConfig: AgentConfiguration): boolean {
    const message = userMessage.toLowerCase();
    const useFor = entryAgentConfig.useFor.toLowerCase();
    const description = entryAgentConfig.description.toLowerCase();

    // Simple keyword matching to determine if the request aligns with agent's specialization
    const keywords = [...useFor.split(/[,\s]+/), ...description.split(/[,\s]+/)];

    return keywords.some(keyword =>
      keyword.length > 3 && message.includes(keyword)
    );
  }

  /**
   * Streams response with progress updates and error handling
   */
  private async streamResponseWithProgress(
    stream: vscode.ChatResponseStream,
    responsePromise: Promise<string>,
    token: vscode.CancellationToken
  ): Promise<void> {
    try {
      // Show progress indicator
      stream.progress('Processing request...');

      // Set up cancellation handling
      const cancellationPromise = new Promise<never>((_, reject) => {
        token.onCancellationRequested(() => {
          reject(new vscode.CancellationError());
        });
      });

      // Race between response and cancellation
      const response = await Promise.race([responsePromise, cancellationPromise]);

      // Stream the response
      stream.markdown(response);

    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        stream.markdown('⏹️ Request was cancelled.');
        return;
      }

      // Handle other errors
      await this.streamErrorResponse(stream, error);
    }
  }

  /**
   * Creates fallback response when coordinator fails
   */
  private async createFallbackResponse(
    request: vscode.ChatRequest,
    error: unknown
  ): Promise<string> {
    let fallbackResponse = '🔄 **Fallback Mode**: The multi-agent coordinator encountered an issue, but I can still help.\n\n';

    // Provide basic assistance based on request content
    const userMessage = request.prompt?.toLowerCase() || '';

    if (userMessage.includes('code') || userMessage.includes('programming')) {
      fallbackResponse += 'I can help with code-related questions. Please describe what you need assistance with.';
    } else if (userMessage.includes('test') || userMessage.includes('testing')) {
      fallbackResponse += 'I can help with testing questions. What specific testing challenge are you facing?';
    } else if (userMessage.includes('document') || userMessage.includes('docs')) {
      fallbackResponse += 'I can help with documentation. What would you like to document or learn about?';
    } else {
      fallbackResponse += 'I can provide general assistance. Please let me know what you need help with.';
    }

    fallbackResponse += '\n\n*Note: Multi-agent features are temporarily unavailable.*';

    return fallbackResponse;
  }

  /**
   * Handles entry agent resolution errors with fallback
   */
  private async handleEntryAgentResolutionError(
    stream: vscode.ChatResponseStream,
    resolution: {
      agent: AgentConfiguration | null;
      isValid: boolean;
      errors: string[];
      warnings: string[];
      usedFallback: boolean;
    },
    request: vscode.ChatRequest
  ): Promise<void> {
    try {
      // Stream error information
      stream.markdown('⚠️ **Entry Agent Resolution Issue**\n\n');

      if (resolution.errors.length > 0) {
        stream.markdown('**Errors:**\n');
        resolution.errors.forEach(error => {
          stream.markdown(`- ${error}\n`);
        });
        stream.markdown('\n');
      }

      if (resolution.warnings.length > 0) {
        stream.markdown('**Warnings:**\n');
        resolution.warnings.forEach(warning => {
          stream.markdown(`- ${warning}\n`);
        });
        stream.markdown('\n');
      }

      // Provide recovery suggestions
      stream.markdown('**Recovery Options:**\n');
      stream.markdown('1. Check your entry agent configuration in VS Code settings\n');
      stream.markdown('2. Ensure at least one agent is configured\n');
      stream.markdown('3. Verify that the specified entry agent exists in your agents list\n');
      stream.markdown('4. Reset to default configuration if needed\n\n');

      // Attempt to provide fallback response
      const fallbackResponse = await this.createFallbackResponse(request, new Error('Entry agent resolution failed'));
      stream.markdown('**Fallback Response:**\n\n');
      stream.markdown(fallbackResponse);

    } catch (fallbackError) {
      console.error('Failed to handle entry agent resolution error:', fallbackError);
      stream.markdown('❌ Unable to resolve entry agent configuration. Please check your settings and try again.');
    }
  }

  /**
   * Handles configuration-related errors with recovery
   */
  private async handleConfigurationError(
    stream: vscode.ChatResponseStream,
    error: unknown,
    request: vscode.ChatRequest
  ): Promise<void> {
    try {
      // Stream error information
      stream.markdown('⚠️ **Configuration Issue Detected**\n\n');

      if (error && typeof error === 'object' && 'type' in error) {
        const multiAgentError = error as MultiAgentError;
        stream.markdown(`**Error**: ${multiAgentError.message}\n\n`);
      } else {
        stream.markdown('**Error**: Configuration could not be loaded properly.\n\n');
      }

      // Provide recovery suggestions
      stream.markdown('**Recovery Options:**\n');
      stream.markdown('1. Check your VS Code settings for the Copilot Multi-Agent extension\n');
      stream.markdown('2. Reset to default configuration if needed\n');
      stream.markdown('3. Verify that all required fields are properly configured\n\n');

      // Attempt to provide fallback response
      const fallbackResponse = await this.createFallbackResponse(request, error);
      stream.markdown('**Fallback Response:**\n\n');
      stream.markdown(fallbackResponse);

    } catch (fallbackError) {
      console.error('Failed to handle configuration error:', fallbackError);
      stream.markdown('❌ Unable to recover from configuration error. Please check your settings and try again.');
    }
  }

  /**
   * Handles agent execution errors with graceful degradation
   */
  private async handleAgentExecutionError(
    stream: vscode.ChatResponseStream,
    error: unknown,
    request: vscode.ChatRequest
  ): Promise<void> {
    try {
      // Stream error information
      stream.markdown('⚠️ **Agent Execution Issue**\n\n');

      if (error && typeof error === 'object' && 'type' in error) {
        const multiAgentError = error as MultiAgentError;
        if (multiAgentError.agentName) {
          stream.markdown(`**Agent**: ${multiAgentError.agentName}\n`);
        }
        stream.markdown(`**Error**: ${multiAgentError.message}\n\n`);
      } else {
        stream.markdown('**Error**: Agent execution encountered an issue.\n\n');
      }

      // Provide helpful suggestions
      stream.markdown('**Suggestions:**\n');
      stream.markdown('- Try rephrasing your request\n');
      stream.markdown('- Check if the requested agent is properly configured\n');
      stream.markdown('- Verify delegation permissions if using multi-agent features\n\n');

      // Attempt to provide fallback response
      const fallbackResponse = await this.createFallbackResponse(request, error);
      stream.markdown('**Alternative Response:**\n\n');
      stream.markdown(fallbackResponse);

    } catch (fallbackError) {
      console.error('Failed to handle agent execution error:', fallbackError);
      stream.markdown('❌ Unable to recover from agent execution error. Please try a simpler request.');
    }
  }

  /**
   * Validates request before processing
   */
  private validateRequest(request: vscode.ChatRequest): { isValid: boolean; error?: string } {
    if (!request) {
      return { isValid: false, error: 'Request is null or undefined' };
    }

    if (!request.prompt && !request.command) {
      return { isValid: false, error: 'Request must have either a prompt or command' };
    }

    if (request.prompt && request.prompt.length > 10000) {
      return { isValid: false, error: 'Request prompt is too long (maximum 10,000 characters)' };
    }

    return { isValid: true };
  }

  /**
   * Logs request for debugging and monitoring
   */
  private logRequest(request: vscode.ChatRequest, context: vscode.ChatContext): void {
    try {
      const logData = {
        requestId: (request as any).requestId || 'unknown',
        promptLength: request.prompt?.length || 0,
        command: request.command,
        referencesCount: request.references?.length || 0,
        historyLength: context.history?.length || 0,
        timestamp: new Date().toISOString()
      };

      console.log('Multi-agent chat request:', JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('Failed to log request:', error);
    }
  }

  /**
   * Gets available agents for delegation based on coordinator permissions
   */
  private async getAvailableAgentsForDelegation(
    entryAgentConfig: AgentConfiguration
  ): Promise<string[]> {
    const config = await this.configurationManager.loadConfiguration();
    const allOtherAgents = config.agents.filter(agent => agent.name !== entryAgentConfig.name).map(agent => agent.name);

    switch (entryAgentConfig.delegationPermissions.type) {
      case 'all':
        return allOtherAgents;

      case 'none':
        return [];

      case 'specific':
        if (!entryAgentConfig.delegationPermissions.agents) {
          return [];
        }
        return entryAgentConfig.delegationPermissions.agents.filter(agentName =>
          allOtherAgents.includes(agentName)
        );

      default:
        return [];
    }
  }

  /**
   * Streams an error response to the user
   */
  private async streamErrorResponse(stream: vscode.ChatResponseStream, error: unknown): Promise<void> {
    try {
      if (error && typeof error === 'object' && 'type' in error) {
        const multiAgentError = error as MultiAgentError;
        stream.markdown(`❌ **Multi-Agent Error**: ${multiAgentError.message}\n\n`);

        if (multiAgentError.agentName) {
          stream.markdown(`**Agent**: ${multiAgentError.agentName}\n`);
        }

        if (multiAgentError.type) {
          stream.markdown(`**Error Type**: ${multiAgentError.type}\n`);
        }

        // Provide helpful suggestions based on error type
        switch (multiAgentError.type) {
          case MultiAgentErrorType.CONFIGURATION_ERROR:
            stream.markdown('\n💡 **Suggestion**: Check your multi-agent configuration in VS Code settings.');
            break;
          case MultiAgentErrorType.AGENT_EXECUTION_ERROR:
            stream.markdown('\n💡 **Suggestion**: Try your request again or check if the agent configuration is valid.');
            break;
          case MultiAgentErrorType.DELEGATION_ERROR:
            stream.markdown('\n💡 **Suggestion**: Verify that the target agent exists and delegation is allowed.');
            break;
          default:
            stream.markdown('\n💡 **Suggestion**: Please try your request again.');
        }
      } else if (error instanceof AgentExecutionError) {
        stream.markdown(`❌ **Agent Execution Error**: ${error.message}\n\n`);

        if (error.agentName) {
          stream.markdown(`**Agent**: ${error.agentName}\n`);
        }

        stream.markdown('\n💡 **Suggestion**: Check the agent configuration and try again.');
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        stream.markdown(`❌ **Error**: ${errorMessage}\n\n`);
        stream.markdown('💡 **Suggestion**: Please try your request again.');
      }
    } catch (streamError) {
      console.error('Failed to stream error response:', streamError);
      // Fallback: try to stream a basic error message
      try {
        stream.markdown('❌ An unexpected error occurred. Please try again.');
      } catch (fallbackError) {
        console.error('Failed to stream fallback error message:', fallbackError);
      }
    }
  }

  /**
   * Disposes of the chat participant and cleans up resources
   */
  dispose(): void {
    // Dispose of all disposables
    this.disposables.forEach(disposable => {
      try {
        disposable.dispose();
      } catch (error) {
        console.error('Error disposing chat participant resource:', error);
      }
    });

    this.disposables = [];
    this.chatParticipant = undefined;

    console.log('Multi-agent chat participant disposed');
  }

  /**
   * Gets the current chat participant instance
   */
  getChatParticipant(): vscode.ChatParticipant | undefined {
    return this.chatParticipant;
  }

  /**
   * Checks if the chat participant is registered
   */
  isRegistered(): boolean {
    return this.chatParticipant !== undefined;
  }
}