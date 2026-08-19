# LangoSoft – Claude Instructions

## Before every push that touches TypeScript files

Run the TypeScript compiler check and confirm it passes before committing:

```
cd frontend && npx tsc --noEmit
```

Do not push if there are any errors.
