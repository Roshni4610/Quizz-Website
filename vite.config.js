import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Quizz-Website/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext'
  }
});
