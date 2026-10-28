---
name: vercel-react-best-practices
description: Use when writing, reviewing or refactoring React/Next.js code for performance: rendering, data fetching, bundle size.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
user-invocable: false
---

# Vercel React Best Practices

Performance guide for React and Next.js applications: 51 rules in 8 categories, prioritized by impact.

Each rule's full explanation and incorrect/correct examples are in `rules/<rule-name>.md` in this skill folder. Read only the rules that apply to the code at hand.

- **Dependencies:** when a rule suggests a library (`better-all`, `swr`, `lru-cache`), use it only if the project already has it or the user asks. Otherwise use the dependency-free alternative (early-started promises, the data-fetching library already in use, a `Map` with expiry).
- **React Compiler:** if the project enables it, skip the manual `memo`/`useMemo`/`useCallback` rules; the compiler does that.
- **Versions:** `<Activity>` and `useEffectEvent` need React 19.2+, `after()` needs Next.js 15.1+. Check `package.json` before applying.

## When to Apply

Reference these guidelines when:
- Writing new React components or Next.js pages
- Implementing data fetching (client or server-side)
- Reviewing code for performance issues
- Refactoring existing React/Next.js code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations
- `async-dependencies` - Start dependent promises early so partial dependencies run in parallel
- `async-api-routes` - Start promises early, await late in API routes
- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use next/dynamic for heavy components
- `bundle-defer-third-party` - Load analytics/logging after hydration
- `bundle-conditional` - Load modules only when feature is activated
- `bundle-preload` - Preload on hover/focus for perceived speed

### 3. Server-Side Performance (HIGH)

- `server-auth-actions` - Authenticate and authorize inside every Server Action
- `server-cache-react` - Use React.cache() for per-request deduplication
- `server-cache-lru` - Use LRU cache for cross-request caching
- `server-serialization` - Minimize data passed to client components
- `server-parallel-fetching` - Restructure components to parallelize fetches
- `server-after-nonblocking` - Use after() for non-blocking operations
- `server-dedup-props` - Avoid passing the same data twice across RSC props

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `client-swr-dedup` - Use SWR for automatic request deduplication
- `client-event-listeners` - Deduplicate global event listeners
- `client-passive-event-listeners` - Use passive listeners for scroll/touch
- `client-localstorage-schema` - Version and minimize localStorage data

### 5. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist non-primitive default props of memoized components to constants
- `rerender-simple-expression-in-memo` - Don't wrap cheap primitive expressions in useMemo
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-transitions` - Use startTransition for non-urgent updates

### 6. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element
- `rendering-content-visibility` - Use content-visibility for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-hydration-no-flicker` - Use inline script for client-only data
- `rendering-activity` - Use Activity component for show/hide
- `rendering-conditional-render` - Use ternary, not && for conditionals

### 7. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-cache-storage` - Cache localStorage/sessionStorage reads
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist RegExp creation outside loops
- `js-min-max-loop` - Use loop for min/max instead of sort
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
- `js-tosorted-immutable` - Use toSorted() for immutability

### 8. Advanced Patterns (LOW)

- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-use-latest` - useLatest for stable callback refs

## 자주 쓰는 규칙 예시

#### async-parallel (CRITICAL)
```typescript
// BAD: 순차 실행
const users = await getUsers();
const posts = await getPosts();

// GOOD: 병렬 실행
const [users, posts] = await Promise.all([getUsers(), getPosts()]);
```

#### bundle-barrel-imports (CRITICAL)
```typescript
// BAD: 배럴 파일에서 import (트리쉐이킹 실패)
import { Button } from '@/components';

// GOOD: 직접 import
import { Button } from '@/components/ui/button';
```

#### rerender-memo (MEDIUM)
```typescript
// BAD: 부모 리렌더링 시 매번 재계산
function Parent() {
  const [count, setCount] = useState(0);
  return <><ExpensiveList /><button onClick={() => setCount(c+1)} /></>;
}

// GOOD: memo로 격리
const ExpensiveList = React.memo(function ExpensiveList() { ... });
```

#### server-cache-react (HIGH)
```typescript
// React.cache()로 요청 단위 중복 제거
const getUser = React.cache(async (id: string) => {
  return await db.user.findUnique({ where: { id } });
});
```

코드 작성·리뷰 때는 위 Priority 표의 CRITICAL → HIGH 순서로 적용한다. 성능 개선을 주장할 때는 측정(번들 분석, React Profiler, Lighthouse 등)이나 코드 근거를 함께 보고한다.
