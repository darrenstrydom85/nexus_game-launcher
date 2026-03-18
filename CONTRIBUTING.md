# Contributing to Nexus Game Launcher

Thank you for your interest in contributing to **Nexus**!  
Nexus is a free, open-source unified game launcher for Windows that brings together libraries from Steam, Epic, GOG, Xbox, Battle.net, Ubisoft Connect, and standalone games into one beautiful, dark-themed interface.

We welcome contributions of all kinds — bug reports, feature suggestions, code improvements, documentation, and more.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Submitting Changes](#submitting-changes)
- [Coding Guidelines](#coding-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [License](#license)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md) (create this file if you don't have one yet — we recommend the Contributor Covenant).

## How Can I Contribute?

### Reporting Bugs
- Use the [Issue tracker](https://github.com/darrenstrydom85/nexus_game-launcher/issues)
- Include as much detail as possible (steps to reproduce, expected vs actual behavior, screenshots, logs)
- Check if the bug has already been reported

### Suggesting Features / Enhancements
- Open a new issue with the label `enhancement`
- Clearly describe the feature and why it would be useful

### Contributing Code
The best way to contribute code is via **Pull Requests** (see below).

Popular areas for contributions right now:
- Adding support for new game sources / launchers
- Improving metadata fetching (IGDB, SteamGridDB, etc.)
- UI/UX enhancements (while respecting the Obsidian design system)
- Performance improvements (especially library scanning and duplicate detection)
- Better error handling and logging
- Accessibility improvements
- Documentation and translations

## Development Setup

### Prerequisites
- Windows 10/11 (64-bit)
- [Node.js](https://nodejs.org/) 20 or higher
- [Rust](https://www.rust-lang.org/tools/install) (stable channel)
- Visual Studio Build Tools with C++ desktop development workload (or Windows C++ Build Tools)
- WebView2 Runtime (usually installed automatically)

### Getting Started

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/nexus_game-launcher.git
cd nexus_game-launcher

# 2. Install dependencies
npm install

# 3. Run the app in development mode (hot reload enabled)
npm run tauri dev
