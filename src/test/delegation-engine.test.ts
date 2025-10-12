/**
 * Unit tests for the delegation engine
 */

import * as assert from 'assert';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { AgentEngine } from '../services/agent-engine';
import { IConfigurationManager } from '../services/configuration-manager';
import { 
  AgentConfiguration, 
  CoordinatorConfiguration, 
  AgentExecutionContext,
  ExtensionConfiguration
} from '../models';

// Mock implementations
class MockAgentEngine implements AgentEngine {
  private contexts: Map<string, AgentExecutionContext> = new Map();
  
  async initializeAgent(config: AgentConfiguration): Promise<AgentExecutionContext> {
    const context: AgentExecutionContext = {
      agentName: config.name,
      conversationId: `${config.name}-123`,
      systemPrompt: config.systemPrompt,
      availableTools: [],
      delegationChain: []
    };
    this.contexts.set(config.name, context);
    return context;
  }
  
  async executeAgent(context: AgentExecutionContext, input: string): Promise<string> {
    return `Agent ${context.agentName} processed: ${input}`;
  }
  
  getAgentContext(agentName: string): AgentExecutionContext | undefined {
    return this.contexts.get(agentName);
  }
  
  terminateAgent(agentName: string): void {
    this.contexts.delete(agentName);
  }
  
  getActiveAgents(): AgentExecutionContext[] {
    return Array.from(this.contexts.values());
  }
  
  setMockContext(agentName: string, context: AgentExecutionContext): void {
    this.contexts.set(agentName, context);
  }
  
  clearMockContexts(): void {
    this.contexts.clear();
  }
}

class MockConfigurationManager implements IConfigurationManager {
  private config: ExtensionConfiguration = {
    coordinator: {
      name: 'coordinator',
      systemPrompt: 'You are a coordinator',
      description: 'Coordinates work',
      useFor: 'Coordination',
      delegationPermissions: { type: 'all' },
      toolPermissions: { type: 'all' }
    },
    customAgents: [{
      name: 'test-agent',
      systemPrompt: 'You are a test agent',
      description: 'Test agent',
      useFor: 'Testing',
      delegationPermissions: { type: 'none' },
      toolPermissions: { type: 'all' }
    }]
  };
  
  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.config;
  }
  
  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.config = config;
  }
  
  validateConfiguration(config: ExtensionConfiguration): boolean {
    return true;
  }
  
  getDefaultConfiguration(): ExtensionConfiguration {
    return this.config;
  }
  
  onConfigurationChanged(listener: (config: ExtensionConfiguration) => void): void {}
  
  dispose(): void {}
  
  setMockConfig(config: ExtensionConfiguration): void {
    this.config = config;
  }
}

