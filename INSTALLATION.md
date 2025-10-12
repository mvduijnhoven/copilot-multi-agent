# Installation Guide

## Prerequisites

- Visual Studio Code 1.105.0 or higher
- GitHub Copilot Chat extension installed and configured

## Installation Methods

### From VS Code Marketplace (Recommended)
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Copilot Multi-Agent"
4. Click "Install"

### From VSIX Package
1. Download the latest `.vsix` file from releases
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

### Development Installation
1. Clone the repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch Extension Development Host

## Configuration

After installation:

1. Open VS Code Settings (Ctrl+, / Cmd+,)
2. Search for "Copilot Multi-Agent"
3. Configure your coordinator agent and custom agents
4. Start using the multi-agent chat participant in GitHub Copilot Chat

## Verification

To verify the extension is working:

1. Open GitHub Copilot Chat
2. Type `@multi-agent` to invoke the multi-agent coordinator
3. You should see the coordinator respond based on your configuration

## Troubleshooting

- Ensure GitHub Copilot Chat is properly installed and authenticated
- Check VS Code Developer Console for any error messages
- Verify your agent configurations are valid in settings
- Restart VS Code if the extension doesn't appear to be working

For more help, see the main README.md file or open an issue on GitHub.