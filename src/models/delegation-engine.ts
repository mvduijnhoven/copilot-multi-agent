/**
 * Interfaces for the delegation engine and multi-agent coordination
 */

export interface DelegationEngine {
  /**
   * Delegates work from one agent to another
   * @param fromAgent The agent delegating the work
   * @param toAgent The target agent to receive the work
   * @param workDescription Description of the work to be done
   * @param reportExpectations What kind of report is expected back
   * @returns Promise resolving to the report from the target agent
   */
  delegateWork(
    fromAgent: string,
    toAgent: string,
    workDescription: string,
    reportExpectations: string
  ): Promise<string>;
  
  /**
   * Reports completion of delegated work
   * @param agentName The agent reporting completion
   * @param report The report content
   */
  reportOut(agentName: string, report: string): void;
  
  /**
   * Validates if delegation is allowed between two agents
   * @param fromAgent The agent attempting to delegate
   * @param toAgent The target agent
   * @returns Promise resolving to true if delegation is allowed
   */
  isValidDelegation(fromAgent: string, toAgent: string): Promise<boolean>;
}

export interface DelegationRequest {
  fromAgent: string;
  toAgent: string;
  workDescription: string;
  reportExpectations: string;
  timestamp: Date;
}

export interface DelegationReport {
  agentName: string;
  report: string;
  timestamp: Date;
  conversationId: string;
}