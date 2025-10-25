# AGENTS.md

This file provides comprehensive guidance for developers working with the Eastyles browser extension repository.

## Project Overview

**Eastyles** is a browser extension that allows users easily apply custom styles to websites. It currently supports customization through UserCSS files and custom font injection.

- **Tech Stack**: WXT + TypeScript + React + Tailwind CSS + daisyUI + Vitest
- **Target**: Web Extension (Firefox & Chrome)
- **Architecture**: Service-oriented with separation between background script, content script, popup, and manager page

## Development Guidelines

### Essential Commands

1. After editing files, always check LSP diagnostics and fix errors.
2. Never run build/dev commands automatically; confirm first.
3. Test one file/folder at a time.

- Build: `bun builds` (both browsers) or `bun build` (Firefox) or `bun build:crx` (Chrome)
- Dev server: `bun dev` or `bun dev:crx`
- Type checking: `bun compile`
- Linting: `bun lint`/`bun lint:fix`
- Testing: `bun test:all`, `bun test:watch`, `bun test:coverage`

### Project Structure

Eastyles follows WXT's entrypoint-based architecture:

#### Entrypoints
- `background.ts`: Service worker for lifecycle and messaging
- `content.ts`: Content script for CSS injection
- `popup/`: Quick style toggles and font injection
- `manager/`: Style management and settings

#### Services Layer
- `errors/`: Centralized error handling
- `messaging/`: Type-safe message passing
- `storage/`: Browser storage abstraction
- `usercss/`: UserCSS parsing and CSS injection
- `lifecycle/`: Extension installation and updates

When using services, import from `@services/*`.

## Code Quality Standards

This project uses Biome for comprehensive linting. Key rules include:

### Type Safety
- Explicit types for all variables
- Avoid implicit `any`

### Code Style
- Use template literals
- Avoid array index as React key
- Explicit `type` attribute for `<button>` elements
- Use sorted imports. Prefer `import type` when possible.
- Use `slice` instead of the deprecated `substr` (ts 6385).

### Best Practices
- Proper null checking instead of `!` assertions
- Use optional chaining (`?.`)
- Exhaustive dependencies in React hooks

## React Performance Guidelines

### useEffect Optimization
- **Eliminate redundant useEffects**: Combine related side effects or move them inline
- **Split complex useEffects**: Separate initialization from ongoing watching
- **Optimize dependency arrays**: Only include truly necessary dependencies
- **Prefer computed values**: Calculate values during render instead of useEffect + state
- **Move inline operations**: Simple side effects don't need useEffect

### Common useEffect Patterns
❌ **AVOID**: useEffect for simple value calculations
```typescript
useEffect(() => {
  setComputedValue(a + b);
}, [a, b]);
```

✅ **PREFER**: Direct computation during render
```typescript
const computedValue = a + b;
```

❌ **AVOID**: Redundant initialization effects
```typescript
useEffect(() => {
  loadData();
}, [loadData]);
```

✅ **PREFER**: Direct call or optimized initialization
```typescript
useEffect(() => {
  loadData();
}, []); // Remove dependency if stable
```

### useEffect Testing
- Test effect cleanup functions
- Mock timers for interval-based effects
- Verify dependency array correctness
- Test effect runs only when expected
- Use `vi.advanceTimersByTime()` for time-based effects

## Common Pitfalls

1. Keep `entrypoints/` flat
2. Handle message timeouts
3. Use type guards for storage reads
4. Be aware of CSP restrictions for CSS injection
5. Handle non-persistent background script initialization
6. **useEffect overuse**: Not every side effect needs useEffect
7. **Dependency array bloat**: Including stable functions causes unnecessary re-runs
8. **Missing cleanup**: Forgetting to return cleanup functions
9. **Infinite loops**: Effects that trigger their own dependencies
10. **Regex state issues**: Avoid using `regex.exec()` in loops with global flags, as it maintains internal state that can cause infinite loops or missed matches

## Performance Monitoring

Enable React DevTools Profiler to identify:
- Unnecessary re-renders
- Expensive render operations
- useEffect frequency analysis
- Component mount/unmount patterns

Use debug mode with React profiling:
```bash
NODE_ENV=development REACT_DEBUG=true bun dev
```

## Debugging

Enable debug mode with:
```bash
NODE_ENV=development bun dev
```
This enables verbose logging, error reporting, performance monitoring, and message bus debugging.

## Testing Best Practices

1. Mock browser APIs before component imports
2. Define mocks before `vi.mock` usage
3. Set up global `browser` object
4. Mock async operations in `useEffect`
5. Account for timing issues in loading states
6. **Async/Await Testing**: Always make test functions `async` when calling async functions, and use `await` to get resolved values instead of checking Promise objects
7. Maintain Type Safety in Test Environments
   - Provide module declarations for mocked external dependencies (e.g., `wxt/browser`, `wxt/utils/storage`) to prevent TypeScript resolution errors.
   - Use explicit types (`unknown` with guards) instead of `any` for mock parameters and async operations to maintain strict type checking.
   - Ensure mock implementations avoid linting violations, such as adding comments to empty blocks in arrow functions to satisfy rules like `suspicious/noEmptyBlock`.

