# Tests

This directory contains the test suite for the Metadata Bot project.

## Running Tests

```bash
# Run all tests
deno task test

# Run tests in watch mode (auto-rerun on file changes)
deno task test:watch

# Run tests with coverage
deno task test:coverage

# Generate coverage report
deno task coverage
```

## Test Files

- `file-patcher.test.ts` - Tests for patching keywords, summaries, and descriptions in metadata files
- `repository-manager.test.ts` - Tests for cloning repositories and finding metadata files
- `flathub-api.test.ts` - Tests for Flathub API client

## Writing Tests

Tests use Deno's built-in testing framework and standard library assertions:

```typescript
import { assertEquals, assertExists } from "@std/assert";

Deno.test("test name", () => {
  assertEquals(1 + 1, 2);
});
```

### Ignoring Tests

Some tests require network access or actual cloned repositories. These are marked with `{ ignore: true }` to skip them in CI:

```typescript
Deno.test("network test", { ignore: true }, async () => {
  // Test that requires network
});
```

## Test Coverage

After running tests with coverage, view the HTML report:

```bash
deno task test:coverage
deno task coverage
# Open coverage/lcov.info in your coverage viewer
```
