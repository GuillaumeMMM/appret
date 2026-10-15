import { defineConfig } from "vite";

const entries = {
  index: "src/index.ts",
  tabs: "src/tabs.ts",
};

export default defineConfig({
  build: {
    target: "es2022",
    minify: false,
    sourcemap: true,
    lib: {
      entry: entries,
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
