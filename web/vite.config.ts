import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function zipSkillFolder(dist: string) {
  const src = resolve(__dirname, '../skills/slides');
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(src)) {
    if (name.startsWith('.') || name.endsWith('.zip')) continue;
    files[`slides/${name}`] = new Uint8Array(readFileSync(resolve(src, name)));
  }
  writeFileSync(resolve(dist, 'skills/slides.zip'), zipSync(files));
}

function copyAgentDocs() {
  return {
    name: 'copy-agent-docs',
    closeBundle() {
      const dist = resolve(__dirname, '../dist');
      mkdirSync(resolve(dist, 'skills'), { recursive: true });
      mkdirSync(resolve(dist, 'slides-host'), { recursive: true });
      cpSync(resolve(__dirname, '../skills/slides'), resolve(dist, 'skills/slides'), { recursive: true });
      cpSync(resolve(__dirname, '../src/runtime'), resolve(dist, 'slides-host'), { recursive: true });
      cpSync(resolve(__dirname, '../llms.txt'), resolve(dist, 'llms.txt'));
      zipSkillFolder(dist);
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
