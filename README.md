# Eastyles
*Easy web styling for everyone*

## 🗺️ Roadmap

- Phase 1: Foundation preparation ☑️
- **Phase 2: Support UserCSS application**
- Phase 3: Add CSS modification & color application
- Phase 4: Add object hiding capabilities
- Phase 5: Optimizations before release

## 🚀 Getting Started

- **Prerequisites**: Node.js ≥ 20 with pnpm ≥ 9 (or bun ≥ 1.0.0)
- **Stack**: WXT + TypeScript + React + TailwindCSS + DaisyUI + Vitest

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/KiKaraage/eastyles.git
   cd eastyles
   ```

2. **Install dependencies**
   ```bash
   # Using npm
   npm install

   # Using pnpm (recommended)
   pnpm install

   # Using bun
   bun install
   ```

3. **Prepare TypeScript types**
   ```bash
   # Run automatically after install, or manually
   npm run postinstall
   ```

## 🛠️ Development

### Essential Commands

| Command | Purpose | Target Browser |
|---------|---------|---------------|
| `bun dev` | Serve extension in development mode | Firefox |
| `bun dev:crx` | Serve extension in development mode | Chrome |
| `bun build` | Create production build | Firefox |
| `bun build:crx` | Create production build | Chrome |
| `bun builds` | Build for all browsers | Both |
| `bun zip` | Create zipped package | Firefox |
| `bun zip:crx` | Create zipped package | Chrome |
| `bun test` | Run tests | Both |

## Directory Layout

```
eastyles/
├─ assets/               # Static assets (images, fonts, etc.)
├─ components/           # Reusable React components
│  ├─ features/            # Feature-specific components
│  └─ ui/                  # Generic UI components
├─ entrypoints/          # Extension entry points
│  ├─ background.ts        # Background script
│  ├─ content.ts           # Content script
│  ├─ manager/             # Style manager + settings page
│  └─ popup/               # Extension popup
├─ hooks/                # Custom React hooks
├─ public/               # Static assets copied as-is
│  └─ icon/                # Extension icons
├─ services/             # Service layer
│  ├─ index.ts             # Service exports
│  ├─ message-bus.ts       # Message bus implementation
│  ├─ errors/              # Error handling utilities
│  ├─ lifecycle/           # Extension lifecycle management
│  ├─ messaging/           # Cross-context messaging
│  └─ storage/             # Storage abstraction
├─ test/                 # Test files
│  ├─ lifecycle/           # Lifecycle tests
│  ├─ manager/             # Manager tests
│  ├─ messaging/           # Messaging tests
│  ├─ popup/               # Popup tests
│  ├─ unit/                # Unit tests
│  │  ├─ components/         # Component unit tests
│  │  ├─ errors/             # Error handling tests
│  │  └─ hooks/              # Hook tests
│  └─ utils/               # Utility tests
├─ utils/                # Utility functions
├─ wxt.config.ts         # WXT config file
├─ eslint.config.js      # ESLint config file
├─ vitest.config.ts      # Vitest config file
├─ tsconfig.json
└─ package.json
```

> **Important** – Do **not** place unrelated files directly inside `entrypoints/`. Use a sub‑directory per entrypoint if you need additional files.

## Common Pitfalls (quick cheat‑sheet)

| Pitfall | Fix |
|---------|-----|
| Runtime code runs at build time | Wrap all runtime logic inside `main()` of `defineBackground/defineContentScript`. |
| Unintended entrypoints | Keep the `entrypoints/` directory flat. Do **not** nest files or folders that are not entrypoints. |
| Unnecessary bundle size | Import from `#imports` instead of individual `wxt/...` modules. |
| Firefox missing source ZIP | Run `pnpm zip` or set `zip.includeSources: true` in `wxt.config.ts`. |
| `manifest.include`/`exclude` meta tags mis‑typed | Use the exact syntax shown in the examples; mismatches silently ignore the tag. |

## Contribution Guide

```bash
# Format code
bun format

# Lint
bun lint

# Run tests
bun test
```

All PRs must pass linting and tests. Use conventional commits (`feat:`, `fix:`, `chore:`).

## 🔖 License

GPL v3 @ KiKaraage
