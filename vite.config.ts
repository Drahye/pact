import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pactLoader } from './vite.loader';

export default defineConfig({
  plugins: [react(), pactLoader()],
  server: { port: Number(process.env.PORT) || 5173, host: true, proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 8787}`, changeOrigin: false } } },
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'gsap', '@gsap/react', 'framer-motion', 'qrcode'],
  },
});
