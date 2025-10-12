import * as vscode from 'vscode';
import { DelegationEngine } from '../models/delegation-engine';

/**
 * Parameters for the reportOut tool
 */
export interface ReportOutParameters {
  report: string;
}

/**
 * Custom tool that allows agents to report completion of delegated work
 * This tool terminates the agent's execution loop and returns the report to the delegating agent
 */
export class ReportOutTool implements vscode.LanguageModelTool<ReportOutParameters> {
  readonly name = 'reportOut';
  readonly description = 'Report completion of delegated work and terminate the current agent execution. Use this when you have completed the assigned task and need to return results to the delegating agent.';
  
  readonly parametersSchema = {
    type: 'object',
    properties: {
      report: {
        type: 'string',
        description: 'The detailed report of the completed work. Include all relevant findings, results, recommendations, or deliverables.',
        minLength: 10,
        maxLength: 5000
      }
    },
    required: ['report'],
    additionalProperties: false
  };

  constructor(
    private delegationEngine: DelegationEngine,
    private currentAgentName: string,
    private conversationId: string
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReportOutParameters>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      // Extract parameters from options - the exact structure may vary based on VS Code API version
      const parameters = (options as any).parameters || options;
      
      // Validate parameters
      this.validateParameters(parameters);
      
      // Check for cancellation before processing
      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }

      // Report completion to the delegation engine
      this.delegationEngine.reportOut(this.currentAgentName, parameters.report);

      // Return confirmation that the report has been submitted
      // Note: The actual agent execution termination is handled by the delegation engine
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Report submitted successfully. Agent execution will now terminate.\n\nReport Summary:\n${this.truncateReport(parameters.report, 200)}`)
      ]);

    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred while reporting out';
      
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Failed to submit report: ${errorMessage}`)
      ]);
    }
  }

  /**
   * Validates the parameters for the reportOut tool
   * @param parameters The parameters to validate
   * @throws Error if parameters are invalid
   */
  private validateParameters(parameters: ReportOutParameters): void {
    if (!parameters.report || typeof parameters.report !== 'string') {
      throw new Error('report is required and must be a non-empty string');
    }

    if (parameters.report.trim().length < 10) {
      throw new Error('report must be at least 10 characters long (excluding whitespace)');
    }

    if (parameters.report.length > 5000) {
      throw new Error('report must not exceed 5000 characters');
    }
  }

  /**
   * Truncates a report to a specified length for display purposes
   * @param report The full report text
   * @param maxLength Maximum length for the truncated version
   * @returns Truncated report with ellipsis if needed
   */
  private truncateReport(report: string, maxLength: number): string {
    if (report.length <= maxLength) {
      return report;
    }
    
    return report.substring(0, maxLength - 3) + '...';
  }
}