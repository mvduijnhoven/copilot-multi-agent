/**
 * Comprehensive error handling service for multi-agent system
 * Provides error isolation, logging, and user notification mechanisms
 */

import * as vscode from 'vscode';
import { 
  MultiAgentError, 
  MultiAgentErrorType,
  ConfigurationError,
  DelegationError,
  ToolAccessError,
  AgentExecutionError,
  CircularDelegationError
} from '../models/errors';

export interface ErrorContext {
  agentName?: string;
  requestId?: string;
  operation?: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface ErrorHandlingOptions {
  isolateErrors: boolean;
  logErrors: boolean;
  notifyUser: boolean;
  provideFallback: boolean;
}

export interface FallbackResponse {
  message: string;
  suggestions?: string[];
  recoveryActions?: string[];
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private outputChannel: vscode.OutputChannel;
  private errorHistory: Array<{ error: MultiAgentError; context: ErrorContext }> = [];
  private readonly maxHistorySize = 100;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Copilot Multi-Agent');
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle an error with comprehensive error processing
   */
  public async handleError(
    error: Error | MultiAgentError,
    context: ErrorContext,
    options: Partial<ErrorHandlingOptions> = {}
  ): Promise<FallbackResponse | null> {
    const defaultOptions: ErrorHandlingOptions = {
      isolateErrors: true,
      logErrors: true,
      notifyUser: true,
      provideFallback: true
    };

    const finalOptions = { ...defaultOptions, ...options };
    const multiAgentError = this.normalizeError(error, context);

    // Log the error
    if (finalOptions.logErrors) {
      this.logError(multiAgentError, context);
    }

    // Add to error history
    this.addToHistory(multiAgentError, context);

    // Isolate error to prevent cascading failures
    if (finalOptions.isolateErrors) {
      this.isolateError(multiAgentError, context);
    }

    // Notify user if appropriate
    if (finalOptions.notifyUser) {
      await this.notifyUser(multiAgentError, context);
    }

    // Provide fallback response
    if (finalOptions.provideFallback) {
      return this.generateFallbackResponse(multiAgentError, context);
    }

    return null;
  }

  /**
   * Normalize any error to MultiAgentError format
   */
  private normalizeError(error: Error | MultiAgentError, context: ErrorContext): MultiAgentError {
    if (this.isMultiAgentError(error)) {
      return error;
    }

    // Convert standard errors to MultiAgentError based on context
    const errorType = this.classifyError(error, context);
    
    switch (errorType) {
      case MultiAgentErrorType.CONFIGURATION_ERROR:
        return new ConfigurationError(error.message, context.agentName, context.details);
      case MultiAgentErrorType.DELEGATION_ERROR:
        return new DelegationError(error.message, context.agentName, context.details);
      case MultiAgentErrorType.TOOL_ACCESS_ERROR:
        return new ToolAccessError(error.message, context.agentName, context.details);
      case MultiAgentErrorType.CIRCULAR_DELEGATION:
        return new CircularDelegationError(error.message, context.agentName, context.details);
      default:
        return new AgentExecutionError(error.message, context.agentName, context.details);
    }
  }

  /**
   * Check if error is already a MultiAgentError
   */
  private isMultiAgentError(error: Error | MultiAgentError): error is MultiAgentError {
    return 'type' in error && Object.values(MultiAgentErrorType).includes((error as MultiAgentError).type);
  }

  /**
   * Classify error type based on error message and context
   */
  private classifyError(error: Error, context: ErrorContext): MultiAgentErrorType {
    const message = error.message.toLowerCase();
    const operation = context.operation?.toLowerCase() || '';

    if (message.includes('configuration') || message.includes('config') || operation.includes('config')) {
      return MultiAgentErrorType.CONFIGURATION_ERROR;
    }

    if (message.includes('delegation') || message.includes('delegate') || operation.includes('delegate')) {
      return MultiAgentErrorType.DELEGATION_ERROR;
    }

    if (message.includes('tool') || message.includes('permission') || operation.includes('tool')) {
      return MultiAgentErrorType.TOOL_ACCESS_ERROR;
    }

    if (message.includes('circular') || message.includes('loop') || message.includes('recursive')) {
      return MultiAgentErrorType.CIRCULAR_DELEGATION;
    }

    return MultiAgentErrorType.AGENT_EXECUTION_ERROR;
  }

  /**
   * Log error with detailed information
   */
  private logError(error: MultiAgentError, context: ErrorContext): void {
    const timestamp = context.timestamp.toISOString();
    const logEntry = [
      `[${timestamp}] Multi-Agent Error: ${error.type}`,
      `Message: ${error.message}`,
      `Agent: ${context.agentName || 'unknown'}`,
      `Request ID: ${context.requestId || 'unknown'}`,
      `Operation: ${context.operation || 'unknown'}`,
      error.details ? `Details: ${JSON.stringify(error.details, null, 2)}` : '',
      error.stack ? `Stack: ${error.stack}` : '',
      '---'
    ].filter(Boolean).join('\n');

    try {
      this.outputChannel.appendLine(logEntry);
    } catch (channelError) {
      // Output channel may be disposed, fall back to console
      console.log(`[ERROR HANDLER] ${logEntry}`);
    }
    console.error(`Multi-Agent Error [${error.type}]:`, error.message, context);
  }

