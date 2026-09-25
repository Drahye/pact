import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'gsap', '@gsap/react', 'framer-motion', 'qrcode'],
  },
});
