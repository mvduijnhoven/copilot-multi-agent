/**
 * Unit tests for SystemPromptBuilder
 */

import * as assert from 'assert';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { 
  ExtensionConfiguration, 
  AgentConfiguration, 
  DEFAULT_EXTENSION_CONFIG,
  DEFAULT_COORDINATOR_CONFIG
} from '../models';
import { DelegationTarget } from '../models/system-prompt-builder';

suite('SystemPromptBuilder', () => {
  let systemPromptBuilder: SystemPromptBuilder;
  let testConfiguration: ExtensionConfiguration;

  setup(() => {
    systemPromptBuilder = new SystemPromptBuilder();
    
    // Create test configuration with coordinator and custom agents
    testConfiguration = {
      entryAgent: 'coordinator',
      agents: [
        {
          ...DEFAULT_COORDINATOR_CONFIG,
          delegationPermissions: { type: 'all' }
        },
        {
          name: 'code-reviewer',
          systemPrompt: 'You are a code review specialist.',
          description: 'Specialized in code review and quality analysis',
          useFor: 'Code review, security analysis, best practices',
          delegationPermissions: { type: 'specific', agents: ['test-engineer'] },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        },
        {
          name: 'test-engineer',
          systemPrompt: 'You are a testing specialist.',
          description: 'Specialized in testing and quality assurance',
          useFor: 'Unit testing, integration testing, test automation',
          delegationPermissions: { type: 'none' },
          toolPermissions: { type: 'specific', tools: ['reportOut'] }
        },
        {
          name: 'documentation-writer',
          systemPrompt: 'You are a documentation specialist.',
          description: 'Specialized in technical documentation',
          useFor: 'Technical documentation, API docs, user guides',
          delegationPermissions: { type: 'all' },
          toolPermissions: { type: 'specific', tools: ['delegateWork', 'reportOut'] }
        }
      ]
    };
  });

  suite('getDelegationTargets', () => {
    test('should return empty array for agent with "none" delegation permissions', () => {
      const targets = systemPromptBuilder.getDelegationTargets('test-engineer', testConfiguration);
      assert.deepStrictEqual(targets, []);
    });

    test('should return all other agents for agent with "all" delegation permissions', () => {
      const targets = systemPromptBuilder.getDelegationTargets('coordinator', testConfiguration);
      
      assert.strictEqual(targets.length, 3);
      
      const targetNames = targets.map(t => t.name);
      assert.ok(targetNames.includes('code-reviewer'));
      assert.ok(targetNames.includes('test-engineer'));
      assert.ok(targetNames.includes('documentation-writer'));
      
      const codeReviewerTarget = targets.find(t => t.name === 'code-reviewer');
      assert.strictEqual(codeReviewerTarget?.useFor, 'Code review, security analysis, best practices');
    });

    test('should return specific agents for agent with "specific" delegation permissions', () => {
      const targets = systemPromptBuilder.getDelegationTargets('code-reviewer', testConfiguration);
      
      assert.strictEqual(targets.length, 1);
      assert.strictEqual(targets[0].name, 'test-engineer');
      assert.strictEqual(targets[0].useFor, 'Unit testing, integration testing, test automation');
    });

    test('should return all other agents for custom agent with "all" delegation permissions', () => {
      const targets = systemPromptBuilder.getDelegationTargets('documentation-writer', testConfiguration);
      
      assert.strictEqual(targets.length, 3);
      
      const targetNames = targets.map(t => t.name);
      assert.ok(targetNames.includes('coordinator'));
      assert.ok(targetNames.includes('code-reviewer'));
      assert.ok(targetNames.includes('test-engineer'));
    });

    test('should return empty array for non-existent agent', () => {
      const targets = systemPromptBuilder.getDelegationTargets('non-existent', testConfiguration);
      assert.deepStrictEqual(targets, []);
    });

    test('should handle specific delegation to non-existent agents gracefully', () => {
      const configWithInvalidRef: ExtensionConfiguration = {
        ...testConfiguration,
        agents: [
          {
            name: 'invalid-delegator',
            systemPrompt: 'Test agent',
            description: 'Test description',
            useFor: 'Testing',
            delegationPermissions: { type: 'specific', agents: ['non-existent-agent', 'test-engineer'] },
            toolPermissions: { type: 'none' }
          },
          ...testConfiguration.agents
        ]
      };

      const targets = systemPromptBuilder.getDelegationTargets('invalid-delegator', configWithInvalidRef);
      
      assert.strictEqual(targets.length, 1);
      assert.strictEqual(targets[0].name, 'test-engineer');
      assert.strictEqual(targets[0].useFor, 'Unit testing, integration testing, test automation');
    });
  });

  suite('formatDelegationSection', () => {
    test('should return empty string for empty targets array', () => {
      const result = systemPromptBuilder.formatDelegationSection([]);
      assert.strictEqual(result, '');
    });

    test('should format single delegation target correctly', () => {
      const targets: DelegationTarget[] = [
        { name: 'test-engineer', useFor: 'Unit testing, integration testing' }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **test-engineer**: Unit testing, integration testing'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: test-engineer'));
    });

    test('should format multiple delegation targets correctly', () => {
      const targets: DelegationTarget[] = [
        { name: 'code-reviewer', useFor: 'Code review and analysis' },
        { name: 'test-engineer', useFor: 'Testing and QA' },
        { name: 'documentation-writer', useFor: 'Technical documentation' }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **code-reviewer**: Code review and analysis'));
      assert.ok(result.includes('- **test-engineer**: Testing and QA'));
      assert.ok(result.includes('- **documentation-writer**: Technical documentation'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: code-reviewer, test-engineer, documentation-writer'));
    });
  });

  suite('buildSystemPrompt', () => {
    test('should return base prompt unchanged for agent with no delegation permissions', () => {
      const basePrompt = 'You are a testing specialist.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'test-engineer', testConfiguration);
      
      assert.strictEqual(result, basePrompt);
    });

    test('should extend prompt with delegation information for agent with delegation permissions', () => {
      const basePrompt = 'You are a coordinator agent.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'coordinator', testConfiguration);
      
      assert.ok(result.includes(basePrompt));
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **code-reviewer**: Code review, security analysis, best practices'));
      assert.ok(result.includes('- **test-engineer**: Unit testing, integration testing, test automation'));
      assert.ok(result.includes('- **documentation-writer**: Technical documentation, API docs, user guides'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: code-reviewer, test-engineer, documentation-writer'));
    });

    test('should extend prompt with specific delegation targets', () => {
      const basePrompt = 'You are a code review specialist.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'code-reviewer', testConfiguration);
      
      assert.ok(result.includes(basePrompt));
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **test-engineer**: Unit testing, integration testing, test automation'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: test-engineer'));
    });

    test('should handle non-existent agent gracefully', () => {
      const basePrompt = 'You are a test agent.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'non-existent', testConfiguration);
      
      assert.strictEqual(result, basePrompt);
    });
  });

  suite('getEnumeratedAgentNames', () => {
    test('should return empty array for agent with no delegation permissions', () => {
      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('test-engineer', testConfiguration);
      assert.deepStrictEqual(agentNames, []);
    });

    test('should return all other agent names for agent with "all" delegation permissions', () => {
      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('coordinator', testConfiguration);
      
      assert.strictEqual(agentNames.length, 3);
      assert.ok(agentNames.includes('code-reviewer'));
      assert.ok(agentNames.includes('test-engineer'));
      assert.ok(agentNames.includes('documentation-writer'));
    });

    test('should return specific agent names for agent with "specific" delegation permissions', () => {
      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('code-reviewer', testConfiguration);
      
      assert.strictEqual(agentNames.length, 1);
      assert.ok(agentNames.includes('test-engineer'));
    });

    test('should return empty array for non-existent agent', () => {
      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('non-existent', testConfiguration);
      assert.deepStrictEqual(agentNames, []);
    });
  });

  suite('edge cases and error handling', () => {
    test('should handle empty configuration gracefully', () => {
      const emptyConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [DEFAULT_COORDINATOR_CONFIG]
      };

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', emptyConfig);
      assert.deepStrictEqual(targets, []);
    });

    test('should handle configuration with only coordinator', () => {
      const coordinatorOnlyConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          {
            ...DEFAULT_COORDINATOR_CONFIG,
            delegationPermissions: { type: 'all' }
          }
        ]
      };

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', coordinatorOnlyConfig);
      assert.deepStrictEqual(targets, []);
    });

    test('should not include self in delegation targets', () => {
      const targets = systemPromptBuilder.getDelegationTargets('code-reviewer', testConfiguration);
      
      const includesSelf = targets.some(target => target.name === 'code-reviewer');
      assert.strictEqual(includesSelf, false);
    });

    test('should handle malformed delegation permissions gracefully', () => {
      const malformedConfig: ExtensionConfiguration = {
        entryAgent: 'coordinator',
        agents: [
          DEFAULT_COORDINATOR_CONFIG,
          {
            name: 'malformed-agent',
            systemPrompt: 'Test',
            description: 'Test',
            useFor: 'Test',
            delegationPermissions: { type: 'invalid' as any },
            toolPermissions: { type: 'none' }
          }
        ]
      };

      const targets = systemPromptBuilder.getDelegationTargets('malformed-agent', malformedConfig);
      assert.deepStrictEqual(targets, []);
    });
  });
});