import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@components': path.resolve(__dirname, 'components'),
          '@hooks': path.resolve(__dirname, 'hooks'),
          '@utils': path.resolve(__dirname, 'utils'),
          '@constants': path.resolve(__dirname, 'constants'),
          '@services': path.resolve(__dirname, 'services'),
          '@types': path.resolve(__dirname, 'types.ts'),
        }
      },
      // 优化缓存和性能
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'lucide-react',
          '@google/genai'
        ],
        exclude: []
      },
      build: {
        // 启用代码分割
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              icons: ['lucide-react'],
              api: ['@google/genai']
            }
          }
        },
        // 增加 chunk 大小限制
        chunkSizeWarningLimit: 1000
      },
      // 开发服务器优化
      server: {
        hmr: {
          overlay: false
        },
        fs: {
          strict: false
        }
      }
    };
});
