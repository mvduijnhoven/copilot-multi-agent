/**
 * Main barrel export for the multi-agent extension
 */

export * from './models';
export * from './tools';

// Export services with explicit naming to avoid conflicts
export { 
  IConfigurationManager, 
  ConfigurationManager 
} from './services/configuration-manager';
export { 
  AgentEngine, 
  DefaultAgentEngine 
} from './services/agent-engine';
export { 
  DefaultToolFilter 
} from './services/tool-filter';
export * from './services/chat-participant';