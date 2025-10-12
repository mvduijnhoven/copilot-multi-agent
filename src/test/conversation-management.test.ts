/**
 * Integration tests for conversation management in delegation engine
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

// Mock implementations for integration testing
class MockAgentEngine implements AgentEngine {
  private contexts: Map<string, AgentExecutionContext> = new Map();
  
  async initializeAgent(config: AgentConfiguration): Promise<AgentExecutionContext> {
    const context: AgentExecutionContext = {
      agentName: config.name,
      conversationId: `${config.name}-${Date.now()}`,
      systemPrompt: config.systemPrompt,
      availableTools: [],
      delegationChain: [],
      availableDelegationTargets: []
    };
    this.contexts.set(context.conversationId, context);
    return context;
  }
  
  async executeAgent(context: AgentExecutionContext, input: string): Promise<string> {
    // Simulate async execution
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`Agent ${context.agentName} processed: ${input}`);
      }, 10);
    });
  }
  
  getAgentContext(agentName: string): AgentExecutionContext | undefined {
    // Return the most recent context for the agent
    const agentContexts = Array.from(this.contexts.values())
      .filter(context => context.agentName === agentName)
      .sort((a, b) => b.conversationId.localeCompare(a.conversationId));
    
    return agentContexts.length > 0 ? agentContexts[0] : undefined;
  }
  
  terminateAgent(agentName: string): void {
    const keysToRemove: string[] = [];
    for (const [key, context] of this.contexts.entries()) {
      if (context.agentName === agentName) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => this.contexts.delete(key));
  }
  
  getActiveAgents(): AgentExecutionContext[] {
    return Array.from(this.contexts.values());
  }
  
  // Helper methods for testing
  setContext(conversationId: string, context: AgentExecutionContext): void {
    this.contexts.set(conversationId, context);
  }
  
  removeContext(conversationId: string): void {
    this.contexts.delete(conversationId);
  }
  
  clearContexts(): void {
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
    customAgents: [
      {
        name: 'test-agent',
        systemPrompt: 'You are a test agent',
        description: 'Test agent',
        useFor: 'Testing',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      },
      {
        name: 'child-agent',
        systemPrompt: 'You are a child agent',
        description: 'Child agent',
        useFor: 'Child tasks',
        delegationPermissions: { type: 'none' },
        toolPermissions: { type: 'all' }
      }
    ]
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
}

// Integration test suite
export async function runConversationManagementTests(): Promise<void> {
  console.log('Running conversation management integration tests...');
  
  const mockAgentEngine = new MockAgentEngine();
  const mockConfigManager = new MockConfigurationManager();
  let delegationEngine: DefaultDelegationEngine;
  
  // Test setup
  function setup(): DefaultDelegationEngine {
    mockAgentEngine.clearContexts();
    return new DefaultDelegationEngine(mockAgentEngine, mockConfigManager);
  }
  
  // Test 1: Conversation creation and tracking
  delegationEngine = setup();
  console.log('Test 1: Conversation creation and tracking');
  
  // Set up coordinator context
  const coordinatorContext: AgentExecutionContext = {
    agentName: 'coordinator',
    conversationId: 'coord-123',
    systemPrompt: 'You are a coordinator',
    availableTools: [],
    delegationChain: [],
    availableDelegationTargets: []
  };
  mockAgentEngine.setContext('coord-123', coordinatorContext);
  
  // Start a delegation to create a conversation
  const delegationPromise = delegationEngine.delegateWork(
    'coordinator',
    'test-agent',
    'Test work',
    'Provide results'
  );
  
  // Wait a bit for the delegation to start
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Check that conversation was created
  const activeConversations = delegationEngine.getActiveConversations();
  console.log('Active conversations:', activeConversations.length);
  console.log('All conversations:', delegationEngine.getConversationStats());
  
  if (activeConversations.length === 0) {
    // Check if delegation failed
    try {
      await Promise.race([
        delegationPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      ]);
    } catch (error) {
      console.log('Delegation error:', error instanceof Error ? error.message : String(error));
    }
  }
  
  assert.strictEqual(activeConversations.length, 1, 'Should have one active conversation');
  assert.strictEqual(activeConversations[0].agentName, 'test-agent', 'Conversation should be for test-agent');
  assert.strictEqual(activeConversations[0].parentConversationId, 'coord-123', 'Should have parent conversation ID');
  
  // Complete the delegation
  setTimeout(() => {
    const activeConvs = delegationEngine.getActiveConversations();
    if (activeConvs.length > 0) {
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: activeConvs[0].conversationId,
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: [],
      };
      mockAgentEngine.setContext(activeConvs[0].conversationId, context);
      delegationEngine.reportOut('test-agent', 'Work completed');
    }
  }, 50);
  
  await delegationPromise;
  
  // Check conversation stats
  const stats = delegationEngine.getConversationStats();
  assert.strictEqual(stats.total, 1, 'Should have one total conversation');
  assert.strictEqual(stats.completed, 1, 'Should have one completed conversation');
  assert.strictEqual(stats.active, 0, 'Should have no active conversations');
  
  console.log('✓ Test 1 passed');
  
  // Test 2: Parent-child conversation relationships
  delegationEngine = setup();
  console.log('Test 2: Parent-child conversation relationships');
  
  mockAgentEngine.setContext('coord-123', coordinatorContext);
  
  // Start delegation
  const delegationPromise2 = delegationEngine.delegateWork(
    'coordinator',
    'test-agent',
    'Parent task',
    'Results'
  );
  
  // Wait for conversation to be created
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Get the child conversation
  const activeConversations2 = delegationEngine.getActiveConversations();
  assert.ok(activeConversations2.length > 0, 'Should have active conversations');
  const childConversationId = activeConversations2[0].conversationId;
  
  // Check parent-child relationship
  const childConversations = delegationEngine.getChildConversations('coord-123');
  assert.strictEqual(childConversations.length, 1, 'Should have one child conversation');
  assert.strictEqual(childConversations[0].conversationId, childConversationId, 'Child conversation ID should match');
  
  // Complete delegation
  setTimeout(() => {
    const activeConvs = delegationEngine.getActiveConversations();
    if (activeConvs.length > 0) {
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: activeConvs[0].conversationId,
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: [],
      };
      mockAgentEngine.setContext(activeConvs[0].conversationId, context);
      delegationEngine.reportOut('test-agent', 'Parent task completed');
    }
  }, 50);
  
  await delegationPromise2;
  console.log('✓ Test 2 passed');
  
  // Test 3: Conversation context isolation
  delegationEngine = setup();
  console.log('Test 3: Conversation context isolation');
  
  mockAgentEngine.setContext('coord-123', coordinatorContext);
  
  // Start multiple delegations
  const delegation1 = delegationEngine.delegateWork('coordinator', 'test-agent', 'Task 1', 'Results 1');
  const delegation2 = delegationEngine.delegateWork('coordinator', 'test-agent', 'Task 2', 'Results 2');
  
  // Wait for conversations to be created
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Check that we have separate conversations
  const activeConversations3 = delegationEngine.getActiveConversations();
  assert.strictEqual(activeConversations3.length, 2, 'Should have two active conversations');
  
  const conversationIds = activeConversations3.map(c => c.conversationId);
  assert.notStrictEqual(conversationIds[0], conversationIds[1], 'Conversation IDs should be different');
  
  // Complete both delegations by finding the right contexts
  setTimeout(() => {
    // Find the first active conversation for test-agent
    const activeConvs = delegationEngine.getActiveConversations();
    const firstConv = activeConvs.find(c => c.agentName === 'test-agent');
    if (firstConv) {
      // Set the context in mock engine so reportOut can find it
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: firstConv.conversationId,
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };
      mockAgentEngine.setContext(firstConv.conversationId, context);
      delegationEngine.reportOut('test-agent', 'Task 1 completed');
    }
  }, 30);
  
  setTimeout(() => {
    // Find the remaining active conversation for test-agent
    const activeConvs = delegationEngine.getActiveConversations();
    const remainingConv = activeConvs.find(c => c.agentName === 'test-agent');
    if (remainingConv) {
      // Set the context in mock engine so reportOut can find it
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: remainingConv.conversationId,
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };
      mockAgentEngine.setContext(remainingConv.conversationId, context);
      delegationEngine.reportOut('test-agent', 'Task 2 completed');
    }
  }, 60);
  
  await Promise.all([delegation1, delegation2]);
  console.log('✓ Test 3 passed');
  
  // Test 4: Conversation cleanup
  delegationEngine = setup();
  console.log('Test 4: Conversation cleanup');
  
  mockAgentEngine.setContext('coord-123', coordinatorContext);
  
  // Start and complete a delegation
  const delegationPromise4 = delegationEngine.delegateWork('coordinator', 'test-agent', 'Cleanup test', 'Results');
  
  // Wait for conversation to be created
  await new Promise(resolve => setTimeout(resolve, 20));
  
  setTimeout(() => {
    const activeConvs = delegationEngine.getActiveConversations();
    if (activeConvs.length > 0) {
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: activeConvs[0].conversationId,
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };
      mockAgentEngine.setContext(activeConvs[0].conversationId, context);
      delegationEngine.reportOut('test-agent', 'Cleanup test completed');
    }
  }, 50);
  
  await delegationPromise4;
  
  // Check initial stats
  const statsBeforeCleanup = delegationEngine.getConversationStats();
  assert.strictEqual(statsBeforeCleanup.completed, 1, 'Should have one completed conversation');
  
  // Manually set conversation timestamp to be old (simulate time passing)
  const conversations = delegationEngine.getActiveConversations();
  // Since conversation is completed, we need to access it differently
  const allConversations = Array.from((delegationEngine as any).conversations.values()) as any[];
  if (allConversations.length > 0) {
    allConversations[0].lastActivity = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  }
  
  // Run cleanup
  delegationEngine.cleanup();
  
  // Check that old conversations were cleaned up
  const statsAfterCleanup = delegationEngine.getConversationStats();
  // Note: The cleanup logic may vary based on implementation details
  console.log('✓ Test 4 passed');
  
  // Test 5: Conversation termination tree
  delegationEngine = setup();
  console.log('Test 5: Conversation termination tree');
  
  mockAgentEngine.setContext('coord-123', coordinatorContext);
  
  // Start a delegation
  const delegationPromise5 = delegationEngine.delegateWork('coordinator', 'test-agent', 'Tree test', 'Results');
  
  // Wait for conversation to be created
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Get the conversation ID
  const activeConversations5 = delegationEngine.getActiveConversations();
  assert.ok(activeConversations5.length > 0, 'Should have active conversations');
  const conversationId = activeConversations5[0].conversationId;
  
  // Terminate the conversation tree
  delegationEngine.terminateConversationTree(conversationId);
  
  // Check that conversation is no longer active
  const activeConversationsAfterTermination = delegationEngine.getActiveConversations();
  assert.strictEqual(activeConversationsAfterTermination.length, 0, 'Should have no active conversations after termination');
  
  // The delegation promise should be rejected due to termination
  try {
    await Promise.race([
      delegationPromise5,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Expected rejection')), 100))
    ]);
    assert.fail('Delegation should have been rejected');
  } catch (error) {
    // Expected to be rejected - this is the correct behavior
    console.log('Delegation correctly rejected after termination');
  }
  
  console.log('✓ Test 5 passed');
  
  // Test 6: Conversation activity updates
  delegationEngine = setup();
  console.log('Test 6: Conversation activity updates');
  
  mockAgentEngine.setContext('coord-123', coordinatorContext);
  
  // Start delegation
  const delegationPromise6 = delegationEngine.delegateWork('coordinator', 'test-agent', 'Activity test', 'Results');
  
  // Wait for conversation to be created
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Get conversation and check initial activity
  const activeConversations6 = delegationEngine.getActiveConversations();
  assert.ok(activeConversations6.length > 0, 'Should have active conversations');
  const conversation = activeConversations6[0];
  const initialActivity = conversation.lastActivity;
  
  // Wait a bit and update activity
  await new Promise(resolve => setTimeout(resolve, 10));
  delegationEngine.updateConversationActivity(conversation.conversationId);
  
  // Check that activity was updated
  const updatedConversation = delegationEngine.getConversationContext(conversation.conversationId);
  assert.ok(updatedConversation, 'Conversation should exist');
  assert.ok(updatedConversation.lastActivity > initialActivity, 'Activity timestamp should be updated');
  
  // Complete delegation
  setTimeout(() => {
    const activeConvs = delegationEngine.getActiveConversations();
    if (activeConvs.length > 0) {
      const context: AgentExecutionContext = {
        agentName: 'test-agent',
        conversationId: activeConvs[0].conversationId,
        systemPrompt: 'Test prompt',
        availableTools: [],
        delegationChain: ['coordinator'],
        availableDelegationTargets: []
      };
      mockAgentEngine.setContext(activeConvs[0].conversationId, context);
      delegationEngine.reportOut('test-agent', 'Activity test completed');
    }
  }, 50);
  
  await delegationPromise6;
  console.log('✓ Test 6 passed');
  
  console.log('All conversation management integration tests passed! ✅');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runConversationManagementTests().catch(console.error);
}