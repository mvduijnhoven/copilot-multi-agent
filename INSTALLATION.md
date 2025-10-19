# Copilot Multi-Agent Installation Guide

This guide provides detailed installation instructions for the Copilot Multi-Agent extension.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Initial Setup](#initial-setup)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting Installation](#troubleshooting-installation)
- [Uninstallation](#uninstallation)

## Prerequisites

Before installing the Copilot Multi-Agent extension, ensure you have the following:

### Required Software

1. **Visual Studio Code**
   - Version 1.105.0 or higher
   - Download from: [https://code.visualstudio.com/](https://code.visualstudio.com/)

2. **GitHub Copilot Chat Extension**
   - Must be installed and active
   - Available in VS Code Marketplace
   - Requires active GitHub Copilot subscription

### Required Subscriptions

1. **GitHub Copilot Subscription**
   - Individual, Business, or Enterprise plan
   - Sign up at: [https://github.com/features/copilot](https://github.com/features/copilot)

### System Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **Memory**: Minimum 4GB RAM (8GB recommended for optimal performance)
- **Storage**: At least 100MB free space for extension and configuration
- **Network**: Stable internet connection for GitHub Copilot API access

## Installation Methods

### Method 1: VS Code Marketplace (Recommended)

1. **Open VS Code**
2. **Open Extensions Panel**:
   - Click the Extensions icon in the Activity Bar (Ctrl/Cmd + Shift + X)
   - Or use View → Extensions
3. **Search for Extension**:
   - Type "Copilot Multi-Agent" in the search box
4. **Install Extension**:
   - Click "Install" on the Copilot Multi-Agent extension
   - Wait for installation to complete
5. **Reload VS Code**:
   - Click "Reload" when prompted, or restart VS Code manually

### Method 2: VSIX File Installation

If you have a VSIX file (for pre-release or custom builds):

1. **Download VSIX File**:
   - Obtain the `.vsix` file from the release or build process
2. **Install from VSIX**:
   - Open VS Code
   - Press Ctrl/Cmd + Shift + P to open Command Palette
   - Type "Extensions: Install from VSIX"
   - Select the downloaded `.vsix` file
3. **Reload VS Code**:
   - Restart VS Code to activate the extension

### Method 3: Development Installation

For developers working with the source code:

1. **Clone Repository**:
   ```bash
   git clone https://github.com/mvduijnhoven/copilot-multi-agent.git
   cd copilot-multi-agent
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build Extension**:
   ```bash
   npm run compile
   ```

4. **Run in Development Mode**:
   - Press F5 in VS Code to launch Extension Development Host
   - Or use "Run and Debug" panel

## Initial Setup

### Step 1: Verify GitHub Copilot Chat

Before configuring multi-agent, ensure GitHub Copilot Chat is working:

1. **Check Extension Status**:
   - Go to Extensions panel
   - Verify "GitHub Copilot Chat" is installed and enabled
   - Look for green checkmark or "Enabled" status

2. **Test Basic Functionality**:
   - Open any file in VS Code
   - Press Ctrl/Cmd + I to open Copilot Chat
   - Try a simple request like "Explain this code"
   - Verify you get a response from Copilot

### Step 2: Configure Multi-Agent System

1. **Open Settings**:
   - Go to File → Preferences → Settings (Ctrl/Cmd + ,)
   - Or press Ctrl/Cmd + , directly

2. **Search for Multi-Agent Settings**:
   - Type "copilotMultiAgent" in the search box
   - You should see the extension settings appear

3. **Configure Entry Agent**:
   - Set `copilotMultiAgent.entryAgent` to your preferred entry agent name
   - Default: Leave empty to use the first agent automatically

4. **Configure Agents**:
   - Click "Edit in settings.json" for `copilotMultiAgent.agents`
   - Add your agent configurations (see Configuration section below)

## Configuration

### Basic Configuration

Start with a minimal configuration to verify everything works:

```json
{
  "copilotMultiAgent.entryAgent": "coordinator",
  "copilotMultiAgent.agents": [
    {
      "name": "coordinator",
      "systemPrompt": "You are a helpful development coordinator. Analyze user requests and provide assistance with coding tasks. You can handle most requests directly or delegate to specialized agents when needed.",
      "description": "General development coordinator",
      "useFor": "General development tasks and coordination",
      "delegationPermissions": {"type": "all"},
      "toolPermissions": {"type": "specific", "tools": ["delegateWork", "reportOut", "workspace"]}
    }
  ]
}
```

### Adding Specialized Agents

Once basic functionality is verified, add specialized agents:

```json
{
  "copilotMultiAgent.entryAgent": "coordinator",
  "copilotMultiAgent.agents": [
    {
      "name": "coordinator",
      "systemPrompt": "You are a development coordinator responsible for orchestrating tasks and delegating work to specialized agents. Analyze the user's request and determine the best approach.",
      "description": "Coordinates work between specialized agents",
      "useFor": "Task orchestration and delegation",
      "delegationPermissions": {"type": "all"},
      "toolPermissions": {"type": "specific", "tools": ["delegateWork", "reportOut", "workspace"]}
    },
    {
      "name": "code-reviewer",
      "systemPrompt": "You are a senior code reviewer with expertise in software engineering best practices, security, and code quality. Focus on identifying potential issues and suggesting improvements.",
      "description": "Specialized in code review and quality analysis",
      "useFor": "Code review, security analysis, best practices",
      "delegationPermissions": {"type": "none"},
      "toolPermissions": {"type": "specific", "tools": ["reportOut", "workspace"]}
    }
  ]
}
```

### Configuration Templates

Use pre-built templates for common scenarios:

- **Minimal Setup**: Copy from `examples/configurations/minimal-setup.json`
- **Standard Setup**: Copy from `examples/configurations/standard-setup.json`
- **Advanced Setup**: Copy from `examples/configurations/advanced-setup.json`
- **Team Templates**: Use files from `examples/templates/` directory

## Verification

### Step 1: Check Extension Status

1. **Extensions Panel**:
   - Open Extensions panel (Ctrl/Cmd + Shift + X)
   - Search for "Copilot Multi-Agent"
   - Verify status shows "Enabled" with no error indicators

2. **Output Panel**:
   - Open View → Output
   - Select "Copilot Multi-Agent" from the dropdown
   - Look for startup messages and any error logs

### Step 2: Test Chat Participant

1. **Open Copilot Chat**:
   - Press Ctrl/Cmd + I to open chat panel
   - Or use View → Open View → Chat

2. **Test Multi-Agent Participant**:
   - Type `@multi-agent` in the chat input
   - You should see the multi-agent participant appear in suggestions
   - Try a simple request: `@multi-agent Hello, can you help me with coding?`

3. **Verify Response**:
   - You should receive a response from your configured entry agent
   - Check that the response is appropriate and shows the agent is working

### Step 3: Test Configuration

1. **Verify Entry Agent**:
   - The response should come from your configured entry agent
   - Check Output panel for any entry agent warnings

2. **Test Delegation** (if configured):
   - Try a request that should trigger delegation
   - Example: `@multi-agent Please review this code for potential issues`
   - Verify delegation occurs if you have multiple agents configured

### Step 4: Check Settings UI

1. **Open Settings**:
   - Go to Settings and search for "copilotMultiAgent"
   - Verify all settings appear correctly
   - Check for any validation errors or warnings

2. **Test Configuration Changes**:
   - Make a small change to an agent description
   - Verify the change is saved and applied immediately

## Troubleshooting Installation

### Extension Not Appearing

**Problem**: Extension doesn't appear in Extensions panel or marketplace search

**Solutions**:
1. **Update VS Code**: Ensure you're running version 1.105.0 or higher
2. **Refresh Extensions**: Reload the Extensions panel (Ctrl/Cmd + R in Extensions view)
3. **Check Internet Connection**: Ensure you can access VS Code Marketplace
4. **Clear Extension Cache**: Restart VS Code and try again

### Installation Fails

**Problem**: Extension installation fails with error messages

**Solutions**:
1. **Check Permissions**: Ensure VS Code has permission to install extensions
2. **Free Up Space**: Ensure sufficient disk space is available
3. **Disable Antivirus**: Temporarily disable antivirus software during installation
4. **Manual Installation**: Try installing from VSIX file if marketplace fails

### GitHub Copilot Chat Not Working

**Problem**: Multi-agent extension installs but GitHub Copilot Chat is not functional

**Solutions**:
1. **Install GitHub Copilot Chat**: Ensure the base extension is installed
2. **Check Subscription**: Verify your GitHub Copilot subscription is active
3. **Sign In**: Ensure you're signed in to GitHub in VS Code
4. **Test Separately**: Verify GitHub Copilot Chat works without multi-agent first

### Configuration Errors

**Problem**: Settings show validation errors or agents don't work

**Solutions**:
1. **Check JSON Syntax**: Ensure configuration JSON is valid
2. **Verify Required Fields**: All agent fields must be present and non-empty
3. **Check Agent Names**: Use only letters, numbers, hyphens, and underscores
4. **Reset Configuration**: Start with minimal configuration and add complexity gradually

### Performance Issues

**Problem**: VS Code becomes slow or unresponsive after installation

**Solutions**:
1. **Reduce Agent Count**: Start with 1-2 agents and add more gradually
2. **Simplify System Prompts**: Keep prompts concise but effective
3. **Check System Resources**: Ensure sufficient RAM and CPU available
4. **Restart VS Code**: Clear memory and reset connections

## Uninstallation

### Complete Removal

To completely remove the Copilot Multi-Agent extension:

1. **Disable Extension**:
   - Go to Extensions panel
   - Find Copilot Multi-Agent extension
   - Click gear icon → Disable

2. **Uninstall Extension**:
   - Click gear icon → Uninstall
   - Confirm uninstallation when prompted

3. **Remove Configuration** (optional):
   - Go to Settings
   - Search for "copilotMultiAgent"
   - Delete all multi-agent settings
   - Or reset to default values

4. **Clean Up** (optional):
   - Restart VS Code to ensure complete cleanup
   - Check that no multi-agent chat participants remain

### Temporary Disable

To temporarily disable without uninstalling:

1. **Disable Extension**:
   - Extensions panel → Copilot Multi-Agent → Disable
   - Extension remains installed but inactive

2. **Re-enable Later**:
   - Extensions panel → Copilot Multi-Agent → Enable
   - Configuration is preserved

## Post-Installation

### Next Steps

After successful installation:

1. **Read Documentation**: Review README.md for usage instructions
2. **Try Examples**: Test with provided example configurations
3. **Customize Configuration**: Adapt agents to your specific needs
4. **Join Community**: Participate in GitHub Discussions for tips and support

### Getting Help

If you encounter issues during installation:

1. **Check Troubleshooting**: Review this guide and TROUBLESHOOTING.md
2. **Search Issues**: Look for similar problems in GitHub Issues
3. **Report Problems**: Create new issue with detailed information
4. **Community Support**: Ask questions in GitHub Discussions

### Updates

The extension will automatically update through VS Code's extension system:

1. **Automatic Updates**: Enabled by default in VS Code
2. **Manual Updates**: Check Extensions panel for update notifications
3. **Pre-release Versions**: Enable pre-release versions for early access to new features

---

## Support

- **Documentation**: [README.md](README.md) and [API.md](API.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Issues**: [GitHub Issues](https://github.com/mvduijnhoven/copilot-multi-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mvduijnhoven/copilot-multi-agent/discussions)