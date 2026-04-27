<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Next.js 16 Proxy Convention

In Next.js 16, root `proxy.ts` is the correct file convention for request-gating logic. `middleware.ts` is deprecated/renamed to `proxy` in this version. Keep auth/redirect protection in `proxy.ts` unless the project intentionally migrates away from Proxy.
<!-- END:nextjs-agent-rules -->
