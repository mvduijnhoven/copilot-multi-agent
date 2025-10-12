# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Copilot Multi-Agent extension.

## Quick Diagnostics

### Check Extension Status
1. Open VS Code Command Palette (Cmd/Ctrl + Shift + P)
2. Run "Extensions: Show Installed Extensions"
3. Verify "Copilot Multi-Agent" is installed and enabled
4. Check that "GitHub Copilot Chat" is also installed and enabled

### Check Configuration
1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "Copilot Multi-Agent"
3. Verify configuration is valid (no red error indicators)
4. Check Output panel (View → Output → "Copilot Multi-Agent") for errors

## Common Issues

### 1. Extension Not Loading

**Symptoms:**
- Multi-agent chat participant doesn't appear
- No response when using `@multi-agent`
- Extension appears inactive

**Causes & Solutions:**

#### Missing Dependencies
- **Check**: Ensure GitHub Copilot Chat extension is installed
- **Fix**: Install GitHub Copilot Chat from VS Code Marketplace
- **Verify**: Restart VS Code after installation

#### VS Code Version Compatibility
- **Check**: VS Code version 1.105.0 or higher required
- **Fix**: Update VS Code to latest version
- **Verify**: Help → About to check version

#### Extension Activation Failure
- **Check**: Output panel for activation errors
- **Fix**: Reload VS Code window (Cmd/Ctrl + Shift + P → "Developer: Reload Window")
- **Verify**: Check extension status in Extensions panel

### 2. Configuration Errors

**Symptoms:**
- Red error indicators in settings
- Agents not working as expected
- Validation error messages

**Common Configuration Issues:**

#### Invalid Agent Names
```json
// ❌ Invalid - contains spaces and special characters
"name": "code reviewer!"

// ✅ Valid - letters, numbers, hyphens, underscores only
"name": "code-reviewer"
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
  "systemPrompt": "You are a test specialist...",
  "description": "Specialized in testing",
  "useFor": "Unit and integration testing",
  "delegationPermissions": {"type": "none"},
  "toolPermissions": {"type": "specific", "tools": ["reportOut"]}
}
```

#### Invalid Delegation References
```json
// ❌ Invalid - references non-existent agent
"delegationPermissions": {
  "type": "specific",
  "agents": ["non-existent-agent"]
}

// ✅ Valid - references existing agent
"delegationPermissions": {
  "type": "specific", 
  "agents": ["code-reviewer"]
}
```

#### Duplicate Agent Names
```json
// ❌ Invalid - duplicate names
"customAgents": [
  {"name": "reviewer", ...},
  {"name": "reviewer", ...}  // Duplicate!
]

// ✅ Valid - unique names
"customAgents": [
  {"name": "code-reviewer", ...},
  {"name": "test-reviewer", ...}
]
```

### 3. Delegation Issues

**Symptoms:**
- Agents cannot delegate work
- "Permission denied" errors
- Delegation requests ignored

**Diagnosis & Solutions:**

#### Check Delegation Permissions
```json
// Ensure delegating agent has permission
{
  "name": "coordinator",
  "delegationPermissions": {
    "type": "all"  // or specific agents
  }
}
```

#### Verify Target Agent Exists
- Check that target agent name matches exactly
- Ensure target agent is in customAgents array
- Verify no typos in agent names

#### Check Tool Permissions
```json
// Delegating agent needs delegateWork tool
{
  "toolPermissions": {
    "type": "specific",
    "tools": ["delegateWork", "reportOut"]
  }
}
```

#### Circular Delegation Detection
- The system prevents A → B → A delegation loops
- Check delegation chain for circular references
- Redesign delegation flow to avoid loops

### 4. Tool Access Issues

**Symptoms:**
- Agents cannot access expected tools
- "Tool not available" errors
- Limited functionality

**Solutions:**

#### Check Tool Permissions
```json
// Grant access to specific tools
{
  "toolPermissions": {
    "type": "specific",
    "tools": ["workspace", "reportOut"]
  }
}

// Or grant access to all tools
{
  "toolPermissions": {
    "type": "all"
  }
}
```

#### Verify Tool Names
Common tool names:
- `workspace` - File system access
- `delegateWork` - Task delegation
- `reportOut` - Report results
- GitHub Copilot tools (varies by version)

