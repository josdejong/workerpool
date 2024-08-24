import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    commonjsOptions: {
      // ignore built-in modules in Node.js
      ignore: ['os', 'child_process', 'worker_threads']
    }
  }
})
