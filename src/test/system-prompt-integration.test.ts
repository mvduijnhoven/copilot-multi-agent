/**
 * Integration tests for extended system prompt functionality in agent execution
 */

import * as assert from 'assert';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { DefaultAgentEngine } from '../services/agent-engine';
import { DefaultToolFilter } from '../services/tool-filter';
import { ConfigurationManager } from '../services/configuration-manager';
import { DelegateWorkTool } from '../tools/delegate-work-tool';
import { DefaultDelegationEngine } from '../services/delegation-engine';
import { 
  ExtensionConfiguration,
  AgentConfiguration,
  CoordinatorConfiguration,
  DEFAULT_COORDINATOR_CONFIG
} from '../models';

// Mock configuration manager for testing
class MockConfigurationManager {
  private config: ExtensionConfiguration;

  constructor(config?: ExtensionConfiguration) {
    this.config = config || {
      coordinator: DEFAULT_COORDINATOR_CONFIG,
      customAgents: [
        {
          name: 'code-reviewer',
          systemPrompt: 'You are a code review specialist.',
          description: 'Specialized in code review and quality analysis',
          useFor: 'Code review, security analysis, best practices',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        },
        {
          name: 'test-engineer',
          systemPrompt: 'You are a testing specialist.',
          description: 'Specialized in testing and quality assurance',
          useFor: 'Unit testing, integration testing, test automation',
          delegationPermissions: { type: 'specific', agents: ['code-reviewer'] },
          toolPermissions: { type: 'all' }
        }
      ]
    };
  }

  async loadConfiguration(): Promise<ExtensionConfiguration> {
    return this.config;
  }

  async saveConfiguration(config: ExtensionConfiguration): Promise<void> {
    this.config = config;
  }

  validateConfiguration(): boolean {
    return true;
  }

  getDefaultConfiguration(): ExtensionConfiguration {
    return this.config;
  }

  onConfigurationChanged(): void {}
  dispose(): void {}
}

