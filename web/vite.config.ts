import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function copyAgentDocs() {
  return {
    name: 'copy-agent-docs',
    closeBundle() {
      const dist = resolve(__dirname, '../dist');
      mkdirSync(dist, { recursive: true });
      cpSync(resolve(__dirname, '../skills/slides'), resolve(dist, 'skills/slides'), { recursive: true });
      cpSync(resolve(__dirname, '../llms.txt'), resolve(dist, 'llms.txt'));
    }
  };
}

export default defineConfig({
  plugins: [react(), copyAgentDocs()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: true
  },
  server: {
    port: 43127
  }
});
