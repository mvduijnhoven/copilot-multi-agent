/**
 * Comprehensive unit tests for SystemPromptBuilder
 * Covers delegation target resolution, prompt formatting, and agent name enumeration
 */

import { strict as assert } from 'assert';
import { SystemPromptBuilder } from '../services/system-prompt-builder';
import { 
  ExtensionConfiguration, 
  AgentConfiguration
} from '../models';
import { DelegationTarget } from '../models/system-prompt-builder';

suite('Comprehensive SystemPromptBuilder Tests', () => {
  let systemPromptBuilder: SystemPromptBuilder;

  const createTestAgent = (
    name: string, 
    useFor: string = `${name} specific tasks`,
    delegationPermissions: any = { type: 'none' },
    overrides: Partial<AgentConfiguration> = {}
  ): AgentConfiguration => ({
    name,
    systemPrompt: `You are ${name} agent with comprehensive capabilities`,
    description: `${name} agent description`,
    useFor,
    delegationPermissions,
    toolPermissions: { type: 'all' },
    ...overrides
  });

  const createTestConfiguration = (agents: AgentConfiguration[]): ExtensionConfiguration => ({
    entryAgent: agents[0]?.name || 'coordinator',
    agents
  });

  setup(() => {
    systemPromptBuilder = new SystemPromptBuilder();
  });

  suite('Delegation Target Resolution', () => {
    test('should return empty array for agent with "none" delegation permissions', () => {
      const agents = [
        createTestAgent('restricted-agent', 'Restricted tasks', { type: 'none' }),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('restricted-agent', config);
      
      assert.deepStrictEqual(targets, []);
    });

    test('should return all other agents for agent with "all" delegation permissions', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination and delegation', { type: 'all' }),
        createTestAgent('code-reviewer', 'Code review and analysis'),
        createTestAgent('test-engineer', 'Testing and QA'),
        createTestAgent('documentation-writer', 'Technical documentation')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', config);
      
      assert.strictEqual(targets.length, 3);
      
      const targetNames = targets.map(t => t.name);
      assert.ok(targetNames.includes('code-reviewer'));
      assert.ok(targetNames.includes('test-engineer'));
      assert.ok(targetNames.includes('documentation-writer'));
      assert.ok(!targetNames.includes('coordinator')); // Should not include self
      
      // Verify useFor descriptions are preserved
      const codeReviewerTarget = targets.find(t => t.name === 'code-reviewer');
      assert.strictEqual(codeReviewerTarget?.useFor, 'Code review and analysis');
    });

    test('should return specific agents for agent with "specific" delegation permissions', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('specialist', 'Specialized tasks', { type: 'specific', agents: ['test-engineer', 'documentation-writer'] }),
        createTestAgent('test-engineer', 'Testing and QA'),
        createTestAgent('documentation-writer', 'Technical documentation'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('specialist', config);
      
      assert.strictEqual(targets.length, 2);
      
      const targetNames = targets.map(t => t.name);
      assert.ok(targetNames.includes('test-engineer'));
      assert.ok(targetNames.includes('documentation-writer'));
      assert.ok(!targetNames.includes('coordinator'));
      assert.ok(!targetNames.includes('other-agent'));
      assert.ok(!targetNames.includes('specialist')); // Should not include self
    });

    test('should handle specific delegation to non-existent agents gracefully', () => {
      const agents = [
        createTestAgent('invalid-delegator', 'Invalid delegation test', { 
          type: 'specific', 
          agents: ['non-existent-agent', 'test-engineer', 'another-non-existent'] 
        }),
        createTestAgent('test-engineer', 'Testing and QA'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('invalid-delegator', config);
      
      assert.strictEqual(targets.length, 1);
      assert.strictEqual(targets[0].name, 'test-engineer');
      assert.strictEqual(targets[0].useFor, 'Testing and QA');
    });

    test('should return empty array for non-existent agent', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('non-existent-agent', config);
      
      assert.deepStrictEqual(targets, []);
    });

    test('should handle empty agents array', () => {
      const config = createTestConfiguration([]);

      const targets = systemPromptBuilder.getDelegationTargets('any-agent', config);
      
      assert.deepStrictEqual(targets, []);
    });

    test('should handle single agent configuration', () => {
      const agents = [
        createTestAgent('only-agent', 'Only agent tasks', { type: 'all' })
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('only-agent', config);
      
      assert.deepStrictEqual(targets, []); // No other agents to delegate to
    });

    test('should preserve order of agents in delegation targets', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('alpha-agent', 'Alpha tasks'),
        createTestAgent('beta-agent', 'Beta tasks'),
        createTestAgent('gamma-agent', 'Gamma tasks')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', config);
      
      assert.strictEqual(targets.length, 3);
      assert.strictEqual(targets[0].name, 'alpha-agent');
      assert.strictEqual(targets[1].name, 'beta-agent');
      assert.strictEqual(targets[2].name, 'gamma-agent');
    });
  });

  suite('Delegation Section Formatting', () => {
    test('should return empty string for empty targets array', () => {
      const result = systemPromptBuilder.formatDelegationSection([]);
      
      assert.strictEqual(result, '');
    });

    test('should format single delegation target correctly', () => {
      const targets: DelegationTarget[] = [
        { name: 'test-engineer', useFor: 'Unit testing and integration testing' }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **test-engineer**: Unit testing and integration testing'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: test-engineer'));
    });

    test('should format multiple delegation targets correctly', () => {
      const targets: DelegationTarget[] = [
        { name: 'code-reviewer', useFor: 'Code review and security analysis' },
        { name: 'test-engineer', useFor: 'Testing and quality assurance' },
        { name: 'documentation-writer', useFor: 'Technical documentation and API docs' }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **code-reviewer**: Code review and security analysis'));
      assert.ok(result.includes('- **test-engineer**: Testing and quality assurance'));
      assert.ok(result.includes('- **documentation-writer**: Technical documentation and API docs'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: code-reviewer, test-engineer, documentation-writer'));
    });

    test('should handle targets with special characters in names and descriptions', () => {
      const targets: DelegationTarget[] = [
        { name: 'agent-with-hyphens', useFor: 'Tasks with special chars: @#$%' },
        { name: 'agent_with_underscores', useFor: 'Unicode tasks: 🤖 ñáéíóú' },
        { name: 'агент', useFor: 'Cyrillic agent tasks' }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes('- **agent-with-hyphens**: Tasks with special chars: @#$%'));
      assert.ok(result.includes('- **agent_with_underscores**: Unicode tasks: 🤖 ñáéíóú'));
      assert.ok(result.includes('- **агент**: Cyrillic agent tasks'));
      assert.ok(result.includes('agent-with-hyphens, agent_with_underscores, агент'));
    });

    test('should handle very long agent names and descriptions', () => {
      const longName = 'a'.repeat(100);
      const longDescription = 'b'.repeat(500);
      
      const targets: DelegationTarget[] = [
        { name: longName, useFor: longDescription }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes(`- **${longName}**: ${longDescription}`));
      assert.ok(result.includes(`When using the delegateWork tool, use one of these agent names: ${longName}`));
    });

    test('should handle empty useFor descriptions', () => {
      const targets: DelegationTarget[] = [
        { name: 'empty-description-agent', useFor: '' },
        { name: 'normal-agent', useFor: 'Normal tasks' }
      ];

      const result = systemPromptBuilder.formatDelegationSection(targets);
      
      assert.ok(result.includes('- **empty-description-agent**: '));
      assert.ok(result.includes('- **normal-agent**: Normal tasks'));
      assert.ok(result.includes('empty-description-agent, normal-agent'));
    });
  });

  suite('System Prompt Building', () => {
    test('should return base prompt unchanged for agent with no delegation permissions', () => {
      const agents = [
        createTestAgent('restricted-agent', 'Restricted tasks', { type: 'none' }),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);
      
      const basePrompt = 'You are a restricted agent with no delegation capabilities.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'restricted-agent', config);
      
      assert.strictEqual(result, basePrompt);
    });

    test('should extend prompt with delegation information for agent with "all" permissions', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination and delegation', { type: 'all' }),
        createTestAgent('code-reviewer', 'Code review and security analysis'),
        createTestAgent('test-engineer', 'Unit testing and integration testing'),
        createTestAgent('documentation-writer', 'Technical documentation and API docs')
      ];
      const config = createTestConfiguration(agents);
      
      const basePrompt = 'You are a coordinator agent responsible for task orchestration.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'coordinator', config);
      
      assert.ok(result.includes(basePrompt));
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **code-reviewer**: Code review and security analysis'));
      assert.ok(result.includes('- **test-engineer**: Unit testing and integration testing'));
      assert.ok(result.includes('- **documentation-writer**: Technical documentation and API docs'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: code-reviewer, test-engineer, documentation-writer'));
    });

    test('should extend prompt with specific delegation targets', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('specialist', 'Specialized tasks', { type: 'specific', agents: ['test-engineer'] }),
        createTestAgent('test-engineer', 'Unit testing and integration testing'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);
      
      const basePrompt = 'You are a specialist agent with limited delegation capabilities.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'specialist', config);
      
      assert.ok(result.includes(basePrompt));
      assert.ok(result.includes('## Available Agents for Delegation'));
      assert.ok(result.includes('- **test-engineer**: Unit testing and integration testing'));
      assert.ok(result.includes('When using the delegateWork tool, use one of these agent names: test-engineer'));
      assert.ok(!result.includes('other-agent')); // Should not include non-allowed agents
    });

    test('should handle non-existent agent gracefully', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);
      
      const basePrompt = 'You are a non-existent agent.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'non-existent-agent', config);
      
      assert.strictEqual(result, basePrompt);
    });

    test('should handle empty configuration gracefully', () => {
      const config = createTestConfiguration([]);
      
      const basePrompt = 'You are an agent in an empty configuration.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'any-agent', config);
      
      assert.strictEqual(result, basePrompt);
    });

    test('should preserve original prompt formatting and structure', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);
      
      const basePrompt = `You are a coordinator agent.

## Your Responsibilities
- Task coordination
- Work delegation
- Progress monitoring

## Guidelines
1. Always validate requests
2. Provide clear instructions
3. Monitor progress`;
      
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'coordinator', config);
      
      assert.ok(result.includes('You are a coordinator agent.'));
      assert.ok(result.includes('## Your Responsibilities'));
      assert.ok(result.includes('## Guidelines'));
      assert.ok(result.includes('## Available Agents for Delegation'));
    });

    test('should handle malformed delegation permissions gracefully', () => {
      const agents = [
        createTestAgent('malformed-agent', 'Malformed test', { type: 'invalid-type' } as any),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);
      
      const basePrompt = 'You are an agent with malformed permissions.';
      const result = systemPromptBuilder.buildSystemPrompt(basePrompt, 'malformed-agent', config);
      
      assert.strictEqual(result, basePrompt); // Should not extend prompt for invalid permissions
    });
  });

  suite('Agent Name Enumeration', () => {
    test('should return empty array for agent with no delegation permissions', () => {
      const agents = [
        createTestAgent('restricted-agent', 'Restricted tasks', { type: 'none' }),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('restricted-agent', config);
      
      assert.deepStrictEqual(agentNames, []);
    });

    test('should return all other agent names for agent with "all" delegation permissions', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('code-reviewer', 'Code review'),
        createTestAgent('test-engineer', 'Testing'),
        createTestAgent('documentation-writer', 'Documentation')
      ];
      const config = createTestConfiguration(agents);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('coordinator', config);
      
      assert.strictEqual(agentNames.length, 3);
      assert.ok(agentNames.includes('code-reviewer'));
      assert.ok(agentNames.includes('test-engineer'));
      assert.ok(agentNames.includes('documentation-writer'));
      assert.ok(!agentNames.includes('coordinator')); // Should not include self
    });

    test('should return specific agent names for agent with "specific" delegation permissions', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('specialist', 'Specialized tasks', { type: 'specific', agents: ['test-engineer', 'documentation-writer'] }),
        createTestAgent('test-engineer', 'Testing'),
        createTestAgent('documentation-writer', 'Documentation'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('specialist', config);
      
      assert.strictEqual(agentNames.length, 2);
      assert.ok(agentNames.includes('test-engineer'));
      assert.ok(agentNames.includes('documentation-writer'));
      assert.ok(!agentNames.includes('coordinator'));
      assert.ok(!agentNames.includes('other-agent'));
      assert.ok(!agentNames.includes('specialist')); // Should not include self
    });

    test('should return empty array for non-existent agent', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('non-existent-agent', config);
      
      assert.deepStrictEqual(agentNames, []);
    });

    test('should handle specific delegation with non-existent agents', () => {
      const agents = [
        createTestAgent('specialist', 'Specialized tasks', { 
          type: 'specific', 
          agents: ['non-existent-1', 'test-engineer', 'non-existent-2'] 
        }),
        createTestAgent('test-engineer', 'Testing'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('specialist', config);
      
      assert.strictEqual(agentNames.length, 1);
      assert.deepStrictEqual(agentNames, ['test-engineer']);
    });

    test('should preserve order of agent names', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('zebra-agent', 'Zebra tasks'),
        createTestAgent('alpha-agent', 'Alpha tasks'),
        createTestAgent('beta-agent', 'Beta tasks')
      ];
      const config = createTestConfiguration(agents);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('coordinator', config);
      
      assert.strictEqual(agentNames.length, 3);
      assert.deepStrictEqual(agentNames, ['zebra-agent', 'alpha-agent', 'beta-agent']);
    });
  });

  suite('Edge Cases and Error Handling', () => {
    test('should handle null configuration gracefully', () => {
      const targets = systemPromptBuilder.getDelegationTargets('any-agent', null as any);
      assert.deepStrictEqual(targets, []);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('any-agent', null as any);
      assert.deepStrictEqual(agentNames, []);

      const prompt = systemPromptBuilder.buildSystemPrompt('Base prompt', 'any-agent', null as any);
      assert.strictEqual(prompt, 'Base prompt');
    });

    test('should handle undefined configuration gracefully', () => {
      const targets = systemPromptBuilder.getDelegationTargets('any-agent', undefined as any);
      assert.deepStrictEqual(targets, []);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('any-agent', undefined as any);
      assert.deepStrictEqual(agentNames, []);

      const prompt = systemPromptBuilder.buildSystemPrompt('Base prompt', 'any-agent', undefined as any);
      assert.strictEqual(prompt, 'Base prompt');
    });

    test('should handle configuration with null agents array', () => {
      const config = { entryAgent: 'coordinator', agents: null as any };

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', config);
      assert.deepStrictEqual(targets, []);

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('coordinator', config);
      assert.deepStrictEqual(agentNames, []);

      const prompt = systemPromptBuilder.buildSystemPrompt('Base prompt', 'coordinator', config);
      assert.strictEqual(prompt, 'Base prompt');
    });

    test('should handle agents with null or undefined properties', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        { name: 'broken-agent', useFor: null, delegationPermissions: null } as any,
        createTestAgent('normal-agent', 'Normal tasks')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', config);
      
      // Should include normal-agent but handle broken-agent gracefully
      assert.ok(targets.some(t => t.name === 'normal-agent'));
      
      const brokenAgentTarget = targets.find(t => t.name === 'broken-agent');
      if (brokenAgentTarget) {
        // Should handle null useFor gracefully
        assert.ok(brokenAgentTarget.useFor === null || brokenAgentTarget.useFor === '');
      }
    });

    test('should handle circular references in agent configuration', () => {
      const circularAgent: any = createTestAgent('circular-agent', 'Circular tasks', { type: 'all' });
      circularAgent.self = circularAgent; // Create circular reference
      
      const agents = [circularAgent, createTestAgent('normal-agent', 'Normal tasks')];
      const config = createTestConfiguration(agents);

      // Should handle gracefully without infinite loops
      const targets = systemPromptBuilder.getDelegationTargets('circular-agent', config);
      assert.ok(targets.some(t => t.name === 'normal-agent'));

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('circular-agent', config);
      assert.ok(agentNames.includes('normal-agent'));

      const prompt = systemPromptBuilder.buildSystemPrompt('Base prompt', 'circular-agent', config);
      assert.ok(prompt.includes('Base prompt'));
    });

    test('should handle very large configurations', () => {
      const manyAgents = Array.from({ length: 100 }, (_, i) => 
        createTestAgent(`agent-${i}`, `Agent ${i} tasks`)
      );
      manyAgents[0].delegationPermissions = { type: 'all' };
      
      const config = createTestConfiguration(manyAgents);

      const targets = systemPromptBuilder.getDelegationTargets('agent-0', config);
      assert.strictEqual(targets.length, 99); // All except self

      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('agent-0', config);
      assert.strictEqual(agentNames.length, 99);

      const prompt = systemPromptBuilder.buildSystemPrompt('Base prompt', 'agent-0', config);
      assert.ok(prompt.includes('Base prompt'));
      assert.ok(prompt.includes('## Available Agents for Delegation'));
    });

    test('should handle empty and whitespace-only strings', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('', ''), // Empty name and useFor
        createTestAgent('   ', '   '), // Whitespace-only name and useFor
        createTestAgent('normal-agent', 'Normal tasks')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', config);
      
      // Should handle empty/whitespace names gracefully
      assert.ok(targets.some(t => t.name === 'normal-agent'));
      
      const prompt = systemPromptBuilder.buildSystemPrompt('Base prompt', 'coordinator', config);
      assert.ok(prompt.includes('Base prompt'));
    });
  });

  suite('Integration with DelegateWork Tool', () => {
    test('should provide enumerated agent names that match delegation targets', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('code-reviewer', 'Code review'),
        createTestAgent('test-engineer', 'Testing'),
        createTestAgent('documentation-writer', 'Documentation')
      ];
      const config = createTestConfiguration(agents);

      const targets = systemPromptBuilder.getDelegationTargets('coordinator', config);
      const agentNames = systemPromptBuilder.getEnumeratedAgentNames('coordinator', config);
      
      // Agent names should match target names
      assert.strictEqual(targets.length, agentNames.length);
      targets.forEach(target => {
        assert.ok(agentNames.includes(target.name));
      });
    });

    test('should provide consistent results across multiple calls', () => {
      const agents = [
        createTestAgent('coordinator', 'Coordination', { type: 'all' }),
        createTestAgent('test-agent', 'Testing')
      ];
      const config = createTestConfiguration(agents);

      // Call multiple times
      const targets1 = systemPromptBuilder.getDelegationTargets('coordinator', config);
      const targets2 = systemPromptBuilder.getDelegationTargets('coordinator', config);
      const agentNames1 = systemPromptBuilder.getEnumeratedAgentNames('coordinator', config);
      const agentNames2 = systemPromptBuilder.getEnumeratedAgentNames('coordinator', config);

      assert.deepStrictEqual(targets1, targets2);
      assert.deepStrictEqual(agentNames1, agentNames2);
    });

    test('should handle delegation permissions changes correctly', () => {
      const agents = [
        createTestAgent('dynamic-agent', 'Dynamic tasks', { type: 'specific', agents: ['test-agent'] }),
        createTestAgent('test-agent', 'Testing'),
        createTestAgent('other-agent', 'Other tasks')
      ];
      const config = createTestConfiguration(agents);

      // Initial state - specific permissions
      let targets = systemPromptBuilder.getDelegationTargets('dynamic-agent', config);
      assert.strictEqual(targets.length, 1);
      assert.strictEqual(targets[0].name, 'test-agent');

      // Change to all permissions
      agents[0].delegationPermissions = { type: 'all' };
      targets = systemPromptBuilder.getDelegationTargets('dynamic-agent', config);
      assert.strictEqual(targets.length, 2);
      assert.ok(targets.some(t => t.name === 'test-agent'));
      assert.ok(targets.some(t => t.name === 'other-agent'));

      // Change to none permissions
      agents[0].delegationPermissions = { type: 'none' };
      targets = systemPromptBuilder.getDelegationTargets('dynamic-agent', config);
      assert.strictEqual(targets.length, 0);
    });
  });
});