suite('System Prompt Integration Tests', () => {
  let systemPromptBuilder: SystemPromptBuilder;
  let agentEngine: DefaultAgentEngine;
  let toolFilter: DefaultToolFilter;
  let configManager: MockConfigurationManager;
  let delegationEngine: DefaultDelegationEngine;

  setup(() => {
    configManager = new MockConfigurationManager();
    toolFilter = new DefaultToolFilter(configManager as any);
    systemPromptBuilder = new SystemPromptBuilder();
    agentEngine = new DefaultAgentEngine(toolFilter, systemPromptBuilder);
    delegationEngine = new DefaultDelegationEngine(agentEngine, configManager as any);
  });

  test('Agent initialization uses extended system prompt with delegation information', async () => {
    const config = await configManager.loadConfiguration();
    const coordinatorConfig = config.coordinator;

    // Initialize coordinator agent with extension configuration
    const context = await agentEngine.initializeAgent(coordinatorConfig, config);

    // Verify that the system prompt has been extended with delegation information
    assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
    assert.ok(context.systemPrompt.includes('code-reviewer'));
    assert.ok(context.systemPrompt.includes('test-engineer'));
    assert.ok(context.systemPrompt.includes('Code review, security analysis, best practices'));
    assert.ok(context.systemPrompt.includes('Unit testing, integration testing, test automation'));
    assert.ok(context.systemPrompt.includes('When using the delegateWork tool, use one of these agent names: code-reviewer, test-engineer'));
  });

  test('Agent with no delegation permissions has no extended system prompt', async () => {
    const config = await configManager.loadConfiguration();
    const codeReviewerConfig = config.customAgents.find(a => a.name === 'code-reviewer')!;

    // Initialize code reviewer agent (has no delegation permissions)
    const context = await agentEngine.initializeAgent(codeReviewerConfig, config);

    // Verify that the system prompt has NOT been extended
    assert.ok(!context.systemPrompt.includes('## Available Agents for Delegation'));
    assert.strictEqual(context.systemPrompt, codeReviewerConfig.systemPrompt);
  });

  test('Agent with specific delegation permissions has limited delegation information', async () => {
    const config = await configManager.loadConfiguration();
    const testEngineerConfig = config.customAgents.find(a => a.name === 'test-engineer')!;

    // Initialize test engineer agent (can only delegate to code-reviewer)
    const context = await agentEngine.initializeAgent(testEngineerConfig, config);

    // Verify that the system prompt includes only allowed delegation targets
    assert.ok(context.systemPrompt.includes('## Available Agents for Delegation'));
    assert.ok(context.systemPrompt.includes('code-reviewer'));
    assert.ok(!context.systemPrompt.includes('test-engineer')); // Should not include itself
    assert.ok(context.systemPrompt.includes('When using the delegateWork tool, use one of these agent names: code-reviewer'));
  });

  test('Child agent initialization includes extended system prompt', async () => {
    const config = await configManager.loadConfiguration();
    const coordinatorConfig = config.coordinator;
    const codeReviewerConfig = config.customAgents.find(a => a.name === 'code-reviewer')!;

    // Initialize parent coordinator agent
    const parentContext = await agentEngine.initializeAgent(coordinatorConfig, config);

    // Initialize child agent with extension configuration
    const childContext = await (agentEngine as any).initializeChildAgent(
      codeReviewerConfig,
      parentContext,
      config
    );

    // Verify child agent has the correct system prompt (no delegation for code-reviewer)
    assert.strictEqual(childContext.systemPrompt, codeReviewerConfig.systemPrompt);
    assert.ok(!childContext.systemPrompt.includes('## Available Agents for Delegation'));

    // Verify delegation chain is maintained
    assert.deepStrictEqual(childContext.delegationChain, ['coordinator']);
    assert.strictEqual(childContext.parentConversationId, parentContext.conversationId);
  });

  test('DelegateWork tool uses enumerated agent names from SystemPromptBuilder', async () => {
    const config = await configManager.loadConfiguration();
    
    // Create delegateWork tool for coordinator
    const delegateWorkTool = new DelegateWorkTool(
      delegationEngine,
      'coordinator',
      systemPromptBuilder,
      config
    );

    // Get the parameters schema
    const schema = delegateWorkTool.parametersSchema;

    // Verify that agentName property has enum constraint with correct values
    assert.ok(schema.properties.agentName.enum);
    assert.deepStrictEqual(
      schema.properties.agentName.enum.sort(),
      ['code-reviewer', 'test-engineer'].sort()
    );
    assert.ok(schema.properties.agentName.description.includes('code-reviewer, test-engineer'));
  });

  test('DelegateWork tool for agent with specific permissions has limited enum', async () => {
    const config = await configManager.loadConfiguration();
    
    // Create delegateWork tool for test-engineer (can only delegate to code-reviewer)
    const delegateWorkTool = new DelegateWorkTool(
      delegationEngine,
      'test-engineer',
      systemPromptBuilder,
      config
    );

    // Get the parameters schema
    const schema = delegateWorkTool.parametersSchema;

    // Verify that agentName property has enum constraint with only allowed values
    assert.ok(schema.properties.agentName.enum);
    assert.deepStrictEqual(schema.properties.agentName.enum, ['code-reviewer']);
    assert.ok(schema.properties.agentName.description.includes('code-reviewer'));
    assert.ok(!schema.properties.agentName.description.includes('test-engineer'));
  });

  test('DelegateWork tool for agent with no permissions has no enum', async () => {
    const config = await configManager.loadConfiguration();
    
    // Create delegateWork tool for code-reviewer (has no delegation permissions)
    const delegateWorkTool = new DelegateWorkTool(
      delegationEngine,
      'code-reviewer',
      systemPromptBuilder,
      config
    );

    // Get the parameters schema
    const schema = delegateWorkTool.parametersSchema;

    // Verify that agentName property has no enum constraint
    assert.ok(!schema.properties.agentName.enum || schema.properties.agentName.enum.length === 0);
  });

  test('SystemPromptBuilder correctly handles coordinator with all permissions', async () => {
    const config = await configManager.loadConfiguration();
    
    // Test coordinator with 'all' delegation permissions
    const extendedPrompt = systemPromptBuilder.buildSystemPrompt(
      'Base coordinator prompt',
      'coordinator',
      config
    );

    assert.ok(extendedPrompt.includes('Base coordinator prompt'));
    assert.ok(extendedPrompt.includes('## Available Agents for Delegation'));
    assert.ok(extendedPrompt.includes('code-reviewer'));
    assert.ok(extendedPrompt.includes('test-engineer'));
  });

  test('SystemPromptBuilder correctly handles agent with none permissions', async () => {
    const config = await configManager.loadConfiguration();
    
    // Test agent with 'none' delegation permissions
    const extendedPrompt = systemPromptBuilder.buildSystemPrompt(
      'Base agent prompt',
      'code-reviewer',
      config
    );

    // Should return unchanged prompt
    assert.strictEqual(extendedPrompt, 'Base agent prompt');
  });

  test('SystemPromptBuilder correctly handles agent with specific permissions', async () => {
    const config = await configManager.loadConfiguration();
    
    // Test agent with 'specific' delegation permissions
    const extendedPrompt = systemPromptBuilder.buildSystemPrompt(
      'Base test engineer prompt',
      'test-engineer',
      config
    );

    assert.ok(extendedPrompt.includes('Base test engineer prompt'));
    assert.ok(extendedPrompt.includes('## Available Agents for Delegation'));
    assert.ok(extendedPrompt.includes('code-reviewer'));
    assert.ok(!extendedPrompt.includes('test-engineer')); // Should not include itself
    assert.ok(extendedPrompt.includes('When using the delegateWork tool, use one of these agent names: code-reviewer'));
  });

  test('Agent execution context includes available delegation targets', async () => {
    const config = await configManager.loadConfiguration();
    const coordinatorConfig = config.coordinator;

    // Initialize coordinator agent
    const context = await agentEngine.initializeAgent(coordinatorConfig, config);

    // Verify available delegation targets are populated
    assert.ok(Array.isArray(context.availableDelegationTargets));
    assert.strictEqual(context.availableDelegationTargets.length, 2);
    
    const targetNames = context.availableDelegationTargets.map(t => t.name).sort();
    assert.deepStrictEqual(targetNames, ['code-reviewer', 'test-engineer']);
    
    const codeReviewerTarget = context.availableDelegationTargets.find(t => t.name === 'code-reviewer');
    assert.ok(codeReviewerTarget);
    assert.strictEqual(codeReviewerTarget.useFor, 'Code review, security analysis, best practices');
  });

  test('Agent initialization without extension config uses base system prompt', async () => {
    const config = await configManager.loadConfiguration();
    const coordinatorConfig = config.coordinator;

    // Initialize coordinator agent WITHOUT extension configuration
    const context = await agentEngine.initializeAgent(coordinatorConfig);

    // Verify that the system prompt is NOT extended
    assert.strictEqual(context.systemPrompt, coordinatorConfig.systemPrompt);
    assert.ok(!context.systemPrompt.includes('## Available Agents for Delegation'));
    assert.strictEqual(context.availableDelegationTargets.length, 0);
  });

  test('SystemPromptBuilder handles empty custom agents array', async () => {
    const configWithNoCustomAgents: ExtensionConfiguration = {
      coordinator: DEFAULT_COORDINATOR_CONFIG,
      customAgents: []
    };

    const extendedPrompt = systemPromptBuilder.buildSystemPrompt(
      'Base coordinator prompt',
      'coordinator',
      configWithNoCustomAgents
    );

    // Should return unchanged prompt since no agents to delegate to
    assert.strictEqual(extendedPrompt, 'Base coordinator prompt');
  });

  test('SystemPromptBuilder handles non-existent agent gracefully', async () => {
    const config = await configManager.loadConfiguration();
    
    const extendedPrompt = systemPromptBuilder.buildSystemPrompt(
      'Base prompt',
      'non-existent-agent',
      config
    );

    // Should return unchanged prompt for non-existent agent
    assert.strictEqual(extendedPrompt, 'Base prompt');
  });
});