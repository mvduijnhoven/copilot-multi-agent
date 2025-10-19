# Copilot Multi-Agent Troubleshooting Guide

This guide provides detailed troubleshooting steps for common issues with the Copilot Multi-Agent extension.

## Table of Contents

- [Installation and Setup Issues](#installation-and-setup-issues)
- [Configuration Problems](#configuration-problems)
- [Entry Agent Issues](#entry-agent-issues)
- [Delegation Problems](#delegation-problems)
- [Tool Access Issues](#tool-access-issues)
- [Performance Issues](#performance-issues)
- [Error Messages](#error-messages)
- [Advanced Debugging](#advanced-debugging)

## Installation and Setup Issues

### Extension Not Loading

**Symptoms:**
- Multi-agent chat participant doesn't appear in Copilot Chat
- No `@multi-agent` option available
- Extension appears installed but not functional

**Diagnostic Steps:**
1. Check VS Code version: Requires 1.105.0 or higher
2. Verify GitHub Copilot Chat extension is installed and active
3. Check extension status in Extensions panel
4. Look for error messages in Output panel

**Solutions:**
1. **Update VS Code**: Ensure you're running version 1.105.0 or higher
2. **Install GitHub Copilot Chat**: This extension is required as a dependency
3. **Reload VS Code**: Use Cmd/Ctrl + Shift + P → "Developer: Reload Window"
4. **Check Output Panel**: View → Output → Select "Copilot Multi-Agent" from dropdown
5. **Reinstall Extension**: Uninstall and reinstall the Copilot Multi-Agent extension

### GitHub Copilot Chat Integration Issues

**Symptoms:**
- Copilot Chat works but multi-agent doesn't appear
- Error messages about missing chat participant API

**Solutions:**
1. Ensure GitHub Copilot Chat extension is enabled and authenticated
2. Check that you have an active GitHub Copilot subscription
3. Restart VS Code after installing both extensions
4. Verify no conflicting extensions are interfering with chat functionality

## Configuration Problems

### Configuration Validation Errors

**Symptoms:**
- Settings show validation errors
- Agents not appearing or functioning
- Red error indicators in settings UI

**Common Validation Issues:**

#### Invalid Agent Names
```json
// ❌ Invalid - contains spaces and special characters
{
  "name": "My Agent #1"
}

// ✅ Valid - letters, numbers, hyphens, underscores only
{
  "name": "my-agent-1"
}
```

#### Missing Required Fields
```json
// ❌ Invalid - missing required fields
{
  "name": "test-agent"
}

// ✅ Valid - all required fields present
{
  "name": "test-agent",
  "systemPrompt": "You are a test agent...",
  "description": "Test agent for validation",
  "useFor": "Testing and validation tasks",
  "delegationPermissions": {"type": "none"},
  "toolPermissions": {"type": "specific", "tools": ["reportOut"]}
}
```

#### Invalid Permission References
```json
// ❌ Invalid - references non-existent agent
{
  "delegationPermissions": {
    "type": "specific",
    "agents": ["non-existent-agent"]
  }
}

// ✅ Valid - references existing agent
{
  "delegationPermissions": {
    "type": "specific",
    "agents": ["code-reviewer"]
  }
}
```

### Configuration Reset

If your configuration becomes corrupted or you want to start fresh:

1. **Backup Current Configuration** (optional):
   - Go to VS Code Settings
   - Search for "copilotMultiAgent"
   - Copy current JSON configuration

2. **Reset to Defaults**:
   - Delete all `copilotMultiAgent.*` settings
   - Reload VS Code
   - Reconfigure from scratch

3. **Import Working Configuration**:
   - Use one of the example configurations from the `examples/` directory
   - Copy the JSON content into VS Code settings

## Entry Agent Issues

### Entry Agent Not Found

**Symptoms:**
- Warning messages about entry agent not found
- System falls back to first agent
- Unexpected agent handling initial conversations

**Diagnostic Steps:**
1. Check the `copilotMultiAgent.entryAgent` setting value
2. Verify the agent name exists in the `copilotMultiAgent.agents` array
3. Ensure exact name matching (case-sensitive)

**Solutions:**

#### Fix Entry Agent Setting
```json
// Check that entry agent name matches exactly
{
  "copilotMultiAgent.entryAgent": "coordinator",
  "copilotMultiAgent.agents": [
    {
      "name": "coordinator",  // Must match exactly
      // ... other configuration
    }
  ]
}
```

#### Use Automatic Entry Agent
```json
// Remove entry agent setting to use first agent automatically
{
  // "copilotMultiAgent.entryAgent": "coordinator", // Remove this line
  "copilotMultiAgent.agents": [
    {
      "name": "coordinator",  // This will become the entry agent
      // ... other configuration
    }
  ]
}
```

### Entry Agent Permissions Issues

**Symptoms:**
- Entry agent cannot handle basic requests
- Missing tools or delegation capabilities
- Unexpected behavior in initial conversations

**Solutions:**
1. **Ensure Appropriate Tool Permissions**:
   ```json
   {
     "name": "coordinator",
     "toolPermissions": {
       "type": "specific",
       "tools": ["delegateWork", "reportOut", "workspace"]
     }
   }
   ```

2. **Configure Delegation Permissions**:
   ```json
   {
     "name": "coordinator",
     "delegationPermissions": {"type": "all"}
   }
   ```

## Delegation Problems

### Delegation Not Working

**Symptoms:**
- Agents cannot delegate to other agents
- "delegateWork" tool not available
- Delegation attempts fail with errors

**Diagnostic Steps:**
1. Check delegating agent has "delegateWork" in tool permissions
2. Verify target agent exists in delegation permissions
3. Ensure no circular delegation chains
4. Check for proper agent name spelling

**Solutions:**

#### Fix Tool Permissions
```json
{
  "name": "coordinator",
  "toolPermissions": {
    "type": "specific",
    "tools": ["delegateWork", "reportOut"]  // Include delegateWork
  }
}
```

#### Fix Delegation Permissions
```json
// Allow delegation to all agents
{
  "delegationPermissions": {"type": "all"}
}

// Or specify allowed agents
{
  "delegationPermissions": {
    "type": "specific",
    "agents": ["code-reviewer", "test-engineer"]
  }
}
```

### Circular Delegation Detection

**Symptoms:**
- Error messages about circular delegation
- Delegation chains that seem to loop

**Understanding Circular Delegation:**
```
Agent A → Agent B → Agent A  // ❌ Circular delegation
Agent A → Agent B → Agent C  // ✅ Valid delegation chain
```

**Solutions:**
1. **Review Delegation Permissions**: Ensure agents don't create loops
2. **Use Hierarchical Structure**: Design agents with clear delegation hierarchy
3. **Limit Delegation Depth**: Avoid overly complex delegation chains

### Delegation Chain Limits

The system prevents excessively deep delegation chains for performance and clarity:

- **Maximum Depth**: 5 levels of delegation
- **Timeout**: 30 seconds per delegation
- **Memory Limit**: Conversation context is preserved but limited

## Tool Access Issues

### Tools Not Available to Agents

**Symptoms:**
- Agents report they cannot access expected tools
- Missing functionality in agent responses
- Tool permission errors

**Diagnostic Steps:**
1. Check agent's `toolPermissions` configuration
2. Verify tool names are spelled correctly
3. Ensure GitHub Copilot Chat is functioning normally

**Common Tool Permission Configurations:**

#### All Tools Access
```json
{
  "toolPermissions": {"type": "all"}
}
```

#### No Tools Access
```json
{
  "toolPermissions": {"type": "none"}
}
```

#### Specific Tools Access
```json
{
  "toolPermissions": {
    "type": "specific",
    "tools": ["workspace", "reportOut", "delegateWork"]
  }
}
```

### Available Tool Names

Common GitHub Copilot Chat tools that can be specified in permissions:
- `workspace` - File system access
- `reportOut` - Multi-agent reporting (custom tool)
- `delegateWork` - Multi-agent delegation (custom tool)

**Note**: Tool availability depends on your GitHub Copilot Chat version and configuration.

## Performance Issues

### Slow Response Times

**Symptoms:**
- Long delays in agent responses
- Timeouts during delegation
- Poor chat performance

**Diagnostic Steps:**
1. Check network connectivity to GitHub services
2. Monitor VS Code performance and memory usage
3. Review delegation chain complexity
4. Check system prompt lengths

**Solutions:**

#### Optimize Configuration
1. **Simplify System Prompts**: Keep prompts concise but effective
2. **Reduce Delegation Complexity**: Limit delegation chain depth
3. **Use Specific Tool Permissions**: Avoid "all" permissions when possible
4. **Limit Agent Count**: Recommended maximum of 10 agents

#### System Optimization
1. **Restart VS Code**: Clear memory and reset connections
2. **Check Available Memory**: Ensure sufficient system resources
3. **Update Extensions**: Keep all extensions up to date
4. **Network Check**: Verify stable internet connection

### Memory Usage Issues

**Symptoms:**
- VS Code becomes slow or unresponsive
- High memory usage in Task Manager
- Extension crashes or stops responding

**Solutions:**
1. **Reduce Agent Count**: Limit to 5-10 agents for optimal performance
2. **Shorten System Prompts**: Keep prompts under 500 words
3. **Restart VS Code**: Clear accumulated memory usage
4. **Close Unused Conversations**: End long-running chat sessions

## Error Messages

### Common Error Messages and Solutions

#### "Entry agent 'agent-name' not found in configuration"
**Cause**: The specified entry agent doesn't exist in the agents array
**Solution**: Update entry agent setting or add the missing agent

#### "Circular delegation detected"
**Cause**: Delegation chain creates a loop (A → B → A)
**Solution**: Review and fix delegation permissions to avoid loops

#### "Agent 'agent-name' does not have permission to delegate to 'target-agent'"
**Cause**: Delegation permissions don't include the target agent
**Solution**: Update delegation permissions or use a different target agent

#### "Tool 'tool-name' not available to agent 'agent-name'"
**Cause**: Tool permissions don't include the requested tool
**Solution**: Update tool permissions or use available tools

#### "Maximum delegation depth exceeded"
**Cause**: Delegation chain is too deep (>5 levels)
**Solution**: Simplify delegation structure and reduce chain depth

#### "Configuration validation failed"
**Cause**: Invalid configuration format or missing required fields
**Solution**: Review configuration against schema and fix validation errors

## Advanced Debugging

### Enable Debug Logging

1. **Open Output Panel**: View → Output
2. **Select Extension**: Choose "Copilot Multi-Agent" from dropdown
3. **Monitor Logs**: Watch for error messages and warnings during operation

### Configuration Validation

Use this checklist to validate your configuration:

#### Entry Agent Validation
- [ ] Entry agent name is specified
- [ ] Entry agent exists in agents array
- [ ] Entry agent name matches exactly (case-sensitive)

#### Agent Validation
- [ ] All agents have unique names
- [ ] Agent names use only valid characters (letters, numbers, hyphens, underscores)
- [ ] All required fields are present (name, systemPrompt, description, useFor, delegationPermissions, toolPermissions)
- [ ] System prompts are not empty
- [ ] Descriptions and useFor fields are descriptive

#### Permission Validation
- [ ] Delegation permissions reference existing agents (for "specific" type)
- [ ] Tool permissions reference valid tool names (for "specific" type)
- [ ] No circular delegation chains exist
- [ ] Entry agent has appropriate permissions for initial conversations

### Testing Configuration

#### Basic Functionality Test
1. Start a simple conversation with `@multi-agent`
2. Verify entry agent responds appropriately
3. Test basic tool access (if configured)

#### Delegation Test
1. Request a task that should trigger delegation
2. Verify delegation occurs to appropriate agent
3. Check that results are reported back correctly

#### Error Handling Test
1. Try invalid requests to test error handling
2. Verify graceful degradation when agents fail
3. Test configuration changes during runtime

### Performance Monitoring

#### Monitor Resource Usage
1. **Task Manager**: Check VS Code memory and CPU usage
2. **VS Code Performance**: Help → Toggle Developer Tools → Performance tab
3. **Network Activity**: Monitor GitHub API calls and response times

#### Optimize Based on Usage Patterns
1. **Identify Bottlenecks**: Which agents or operations are slowest?
2. **Adjust Configuration**: Optimize based on actual usage patterns
3. **Monitor Improvements**: Track performance after configuration changes

## Getting Help

If you continue to experience issues after following this troubleshooting guide:

### Community Support
- **GitHub Issues**: [Report bugs and request features](https://github.com/mvduijnhoven/copilot-multi-agent/issues)
- **GitHub Discussions**: [Ask questions and share experiences](https://github.com/mvduijnhoven/copilot-multi-agent/discussions)

### Before Reporting Issues
Please include the following information:
1. **VS Code Version**: Help → About
2. **Extension Version**: Check Extensions panel
3. **Configuration**: Sanitized copy of your agent configuration
4. **Error Messages**: Copy from Output panel
5. **Steps to Reproduce**: Detailed steps that trigger the issue
6. **Expected vs Actual Behavior**: What should happen vs what actually happens

### Configuration Sharing
When sharing configurations for troubleshooting:
1. **Remove Sensitive Information**: Don't share personal system prompts or proprietary information
2. **Use Minimal Examples**: Create a minimal configuration that reproduces the issue
3. **Test with Examples**: Try the provided example configurations to isolate the problem