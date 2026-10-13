import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 주소가 https://kmddkkim.github.io/weather-clothes/ 이므로 배포 빌드에만 경로를 붙인다
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/weather-clothes/' : '/',
  plugins: [react()],
  server: { port: 5173 },
}))
