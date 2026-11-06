import { defineConfig } from 'vite';

// base './' so the build works under https://<owner>.github.io/skinforge/ and from any sub-path.
export default defineConfig({
  base: './',
  server: { port: 8798 },
  build: { target: 'es2022' },
});
