import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for a React project.
// The react plugin enables automatic JSX transformation and fast refresh.
export default defineConfig({
  plugins: [react()],
  base: '/',
});