Example mocking pattern:

```typescript
// Define typed mock functions
interface MockTabsQuery {
  (query: unknown): Promise<unknown[]>;
}
interface MockSendMessage {
  <T = unknown>(message: unknown, options?: unknown): Promise<T>;
}

// Create typed mock functions
const mockTabsQuery = vi.fn<MockTabsQuery>();
const mockSendMessage = vi.fn<MockSendMessage>();

// Set up global browser object
Object.defineProperty(global, 'browser', {
  value: {
    tabs: { query: mockTabsQuery },
    runtime: { sendMessage: mockSendMessage },
  },
  writable: true,
});

// Mock extension modules
vi.mock('wxt/browser', () => ({
  browser: {
    tabs: { query: mockTabsQuery },
    runtime: { sendMessage: mockSendMessage },
  },
}));
```

## Biome Linting Rules Example

#### suspicious/noAssignInExpressions - Assignment in Expression
**Rule**: Never assign variables inside conditional expressions.

❌ BAD:
```typescript
while ((match = regex.exec(text)) !== null) { /* process */ }
```

✅ GOOD:
```typescript
while (true) {
  match = regex.exec(text);
  if (match === null) break;
  // process match...
}
```

🔢 **BETTER**: Use `matchAll()` for modern, safer regex iteration
```typescript
// Using matchAll() - no state management required
for (const match of text.matchAll(regex)) {
  // process match...
}

// Or convert to array for multiple passes
const matches = Array.from(text.matchAll(regex));
```

#### regex/avoidGlobalExec - Regex State Management
**Rule**: Avoid using `regex.exec()` with global flags in loops as it maintains internal state.

❌ BAD:
```typescript
const regex = /pattern/g;
let match = regex.exec(text);
while (match !== null) {
  // Can cause infinite loops or miss matches
  match = regex.exec(text);
}
```

✅ PREFER:
```typescript
// Method 1: Using matchAll() (recommended)
for (const match of text.matchAll(/pattern/g)) {
  // Process match
}

// Method 2: Traditional while loop without global flag
const regex = /pattern/;
let match = regex.exec(text);
while (match !== null) {
  // Process match
  regex.lastIndex = 0; // Reset state
  match = regex.exec(text);
}

// Method 3: Convert to array
const matches = Array.from(text.matchAll(/pattern/g));
matches.forEach(match => {
  // Process match
});
```

#### style/useTemplate - Template Literals
**Rule**: Use template literals instead of string concatenation.

❌ BAD:
```typescript
const message = "Hello " + name + "!";
```

✅ GOOD:
```typescript
const message = `Hello ${name}!`;
```

#### suspicious/noArrayIndexKey - React Keys
**Rule**: Never use array index as React key prop.

❌ BAD:
```tsx
{items.map((item, index) => (
  <div key={index}>{item.name}</div>
))}
```

✅ GOOD:
```tsx
{items.map((item) => (
  <div key={item.id}>{item.name}</div>
))}
```

#### a11y/useButtonType - Button Accessibility
**Rule**: All `<button>` elements must have explicit `type` attribute.

❌ BAD:
```tsx
<button onClick={handleClick}>Save</button>
```

✅ GOOD:
```tsx
<button type="button" onClick={handleClick}>Save</button>
```

#### source/organizeImports - Import Organization
**Rule**: Imports must be sorted alphabetically by module path.

❌ BAD:
```typescript
import { useEffect } from "react";
import { css } from "@codemirror/lang-css";
import { EditorView } from "codemirror";
```

✅ GOOD:
```typescript
import { css } from "@codemirror/lang-css";
import { EditorView } from "codemirror";
import { useEffect } from "react";
```

**Sorting Order:**
1. External packages (alphabetical by module name)
2. Relative imports (alphabetical by path)
3. Value imports before type imports (same module)

#### style/noNonNullAssertion - Null Safety
**Rule**: Avoid `!` assertions; use proper null checking.

❌ BAD:
```typescript
const result = getData()!.value;
```

✅ GOOD:
```typescript
const data = getData();
if (data) {
  const result = data.value;
}
```

#### complexity/useOptionalChain - Optional Chaining
**Rule**: Use `?.` for cleaner null/undefined handling.

❌ BAD:
```typescript
if (browser.runtime && browser.runtime.id) { /* ... */ }
```

✅ GOOD:
```typescript
if (browser.runtime?.id) { /* ... */ }
```

#### correctness/useExhaustiveDependencies - React Hook Dependencies
**Rule**: All useEffect/useCallback dependencies must be properly declared.

❌ BAD:
```typescript
const callback = useCallback(() => {
  sendMessage(type, data); // sendMessage not declared
}, []); // Missing dependency
```

✅ GOOD:
```typescript
const callback = useCallback(() => {
  sendMessage(type, data);
}, [sendMessage, type, data]); // All used vars declared
```

#### suspicious/noImplicitAnyLet - Type Explicitness
**Rule**: All variables must have explicit types; never rely on `any` inference.

❌ BAD:
```typescript
let match; // TypeScript infers `any`
```

✅ GOOD:
```typescript
let match: RegExpExecArray | null = null;
```
