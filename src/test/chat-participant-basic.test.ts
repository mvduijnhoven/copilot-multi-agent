/**
 * Basic tests for MultiAgentChatParticipant
 */

import * as assert from 'assert';
import { MultiAgentChatParticipant } from '../services/chat-participant';

suite('MultiAgentChatParticipant Basic Tests', () => {
  test('should have correct ID', () => {
    // Create minimal mock dependencies
    const mockConfigManager = {
      loadConfiguration: async () => ({
        coordinator: {
          name: 'coordinator',
          systemPrompt: 'Test',
          description: 'Test',
          useFor: 'Test',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'all' }
        },
        customAgents: []
      }),
      dispose: () => {}
    } as any;

    const mockToolFilter = {
      getAvailableTools: async () => [],
      hasToolAccess: async () => false
    } as any;

    const mockAgentEngine = {
      initializeAgent: async () => ({
        agentName: 'coordinator',
        conversationId: 'test',
        systemPrompt: 'Test',
        availableTools: [],
        delegationChain: []
      }),
      getActiveAgents: () => []
    } as any;

    const mockDelegationEngine = {} as any;

    const chatParticipant = new MultiAgentChatParticipant(
      mockConfigManager,
      mockAgentEngine,
      mockToolFilter,
      mockDelegationEngine
    );

    assert.strictEqual(chatParticipant.id, 'copilot-multi-agent.coordinator');
    assert.strictEqual(chatParticipant.isRegistered(), false);
  });

  test('should dispose cleanly', () => {
    const mockConfigManager = { dispose: () => {} } as any;
    const mockToolFilter = {} as any;
    const mockAgentEngine = {} as any;
    const mockDelegationEngine = {} as any;

    const chatParticipant = new MultiAgentChatParticipant(
      mockConfigManager,
      mockAgentEngine,
      mockToolFilter,
      mockDelegationEngine
    );

    assert.doesNotThrow(() => {
      chatParticipant.dispose();
    });
  });
});