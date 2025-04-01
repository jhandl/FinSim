import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { minify } from 'terser';

// Dynamically generate list of non-module JS files from the core folder
const coreDir = path.resolve(__dirname, 'src/core');
const coreFiles = fs.readdirSync(coreDir)
  .filter(file => file.endsWith('.js'))
  .map(file => `/src/core/${file}`);

// Helper function to copy directories recursively during build
function copyDirectoryRecursive(pluginContext, sourceRelative, destRelative, outputBaseDir) {
  const sourceDir = path.resolve(__dirname, sourceRelative);
  const destDir = path.resolve(outputBaseDir, destRelative);
  
  if (fs.existsSync(sourceDir)) {
    try {
      fs.mkdirSync(path.dirname(destDir), { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.cpSync(sourceDir, destDir, { recursive: true });
      console.log(`Copied ${sourceDir} to ${destDir}`);
    } catch (err) {
      pluginContext.error(`Error copying directory ${sourceRelative}: ${err.message}`);
    }
  } else {
     console.warn(`Source directory not found, skipping copy: ${sourceDir}`);
  }
}

// Custom plugin to concatenate/minify non-module scripts and transform HTML
function nonModuleConcatMinifyPlugin(options) {
  const { directory, outputFileName } = options;
  if (!directory || !outputFileName) {
    throw new Error('nonModuleConcatMinifyPlugin requires "directory" and "outputFileName" options.');
  }

  return {
    name: 'non-module-concat-minify-and-transform',
    apply: 'build',
    async generateBundle(outputOptions, bundle) {
      const dirPath = path.resolve(__dirname, directory);
      const filesToProcess = fs.readdirSync(dirPath)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(directory, file));

      let concatenatedCode = '';
      for (const file of filesToProcess) {
        const filePath = path.resolve(__dirname, file);
        try {
          const code = fs.readFileSync(filePath, 'utf-8');
          concatenatedCode += code + '\n';
        } catch (err) {
          this.error(`Error reading file ${file}: ${err.message}`);
          return;
        }
      }

      if (concatenatedCode) {
        try {
          const minified = await minify(concatenatedCode, {
            compress: {
              drop_console: true,
              drop_debugger: true,
              unused: false
            },
            mangle: {
              toplevel: true,
              reserved: ['AbstractUI', 'UIManager', 'Config', 'run', 'deserializeSimulation'] // Prevent renaming of these specific globals
            },
            output: {
              beautify: false
            }
          });

          if (minified.error) {
            this.error(`Error minifying concatenated code from ${directory}: ${minified.error}`);
          } else {
            this.emitFile({
              type: 'asset',
              fileName: outputFileName,
              source: minified.code
            });
          }
        } catch (err) {
           this.error(`Error during Terser minification for ${directory}: ${err.message}`);
        }
      }

      const icoPath = path.resolve(__dirname, 'src/frontend/web/ifs/IFS.ico');
      if (fs.existsSync(icoPath)) {
        // Check if favicon already exists in bundle to avoid duplicates if handled elsewhere
        if (!bundle['IFS.ico']) {
            this.emitFile({
                type: 'asset',
                fileName: 'IFS.ico',
                source: fs.readFileSync(icoPath)
            });
        }
      }

      const outputBaseDir = outputOptions.dir || path.resolve(__dirname, 'dist');
      copyDirectoryRecursive(this, 'src/core/config', 'src/core/config', outputBaseDir);
      copyDirectoryRecursive(this, 'src/frontend/web/assets', 'src/frontend/web/assets', outputBaseDir);
    },
    transformIndexHtml(html, ctx) {
      let finalHtml = html;
      if (html.includes('<!-- IFS_ENTRY_POINT -->')) {
          const coreBlockPattern = /(<!-- Core scripts loaded globally -->\s*)(<script src="\/src\/core\/[^"]+\.js"><\/script>\s*)+/;
          const match = html.match(coreBlockPattern);
          if (match) {
              const replacement = '<!-- Core scripts loaded globally -->\n    <script src="/core-bundle.js"></script>';
              finalHtml = html.replace(coreBlockPattern, replacement);
          }
      }
      return finalHtml;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  return {
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: 'index.html',
          landing: 'src/frontend/web/landing/index.html',
          ifs: 'src/frontend/web/ifs/index.html'
        }
      }
    },
    plugins: [
      nonModuleConcatMinifyPlugin({ directory: 'src/core', outputFileName: 'core-bundle.js' })
    ],
    optimizeDeps: {
      exclude: coreFiles
    },
    server: {
      port: 8080
    }
  };
});