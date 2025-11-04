# Code Quality & Linting

This project uses **ESLint** and **Prettier** to maintain code quality and consistent formatting.

## Setup (Already Done!)

The project is now configured with:
- ✅ ESLint 9.x with flat config (`eslint.config.js`)
- ✅ Prettier 3.x with sensible defaults (`.prettierrc`)
- ✅ npm scripts for easy usage
- ✅ Git ignore patterns for build artifacts

## Available Commands

### Linting

```bash
# Check for code quality issues
npm run lint

# Auto-fix issues (fixes ~8 warnings automatically)
npm run lint:fix
```

### Formatting

```bash
# Format all JavaScript and HTML files
npm run format

# Check formatting without making changes
npm run format:check
```

### Combined Check

```bash
# Run both linting and format checking
npm run check
```

### Development Server

```bash
# Start local development server
npm run dev        # Python HTTP server on port 3000
npm run serve      # Alternative: npx serve
```

## Current Status

**ESLint Results:**
- ✅ **0 errors** (all critical issues fixed!)
- ⚠️ **22 warnings** (mostly minor style preferences)
- 📦 All files formatted with Prettier

**What was fixed:**
1. `no-case-declarations` error in audio-engine.js (wrapped in block)
2. `no-undef` errors for Tone.js, THREE.js, PIXI.js, p5.js (added global comments)
3. Auto-fixed 8 style warnings (prefer-const, prefer-template)
4. Formatted all code with consistent style

## ESLint Rules

We use a pragmatic rule set that:
- ✅ Prevents common bugs (no-unused-vars, require-await, etc.)
- ✅ Enforces modern JavaScript (no-var, prefer-const, arrow functions)
- ✅ Allows flexibility for audio processing (no-param-reassign off)
- ⚠️ Warns on style issues without blocking (handled by Prettier)

See [`eslint.config.js`](../eslint.config.js) for full configuration.

## Prettier Configuration

```json
{
  "semi": true,              // Always use semicolons
  "singleQuote": true,       // Use single quotes
  "tabWidth": 2,             // 2-space indentation
  "printWidth": 90,          // Max 90 characters per line
  "trailingComma": "es5"     // ES5-compatible trailing commas
}
```

See [`.prettierrc`](../.prettierrc) for full configuration.

## Remaining Warnings (Non-Critical)

Most warnings are intentional:
- `no-unused-vars`: Some error variables in catch blocks (e) are unused
- `require-await`: Some async functions don't use await (kept for API consistency)
- `no-console`: Console logs are useful for debugging (warnings allowed)

These don't affect functionality and can be addressed gradually.

## Integration with Git

### Option 1: Manual (Current)
Run before committing:
```bash
npm run check
```

### Option 2: Husky (Future - Phase 2)
Automatically run checks on commit:
```bash
npm install -D husky lint-staged
npx husky init
```

Add to `.husky/pre-commit`:
```bash
npx lint-staged
```

Add to `package.json`:
```json
{
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.html": ["prettier --write"]
  }
}
```

## Benefits

✅ **Catch bugs early** - ESLint finds potential errors before runtime
✅ **Consistent style** - Prettier ensures uniform formatting
✅ **Better collaboration** - Same code style across all contributors
✅ **Faster reviews** - No debates about formatting in PRs
✅ **Modern JavaScript** - Encourages ES6+ best practices
✅ **Zero config** - Works out of the box with sensible defaults

## Files & Configuration

```
biosyncare/
├── package.json           # npm scripts and dependencies
├── eslint.config.js       # ESLint flat config (v9.x)
├── .prettierrc            # Prettier formatting rules
├── .prettierignore        # Files to skip formatting
├── node_modules/          # Dependencies (gitignored)
└── .github/
    └── LINTING.md         # This file
```

## Need Help?

- ESLint docs: https://eslint.org/docs/latest/
- Prettier docs: https://prettier.io/docs/en/
- VS Code setup: Install "ESLint" and "Prettier" extensions

---

**Last updated:** 2025-11-04
**Phase:** 2 - Tooling & Quality ✓ COMPLETED
