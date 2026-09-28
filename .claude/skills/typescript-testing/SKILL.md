---
name: typescript-testing
description: "TypeScript testing best practices: Jest/Vitest, mocking, async patterns, and TDD"
---

# TypeScript Testing Best Practices

## Test structure and discovery

- Store tests in `tests/` or co-locate as `.test.ts` / `.spec.ts`
- Use Jest or Vitest; configure in `jest.config.ts` or `vitest.config.ts`
- Group related tests using `describe()` blocks

## Jest/Vitest basics

```typescript
describe('MyFunction', () => {
  it('should return expected value', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  it('should handle async work', async () => {
    const result = await asyncFunction();
    expect(result).toEqual({ data: 'value' });
  });
});
```

## Mocking in TypeScript

```typescript
jest.mock('./module');
import { myExport } from './module';

const mockFunction = myExport as jest.MockedFunction<typeof myExport>;
mockFunction.mockReturnValue('mocked');
```

## Async testing

```typescript
it('should handle promises', () => {
  return expect(asyncFunction()).resolves.toBe(expected);
});

it('should handle rejections', () => {
  return expect(asyncFunction()).rejects.toThrow(Error);
});
```

## Red-Green-Refactor

1. Write a failing test (red)
2. Implement minimal code to pass (green)
3. Refactor for quality (refactor)

```bash
npm test -- --watch
npm test -- --coverage
```

Target >80% coverage on critical paths.
