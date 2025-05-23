# Architectural Notes: Frontend-Core Dependencies

During debugging of an issue related to `src/core/Utils.js`, an investigation was performed to check for potential architectural violations where frontend code might be directly accessing functions or classes defined in the `src/core` directory, assuming they are globally available due to the core files being non-module scripts.

The following instances were identified:

1.  **`src/frontend/web/components/FileManager.js`**:
    *   Directly calls `serializeSimulation` (defined in `src/core/Utils.js`).
    *   Directly calls `deserializeSimulation` (defined in `src/core/Utils.js`).
    *   *Note:* Comments in the file explicitly state the assumption that these functions are globally available.

2.  **`src/frontend/web/components/Wizard.js`**:
    *   Directly calls `Config.getInstance` (defined in `src/core/Config.js`).
    *   *Note:* A comment explicitly states the assumption that `Config` is globally available.

3.  **`src/frontend/web/WebUI.js`**:
    *   Directly calls `Config.getInstance` (defined in `src/core/Config.js`).
    *   *Note:* A comment explicitly states the assumption that `Config` is loaded globally.

## Recommendation

These direct calls bypass the intended `WebUI`/`UIManager` abstraction layer. To improve architectural separation, consider refactoring:

*   Modify `FileManager.js` and `Wizard.js` to interact with the core logic via methods exposed on the `WebUI` instance.
*   Add corresponding methods to `WebUI.js` (and potentially `UIManager`/`AbstractUI`) to handle these operations (e.g., `webUI.serializeSimulation()`, `webUI.deserializeSimulation(content)`, `webUI.getConfigInstance()`).