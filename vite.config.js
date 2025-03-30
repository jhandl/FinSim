import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  // No 'root' option specified, defaults to project root where vite.config.js is located.
  // base public path when served in development or production.
  // Set to '/' because the app is served from the root of the domain.
  base: '/',
  build: {
    // Output directory relative to the project root
    outDir: 'dist',
    emptyOutDir: true, // Clean the output directory before building
  },
  server: {
    // Configure the dev server if needed (e.g., port)
    port: 8080
  }
});