// Test suite
export async function runDelegationEngineTests(): Promise<void> {
  console.log('Running delegation engine tests...');
  
  const mockAgentEngine = new MockAgentEngine();
  const mockConfigManager = new MockConfigurationManager();
  
  // Test setup
  function setup(): DefaultDelegationEngine {
    mockAgentEngine.clearMockContexts();
    return new DefaultDelegationEngine(mockAgentEngine, mockConfigManager);
  }
  
  // Test 1: Basic delegation validation
  let delegationEngine = setup();
  console.log('Test 1: isValidDelegation with "all" permissions');
  
  const result1 = await delegationEngine.isValidDelegation('coordinator', 'test-agent');
  assert.strictEqual(result1, true, 'Should allow delegation with "all" permissions');
  console.log('✓ Test 1 passed');
  
  // Test 2: Delegation validation with "none" permissions
  delegationEngine = setup();
  console.log('Test 2: isValidDelegation with "none" permissions');
  
  mockConfigManager.setMockConfig({
    coordinator: {
      name: 'coordinator',
      systemPrompt: 'You are a coordinator',
      description: 'Coordinates work',
      useFor: 'Coordination',
      delegationPermissions: { type: 'none' },
      toolPermissions: { type: 'all' }
    },
    customAgents: [{
      name: 'test-agent',
      systemPrompt: 'You are a test agent',
      description: 'Test agent',
      useFor: 'Testing',
      delegationPermissions: { type: 'none' },
      toolPermissions: { type: 'all' }
    }]
  });
  
  const result2 = await delegationEngine.isValidDelegation('coordinator', 'test-agent');
  assert.strictEqual(result2, false, 'Should not allow delegation with "none" permissions');
  console.log('✓ Test 2 passed');
  
  // Test 3: Delegation validation with specific permissions
  delegationEngine = setup();
  console.log('Test 3: isValidDelegation with "specific" permissions');
  
  mockConfigManager.setMockConfig({
    coordinator: {
      name: 'coordinator',
      systemPrompt: 'You are a coordinator',
      description: 'Coordinates work',
      useFor: 'Coordination',
      delegationPermissions: { type: 'specific', agents: ['test-agent'] },
      toolPermissions: { type: 'all' }
    },
    customAgents: [{
      name: 'test-agent',
      systemPrompt: 'You are a test agent',
      description: 'Test agent',
      useFor: 'Testing',
      delegationPermissions: { type: 'none' },
      toolPermissions: { type: 'all' }
    }]
  });
  
  const result3 = await delegationEngine.isValidDelegation('coordinator', 'test-agent');
  assert.strictEqual(result3, true, 'Should allow delegation to specific agent');
  console.log('✓ Test 3 passed');
  
  // Test 4: Self-delegation should be rejected
  delegationEngine = setup();
  console.log('Test 4: Self-delegation rejection');
  
  const result4 = await delegationEngine.isValidDelegation('coordinator', 'coordinator');
  assert.strictEqual(result4, false, 'Should not allow self-delegation');
  console.log('✓ Test 4 passed');
  
  // Test 5: Delegation statistics
  delegationEngine = setup();
  console.log('Test 5: Delegation statistics');
  
  const stats = delegationEngine.getDelegationStats();
  assert.strictEqual(typeof stats.active, 'number', 'Stats should have active count');
  assert.strictEqual(typeof stats.completed, 'number', 'Stats should have completed count');
  assert.strictEqual(typeof stats.pending, 'number', 'Stats should have pending count');
  console.log('✓ Test 5 passed');
  
  // Test 6: Delegation history
  delegationEngine = setup();
  console.log('Test 6: Delegation history');
  
  const history = await delegationEngine.getDelegationHistory('coordinator');
  assert.strictEqual(Array.isArray(history.delegatedTo), true, 'History should have delegatedTo array');
  assert.strictEqual(Array.isArray(history.delegatedFrom), true, 'History should have delegatedFrom array');
  console.log('✓ Test 6 passed');
  
  // Test 7: Active delegations tracking
  delegationEngine = setup();
  console.log('Test 7: Active delegations tracking');
  
  const activeDelegations = delegationEngine.getActiveDelegations();
  assert.strictEqual(Array.isArray(activeDelegations), true, 'Should return array of active delegations');
  console.log('✓ Test 7 passed');
  
  // Test 8: Report out functionality
  delegationEngine = setup();
  console.log('Test 8: Report out functionality');
  
  // Set up a mock context for the agent
  const testContext: AgentExecutionContext = {
    agentName: 'test-agent',
    conversationId: 'test-123',
    systemPrompt: 'Test prompt',
    availableTools: [],
    delegationChain: ['coordinator']
  };
  mockAgentEngine.setMockContext('test-agent', testContext);
  
  // This should not throw
  try {
    delegationEngine.reportOut('test-agent', 'Task completed');
    console.log('✓ Test 8 passed');
  } catch (error) {
    console.error('✗ Test 8 failed:', error);
    throw error;
  }
  
  // Test 9: Cleanup functionality
  delegationEngine = setup();
  console.log('Test 9: Cleanup functionality');
  
  try {
    delegationEngine.cleanup();
    console.log('✓ Test 9 passed');
  } catch (error) {
    console.error('✗ Test 9 failed:', error);
    throw error;
  }
  
  console.log('All delegation engine tests passed! ✅');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runDelegationEngineTests().catch(console.error);
}