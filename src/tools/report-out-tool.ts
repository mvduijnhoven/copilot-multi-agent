/**
 * Interface for the reportOut custom tool
 */

export interface ReportOutTool {
  /**
   * The name of the tool
   */
  readonly name: string;
  
  /**
   * Description of what the tool does
   */
  readonly description: string;
  
  /**
   * Parameter schema for the tool
   */
  readonly parametersSchema: any; // Will be typed appropriately when VS Code types are available
  
  /**
   * Invokes the reportOut tool
   * @param parameters The tool parameters
   * @param token Cancellation token
   * @returns Promise resolving to tool result
   */
  invoke(parameters: ReportOutParameters, token: any): Promise<any>;
}

export interface ReportOutParameters {
  report: string;
}