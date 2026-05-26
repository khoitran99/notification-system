import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    include: [
      'packages/*/src/**/*.test.ts',
      'services/*/src/**/*.test.ts',
    ],
  },
})
