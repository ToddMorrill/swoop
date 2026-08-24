import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so built asset URLs need
  // that prefix. The deploy workflow sets this; local dev and user sites use /.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
