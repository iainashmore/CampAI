import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: opens straight from a laptop or USB stick, no server, no internet.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
