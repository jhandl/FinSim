// src/core/TaxmanDependencyLoader.js

/**
 * Helper class to load Taxman dependencies (calculators, evaluator)
 * in a way that works in both Node.js (Jest) and Browser/GAS environments.
 */
class TaxmanDependencyLoader {
    constructor() {
        this.isNode = typeof module !== 'undefined' && module.exports;
        this.cache = {}; // Cache required modules in Node.js

        // Define the expected base path for requires in Node.js
        // Assumes this file is in src/core/ and dependencies are in src/core/tax/
        this.basePath = './tax/';
    }

    /**
     * Gets the constructor for a given dependency class name.
     * In Node.js, it requires the module.
     * In Browser/GAS, it assumes the class is globally available.
     * @param {string} className - The name of the class (e.g., 'SchemaEvaluator').
     * @returns {Function} The class constructor.
     * @throws {Error} If the class cannot be resolved in the current environment.
     */
    get(className) {
        if (this.isNode) {
            // Node.js: Require the module if not already cached
            if (!this.cache[className]) {
                try {
                    // Construct the path relative to Taxman.js location (src/core/)
                    const modulePath = this.basePath + className;
                    this.cache[className] = require(modulePath);
                } catch (e) {
                    console.error(`TaxmanDependencyLoader: Failed to require ${className} from ${this.basePath + className}`, e);
                    throw new Error(`TaxmanDependencyLoader: Could not load dependency ${className}.`);
                }
            }
            return this.cache[className];
        } else {
            // Browser/GAS: Assume global availability
            if (typeof globalThis[className] === 'function') {
                return globalThis[className];
            } else if (typeof window !== 'undefined' && typeof window[className] === 'function') {
                 // Fallback for older browser environments if globalThis is not defined
                 return window[className];
            } else {
                 // Attempt direct access as last resort (might work in GAS)
                 try {
                     const GlobalClass = new Function(`return ${className}`)();
                     if (typeof GlobalClass === 'function') {
                         return GlobalClass;
                     }
                 } catch (e) { /* Ignore error, proceed to throw */ }

                 console.error(`TaxmanDependencyLoader: Global class ${className} not found.`);
                 throw new Error(`TaxmanDependencyLoader: Dependency ${className} not found in global scope.`);
            }
        }
    }
}

// Export the loader itself for Node.js environments if needed elsewhere,
// but primarily it will be instantiated within Taxman.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaxmanDependencyLoader;
}