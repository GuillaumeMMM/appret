import { defineConfig } from "vite";

const entries = {
  index: "src/index.ts",
  "tabs/index": "src/tabs/index.ts",
  "listbox/index": "src/listbox/index.ts",
  "define/tabs": "src/define/tabs.ts",
};

export default defineConfig({
  build: {
    target: "es2022",
    minify: false,
    sourcemap: true,
    emptyOutDir: false,
    rolldownOptions: {
      output: { chunkFileNames: "chunks/[name].js" },
    },
    lib: {
      entry: entries,
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
