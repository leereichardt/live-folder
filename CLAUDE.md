# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Live Folder is a browser extension that automatically tracks GitHub pull requests and syncs them to the browser. The extension monitors GitHub authentication via cookies, fetches PRs from the user's GitHub account, and maintains them as either:

- **Chrome**: Tab groups (tabs auto-open in a collapsible, colored group)
- **Firefox**: Bookmark folder (legacy fallback)

Both implementations refresh periodically based on user settings.

## Build & Development Commands

Built with **Bun** as the package manager and **WXT** as the browser extension framework.

### Development

```bash
bun run dev          # Chrome development server
bun run dev:firefox  # Firefox development server
```

### Build & Release

```bash
bun run build          # Build for Chrome
bun run build:firefox  # Build for Firefox
bun run zip            # Create Chrome distribution zip
bun run zip:firefox    # Create Firefox distribution zip
```

### Code Quality

```bash
bun run compile   # TypeScript type checking (no emit)
bun run lint      # ESLint with auto-fix
bun run format    # Prettier formatting
bun run ci        # Run all checks: lint + format + compile
```

## Architecture

### Core Components

**LiveFolder (src/live-folder.ts)** - Singleton orchestrator managing the entire lifecycle:

- Initializes on extension startup via `entrypoints/background.ts`
- Coordinates between ConfigHandler, GithubHandler, and TabGroupHandler
- Browser-aware sync: uses `syncFolder()` to route to either tab groups (Chrome) or bookmarks (Firefox)
- Sets up periodic alarms for PR refresh intervals
- Main entry point: `lf.init()` called from background script

**TabGroupHandler (src/tab-group-handler.ts)** - Chrome tab group management:

- Creates/updates tab groups with configurable color and title
- Syncs tabs: opens new PR tabs, removes closed PRs, keeps existing tabs
- Auto-collapses group when empty, expands when PRs exist
- Only used on Chrome (checked via `ConfigHandler.supportsTabGroups()`)

**GithubHandler (src/github-handler.ts)** - GitHub integration:

- Monitors authentication via GitHub cookies (`logged_in=yes` on `.github.com`)
- Scrapes PR list from `https://github.com/pulls` using Cheerio
- Parses PR data: name, number, repository_name, url
- Responds to auth state messages from popup via webext-bridge

**ConfigHandler (src/config-handler.ts)** - Settings and storage management:

- Stores configuration in `browser.storage.local`
- Manages both tab group settings (Chrome) and bookmark folder (Firefox)
- Settings include: name, refreshInterval, prNameFormat, tabGroupId, tabGroupColor
- Handles PR name formatting with placeholders: `%repository%`, `%name%`, `%number%`
- `supportsTabGroups()` method checks if browser is Chrome
- Listens for manual bookmark folder renames and cookie/runtime events

### Communication

Uses **webext-bridge** for typed messaging between background and popup:

- `AUTH_STATE` - Check GitHub authentication status
- `GET_CONFIG` - Retrieve current settings
- `SET_CONFIG` - Update settings (triggers folder sync)

Message types defined in `src/msg.d.ts` via ProtocolMap extension.

### UI

**Popup (entrypoints/popup/)** - React-based settings interface:

- Two tabs: Info (authentication status) and Settings (configuration form)
- Built with Radix UI components and Tailwind CSS
- Settings form uses react-hook-form + Zod validation
- Shows live preview of PR name format
- Chrome: Displays color picker for tab group color (9 colors available)
- Firefox: Shows "Folder Name" instead of "Tab Group Name"

### WXT Framework

WXT handles the browser extension build process:

- Auto-imports enabled for React and extension APIs
- Manifest permissions: bookmarks, storage, alarms, cookies, tabs, tabGroups
- Host permissions for `*.github.com`
- Different extension IDs for Firefox (gecko) vs Chrome
- Uses webextension-polyfill for cross-browser compatibility

### Key Behaviors

1. **Sync Flow**:

    - Chrome: Authentication check → Ensure tab group exists → Fetch PRs → Open/remove tabs → Update last sync timestamp
   - Firefox: Authentication check → Ensure folder exists → Fetch PRs → Update/create/remove bookmarks → Update last sync timestamp

2. **Chrome Tab Group Logic**:

    - Compare existing tabs by URL, add new PRs as tabs, remove closed PR tabs
   - Tab group auto-collapses when empty, expands when PRs exist
   - Tab group color and title update on sync if settings changed

3. **Firefox Bookmark Logic**:

    - Compare existing bookmarks by URL, update titles if format changed, remove stale PRs, add new ones
   - Bookmark parent ID is `"toolbar_____"` (see `getFolderParentIdByBrowser()`)

4. **Browser Detection**: `import.meta.env.BROWSER` checks if Chrome or Firefox
5. **Debug Mode**: Currently hardcoded to `true` in LiveFolder constructor for verbose logging
