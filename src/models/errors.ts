/**
 * Error types and interfaces for multi-agent system
 */

export enum MultiAgentErrorType {
  CONFIGURATION_ERROR = 'configuration_error',
  DELEGATION_ERROR = 'delegation_error',
  TOOL_ACCESS_ERROR = 'tool_access_error',
  AGENT_EXECUTION_ERROR = 'agent_execution_error',
  CIRCULAR_DELEGATION = 'circular_delegation'
}

export interface MultiAgentError extends Error {
  type: MultiAgentErrorType;
  agentName?: string;
  details?: Record<string, any>;
}

export class ConfigurationError extends Error implements MultiAgentError {
  type = MultiAgentErrorType.CONFIGURATION_ERROR;
  agentName?: string;
  details?: Record<string, any>;

  constructor(message: string, agentName?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ConfigurationError';
    this.agentName = agentName;
    this.details = details;
  }
}

export class DelegationError extends Error implements MultiAgentError {
  type = MultiAgentErrorType.DELEGATION_ERROR;
  agentName?: string;
  details?: Record<string, any>;

  constructor(message: string, agentName?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'DelegationError';
    this.agentName = agentName;
    this.details = details;
  }
}

export class ToolAccessError extends Error implements MultiAgentError {
  type = MultiAgentErrorType.TOOL_ACCESS_ERROR;
  agentName?: string;
  details?: Record<string, any>;

  constructor(message: string, agentName?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'ToolAccessError';
    this.agentName = agentName;
    this.details = details;
  }
}

export class AgentExecutionError extends Error implements MultiAgentError {
  type = MultiAgentErrorType.AGENT_EXECUTION_ERROR;
  agentName?: string;
  details?: Record<string, any>;

  constructor(message: string, agentName?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'AgentExecutionError';
    this.agentName = agentName;
    this.details = details;
  }
}

export class CircularDelegationError extends Error implements MultiAgentError {
  type = MultiAgentErrorType.CIRCULAR_DELEGATION;
  agentName?: string;
  details?: Record<string, any>;

  constructor(message: string, agentName?: string, details?: Record<string, any>) {
    super(message);
    this.name = 'CircularDelegationError';
    this.agentName = agentName;
    this.details = details;
  }
}