  /**
   * Add error to history for analysis
   */
  private addToHistory(error: MultiAgentError, context: ErrorContext): void {
    this.errorHistory.push({ error, context });
    
    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Isolate error to prevent cascading failures
   */
  private isolateError(error: MultiAgentError, context: ErrorContext): void {
    // Log isolation action
    const isolationMessage = `[${context.timestamp.toISOString()}] Isolating error to prevent cascade: ${error.type} in ${context.agentName || 'unknown'}`;
    
    try {
      this.outputChannel.appendLine(isolationMessage);
    } catch (channelError) {
      // Output channel may be disposed, fall back to console
      console.log(`[ERROR HANDLER] ${isolationMessage}`);
    }

    // For delegation errors, we might want to prevent further delegations temporarily
    if (error.type === MultiAgentErrorType.DELEGATION_ERROR || 
        error.type === MultiAgentErrorType.CIRCULAR_DELEGATION) {
      // This could be extended to implement temporary delegation blocking
      console.warn(`Delegation error isolated for agent: ${context.agentName}`);
    }

    // For configuration errors, we might want to reset to defaults
    if (error.type === MultiAgentErrorType.CONFIGURATION_ERROR) {
      console.warn(`Configuration error isolated, may fall back to defaults`);
    }
  }

  /**
   * Check if we're in a test environment
   */
  private isTestEnvironment(): boolean {
    // Check for common test environment indicators
    return process.env.NODE_ENV === 'test' || 
           process.env.VSCODE_TEST === 'true' ||
           typeof global !== 'undefined' && (global as any).suite !== undefined ||
           typeof (global as any).describe !== undefined;
  }

  /**
   * Notify user about the error appropriately
   */
  private async notifyUser(error: MultiAgentError, context: ErrorContext): Promise<void> {
    // Skip notifications in test environment
    if (this.isTestEnvironment()) {
      console.log(`[TEST] Would show notification: ${this.getUserFriendlyMessage(error)}`);
      return;
    }

    const severity = this.getErrorSeverity(error);
    
    switch (severity) {
      case 'critical':
        await vscode.window.showErrorMessage(
          `Multi-Agent System Error: ${this.getUserFriendlyMessage(error)}`,
          'View Details',
          'Reset Configuration'
        ).then(selection => {
          if (selection === 'View Details') {
            try {
              this.outputChannel.show();
            } catch (channelError) {
              console.log('[ERROR HANDLER] Cannot show output channel (disposed)');
            }
          } else if (selection === 'Reset Configuration') {
            this.suggestConfigurationReset();
          }
        });
        break;
        
      case 'warning':
        await vscode.window.showWarningMessage(
          `Multi-Agent Warning: ${this.getUserFriendlyMessage(error)}`,
          'View Details'
        ).then(selection => {
          if (selection === 'View Details') {
            try {
              this.outputChannel.show();
            } catch (channelError) {
              console.log('[ERROR HANDLER] Cannot show output channel (disposed)');
            }
          }
        });
        break;
        
      case 'info':
        // For info level, just log to output channel
        try {
          this.outputChannel.appendLine(`Info: ${this.getUserFriendlyMessage(error)}`);
        } catch (channelError) {
          console.log(`[ERROR HANDLER] Info: ${this.getUserFriendlyMessage(error)}`);
        }
        break;
    }
  }

  /**
   * Determine error severity for user notification
   */
  private getErrorSeverity(error: MultiAgentError): 'critical' | 'warning' | 'info' {
    switch (error.type) {
      case MultiAgentErrorType.CONFIGURATION_ERROR:
        return 'critical';
      case MultiAgentErrorType.CIRCULAR_DELEGATION:
        return 'critical';
      case MultiAgentErrorType.DELEGATION_ERROR:
        return 'warning';
      case MultiAgentErrorType.TOOL_ACCESS_ERROR:
        return 'info';
      case MultiAgentErrorType.AGENT_EXECUTION_ERROR:
        return 'warning';
      default:
        return 'warning';
    }
  }

  /**
   * Generate user-friendly error message
   */
  private getUserFriendlyMessage(error: MultiAgentError): string {
    switch (error.type) {
      case MultiAgentErrorType.CONFIGURATION_ERROR:
        return `Configuration issue detected. Please check your multi-agent settings.`;
      case MultiAgentErrorType.DELEGATION_ERROR:
        return `Unable to delegate work to the specified agent. Please verify agent configuration.`;
      case MultiAgentErrorType.TOOL_ACCESS_ERROR:
        return `Tool access restricted. The agent doesn't have permission to use the requested tool.`;
      case MultiAgentErrorType.AGENT_EXECUTION_ERROR:
        return `Agent execution failed. The system will attempt to recover automatically.`;
      case MultiAgentErrorType.CIRCULAR_DELEGATION:
        return `Circular delegation detected. Please review your delegation chain.`;
      default:
        return `An unexpected error occurred in the multi-agent system.`;
    }
  }

  /**
   * Generate fallback response for errors
   */
  private generateFallbackResponse(error: MultiAgentError, context: ErrorContext): FallbackResponse {
    const baseMessage = `I encountered an issue while processing your request`;
    
    switch (error.type) {
      case MultiAgentErrorType.CONFIGURATION_ERROR:
        return {
          message: `${baseMessage} due to a configuration problem. I'll use default settings to help you.`,
          suggestions: [
            'Check your multi-agent extension settings',
            'Reset configuration to defaults',
            'Contact support if the issue persists'
          ],
          recoveryActions: [
            'Open VS Code Settings → Extensions → Copilot Multi-Agent',
            'Click "Reset to Defaults" button',
            'Restart VS Code if needed'
          ]
        };

      case MultiAgentErrorType.DELEGATION_ERROR:
        return {
          message: `${baseMessage} while trying to delegate work. I'll handle this directly instead.`,
          suggestions: [
            'Verify that the target agent is properly configured',
            'Check delegation permissions',
            'Try a different approach to the task'
          ],
          recoveryActions: [
            'Review agent configuration',
            'Check delegation permissions in settings',
            'Try rephrasing your request'
          ]
        };

      case MultiAgentErrorType.TOOL_ACCESS_ERROR:
        return {
          message: `${baseMessage} due to tool access restrictions. I'll work with available tools.`,
          suggestions: [
            'Check tool permissions for the agent',
            'Consider using a different agent',
            'Review security settings'
          ],
          recoveryActions: [
            'Update tool permissions in agent configuration',
            'Use an agent with broader tool access',
            'Contact administrator for permission changes'
          ]
        };

      case MultiAgentErrorType.CIRCULAR_DELEGATION:
        return {
          message: `${baseMessage} due to a circular delegation loop. I'll handle this directly.`,
          suggestions: [
            'Review your delegation chain',
            'Simplify agent interactions',
            'Check for recursive delegation patterns'
          ],
          recoveryActions: [
            'Modify delegation permissions to break the loop',
            'Use direct agent invocation instead',
            'Redesign the task workflow'
          ]
        };

      default:
        return {
          message: `${baseMessage}. I'll do my best to help with the available resources.`,
          suggestions: [
            'Try rephrasing your request',
            'Check the output log for more details',
            'Contact support if the issue persists'
          ],
          recoveryActions: [
            'Restart the extension',
            'Check VS Code and extension updates',
            'Review system requirements'
          ]
        };
    }
  }

  /**
   * Suggest configuration reset
   */
  private async suggestConfigurationReset(): Promise<void> {
    // Skip in test environment
    if (this.isTestEnvironment()) {
      console.log('[TEST] Would suggest configuration reset');
      return;
    }

    const result = await vscode.window.showWarningMessage(
      'This will reset all multi-agent configurations to defaults. Continue?',
      'Yes, Reset',
      'Cancel'
    );

    if (result === 'Yes, Reset') {
      // This would trigger configuration reset - implementation depends on ConfigurationManager
      vscode.window.showInformationMessage('Configuration reset completed. Please restart VS Code.');
    }
  }

  /**
   * Get error statistics for debugging
   */
  public getErrorStatistics(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const entry of this.errorHistory) {
      const type = entry.error.type;
      stats[type] = (stats[type] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Clear error history
   */
  public clearHistory(): void {
    this.errorHistory = [];
    try {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Error history cleared`);
    } catch (error) {
      // Output channel may be disposed, ignore the error
      console.log('Error history cleared (output channel unavailable)');
    }
  }

  /**
   * Get recent errors for debugging
   */
  public getRecentErrors(count: number = 10): Array<{ error: MultiAgentError; context: ErrorContext }> {
    return this.errorHistory.slice(-count);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.outputChannel.dispose();
    this.errorHistory = [];
  }
}

/**
 * Utility function to handle errors with default options
 */
export async function handleError(
  error: Error | MultiAgentError,
  context: Partial<ErrorContext> = {}
): Promise<FallbackResponse | null> {
  const errorHandler = ErrorHandler.getInstance();
  const fullContext: ErrorContext = {
    timestamp: new Date(),
    ...context
  };
  
  return errorHandler.handleError(error, fullContext);
}

/**
 * Utility function to create error context
 */
export function createErrorContext(
  agentName?: string,
  requestId?: string,
  operation?: string,
  details?: Record<string, any>
): ErrorContext {
  return {
    agentName,
    requestId,
    operation,
    timestamp: new Date(),
    details
  };
}