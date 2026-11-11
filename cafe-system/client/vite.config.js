import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Silently ignore normal connection resets on server restart / page refresh
            if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return;
            console.warn('[vite] ws proxy error:', err.message);
          });
        },
      },
    },
  },
});

