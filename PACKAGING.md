# Packaging and Distribution Guide

This document explains how to package and distribute the Copilot Multi-Agent extension.

## Package Configuration

The extension is configured with comprehensive metadata in `package.json`:

### Key Metadata
- **Name**: `copilot-multi-agent`
- **Display Name**: `Copilot Multi-Agent`
- **Version**: `0.1.0`
- **Publisher**: `your-publisher-name` (update this)
- **License**: MIT
- **VS Code Engine**: `^1.105.0`

### Marketplace Information
- Categories: AI, Chat, Other
- Keywords: copilot, ai, multi-agent, chat, delegation, assistant, productivity, development
- Gallery banner with dark theme
- Repository and bug tracking URLs (update these)

## Build Scripts

### Available Commands

```bash
# Development
npm run compile          # Compile TypeScript and run linting
npm run watch           # Watch mode for development
npm run test            # Run tests

# Building
npm run clean           # Clean build artifacts
npm run build           # Full clean build
npm run build:check     # Verify package configuration

# Packaging
npm run package:vsix    # Create .vsix package for distribution
npm run publish         # Publish to VS Code Marketplace
npm run install:local   # Install locally from .vsix file
```

## Pre-Publishing Checklist

Before publishing, ensure you:

1. **Update Publisher Information**
   - Change `publisher` in package.json to your actual publisher name
   - Update `author` information
   - Update repository URLs to your actual repository

2. **Create Extension Icon**
   - Create a 128x128 PNG icon at `images/icon.png`
   - Use the provided SVG (`images/icon.svg`) as a reference
   - Uncomment the `icon` field in package.json

3. **Verify Configuration**
   ```bash
   npm run build:check
   ```

4. **Test the Extension**
   ```bash
   npm run compile
   npm run test
   ```

5. **Create Package**
   ```bash
   npm run package:vsix
   ```

## Publishing to VS Code Marketplace

### Prerequisites
1. Create a publisher account at https://marketplace.visualstudio.com/
2. Generate a Personal Access Token (PAT) from Azure DevOps
3. Install vsce globally: `npm install -g @vscode/vsce`

### Publishing Steps
1. Login to vsce: `vsce login your-publisher-name`
2. Publish: `npm run publish` or `vsce publish`

### Version Management
- Use semantic versioning (major.minor.patch)
- Update CHANGELOG.md with each release
- Tag releases in git: `git tag v0.1.0`

## File Exclusions

The `.vscodeignore` file excludes:
- Source files (`src/**`)
- Development files (`.vscode/**`, `out/**`)
- Build tools and configs
- Documentation files not needed in package
- Git and development artifacts

## Package Verification

The extension includes a build verification script (`scripts/build-check.js`) that:
- Validates required package.json fields
- Checks for essential files (LICENSE, CHANGELOG)
- Verifies build configuration
- Provides next steps guidance

## Distribution Options

### VS Code Marketplace
- Primary distribution method
- Automatic updates for users
- Searchable and discoverable

### GitHub Releases
- Upload .vsix files to GitHub releases
- Manual installation option
- Good for beta/preview versions

### Enterprise Distribution
- Share .vsix files directly
- Install via `code --install-extension package.vsix`
- Suitable for internal/private distributions

## Troubleshooting

### Common Issues
- **Missing publisher**: Update publisher field in package.json
- **Icon not found**: Create icon.png or remove icon field
- **Build failures**: Run `npm run build:check` for diagnostics
- **Large package size**: Review .vscodeignore exclusions

### Package Size Optimization
- Ensure source files are excluded
- Use production builds (`npm run package`)
- Minimize bundled dependencies
- Exclude unnecessary assets

## Continuous Integration

Consider setting up CI/CD for:
- Automated testing on pull requests
- Automated packaging on releases
- Automated publishing to marketplace
- Cross-platform testing

Example GitHub Actions workflow can be added to `.github/workflows/` for automation.