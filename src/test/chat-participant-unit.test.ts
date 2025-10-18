/**
 * Unit tests for MultiAgentChatParticipant without VS Code test environment
 */

import * as assert from 'assert';
import { MultiAgentChatParticipant } from '../services/chat-participant';
import { ConfigurationManager } from '../services/configuration-manager';
import { DefaultAgentEngine } from '../services/agent-engine';
import { DefaultToolFilter } from '../services/tool-filter';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { CHAT_PARTICIPANT_ID } from '../constants';

// Simple test without VS Code environment
suite('MultiAgentChatParticipant Unit Tests', () => {
  let chatParticipant: MultiAgentChatParticipant;
  let configManager: ConfigurationManager;
  let agentEngine: DefaultAgentEngine;
  let toolFilter: DefaultToolFilter;
  let delegationEngine: DefaultDelegationEngine;

  setup(() => {
    // Initialize dependencies
    configManager = new ConfigurationManager();
    toolFilter = new DefaultToolFilter(configManager);
    const systemPromptBuilder = new SystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
    delegationEngine = new DefaultDelegationEngine(agentEngine, configManager);
    
    // Create chat participant
    chatParticipant = new MultiAgentChatParticipant(
      configManager,
      agentEngine,
      toolFilter,
      delegationEngine
    );
  });

  teardown(() => {
    if (chatParticipant) {
      chatParticipant.dispose();
    }
    if (configManager) {
      configManager.dispose();
    }
  });

  test('should have correct ID', () => {
    assert.strictEqual(chatParticipant.id, CHAT_PARTICIPANT_ID);
  });

  test('should not be registered initially', () => {
    assert.strictEqual(chatParticipant.isRegistered(), false);
  });

  test('should dispose cleanly', () => {
    assert.doesNotThrow(() => {
      chatParticipant.dispose();
    });
    assert.strictEqual(chatParticipant.isRegistered(), false);
  });

  test('should create with EntryAgentManager integration', () => {
    // Test that the chat participant was created successfully with EntryAgentManager
    assert.ok(chatParticipant, 'Chat participant should be created');
    assert.strictEqual(chatParticipant.id, CHAT_PARTICIPANT_ID);
    
    // Test that it has the expected interface
    assert.ok(typeof chatParticipant.handleRequest === 'function');
    assert.ok(typeof chatParticipant.register === 'function');
    assert.ok(typeof chatParticipant.dispose === 'function');
    assert.ok(typeof chatParticipant.isRegistered === 'function');
  });
});