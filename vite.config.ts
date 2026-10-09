import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is conditionally disabled via DISABLE_HMR env var.
      // File watching is disabled to prevent flickering during automated code generation.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU resources.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist/client',
      sourcemap: false, // Não publica sourcemaps internos no frontend em produção
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['lucide-react', 'motion/react'],
            'vendor-charts': ['recharts'],
            'vendor-pdf': ['jspdf'],
            'vendor-supabase': ['@supabase/supabase-js']
          }
        }
      }
    }
  };
});