#### GitHub Copilot Integration
- Ensure GitHub Copilot Chat is working normally
- Test with regular `@copilot` commands first
- Check GitHub Copilot subscription status

### 5. Performance Issues

**Symptoms:**
- Slow response times
- High memory usage
- VS Code becomes unresponsive

**Optimization Strategies:**

#### Reduce Agent Complexity
- Simplify system prompts
- Limit number of custom agents (5-10 recommended)
- Use specific tool permissions instead of "all"

#### Optimize Delegation Chains
- Avoid deep delegation chains (max 2-3 levels)
- Use direct agent calls when possible
- Monitor delegation patterns

#### System Resources
- Close unnecessary VS Code windows
- Restart VS Code periodically
- Check system memory usage

## Advanced Troubleshooting

### Enable Debug Logging

1. Open VS Code Settings
2. Search for "log level"
3. Set "Log Level" to "Debug" or "Trace"
4. Check Output panel for detailed logs

### Reset Configuration

If configuration becomes corrupted:

1. **Backup Current Config**:
   ```json
   // Copy current settings from VS Code Settings UI
   ```

2. **Reset to Defaults**:
   - Delete all `copilotMultiAgent.*` settings
   - Reload VS Code
   - Reconfigure from scratch

3. **Restore from Backup**:
   - Use Settings Sync if enabled
   - Manually restore from backup

### Check Extension Logs

1. Open Command Palette (Cmd/Ctrl + Shift + P)
2. Run "Developer: Show Logs"
3. Select "Extension Host"
4. Look for Copilot Multi-Agent related errors

### Reinstall Extension

If all else fails:

1. Uninstall Copilot Multi-Agent extension
2. Restart VS Code
3. Reinstall from Marketplace
4. Reconfigure settings

## Error Messages

### Common Error Messages and Solutions

#### "Agent not found: [agent-name]"
- **Cause**: Delegation to non-existent agent
- **Fix**: Check agent name spelling and ensure agent exists in configuration

#### "Permission denied for delegation"
- **Cause**: Agent lacks delegation permissions
- **Fix**: Update delegationPermissions for the agent

#### "Tool not available: [tool-name]"
- **Cause**: Agent lacks tool permissions
- **Fix**: Add tool to agent's toolPermissions

#### "Circular delegation detected"
- **Cause**: Delegation loop (A → B → A)
- **Fix**: Redesign delegation flow to avoid loops

#### "Configuration validation failed"
- **Cause**: Invalid configuration format
- **Fix**: Check JSON syntax and required fields

#### "Extension activation failed"
- **Cause**: Missing dependencies or VS Code version
- **Fix**: Update VS Code and install GitHub Copilot Chat

## Getting Help

### Before Reporting Issues

1. **Check this troubleshooting guide**
2. **Verify VS Code and extension versions**
3. **Test with minimal configuration**
4. **Check Output panel for errors**
5. **Try reloading VS Code window**

### Reporting Issues

When reporting issues, include:

1. **VS Code version**: Help → About
2. **Extension version**: Extensions panel
3. **Configuration**: Sanitized copy of your settings
4. **Error messages**: From Output panel
5. **Steps to reproduce**: Detailed reproduction steps
6. **Expected vs actual behavior**

### Support Channels

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/mvduijnhoven/copilot-multi-agent/issues)
- **GitHub Discussions**: [Community support and questions](https://github.com/mvduijnhoven/copilot-multi-agent/discussions)
- **Documentation**: This README and inline help

## Prevention Tips

### Best Practices

1. **Start Simple**: Begin with basic configuration and expand gradually
2. **Test Changes**: Test configuration changes with simple requests
3. **Backup Settings**: Use VS Code Settings Sync or manual backups
4. **Monitor Performance**: Watch for performance degradation
5. **Keep Updated**: Update VS Code and extensions regularly

### Configuration Validation

Always validate configuration changes:

1. Check for red error indicators in settings
2. Test with simple delegation requests
3. Monitor Output panel for warnings
4. Verify agent names and references

### Regular Maintenance

- Review and optimize agent configurations monthly
- Clean up unused agents
- Update system prompts based on usage patterns
- Monitor delegation patterns for efficiency