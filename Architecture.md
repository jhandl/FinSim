# FinSim Project Architecture

The FinSim project is a browser-based financial simulator that runs entirely in browser (no server-side code) and can also run on Google Sheets. It is designed with a clear separation between the core financial simulation engine and the user interface implementations. This modularity allows users to interact with the simulation through different frontends while ensuring the underlying calculations remain consistent.

## Core Components (`src/core`)

*   **`Simulator.js`**: The central simulation engine, orchestrating the process, managing state, and using financial models.
*   **Financial Models**: `Equities.js`, `RealEstate.js`, `Revenue.js` encapsulate logic for specific asset types and tax calculations.
*   **Configuration & Events**: `Config.js` manages simulation settings; `Events.js` defines the `SimEvent` class for timeline occurrences.
*   **UI Abstraction & Management**:
    *   **`AbstractUI.js`**: Abstract class defining the contract for all UI implementations (methods for I/O, display, files, versioning).
    *   **`UIManager.js`**: Mediator managing data flow and validation between the `Simulator` and the concrete `AbstractUI` implementation (e.g., `WebUI`, `GasUI`). Reads/validates inputs, formats/pushes outputs, updates status.
*   **Utilities (`Utils.js`)**: Common helper functions (financial math, random numbers, serialization, etc.).

## Frontend Components (`src/frontend`)

*   **Web UI (`src/frontend/web`)**:
    *   **`WebUI.js`**: Concrete `AbstractUI` implementation for the web, interacting with the DOM and browser APIs.
    *   **`spa-router.js`**: Handles Single Page Application routing. This is a custom implementation that uses a frame to load the different pages of the simulation using hashtags, ensuring the core simulation classes don't stay defined in the global scope causing conflicts when reloaded.
    *   **Components (`src/frontend/web/components`)**: Reusable web UI widgets (charts, tables, etc.).
    *   **Assets & Structure (`src/frontend/web/ifs`, `src/frontend/web/landing`)**: HTML, CSS, JS libraries, images for the simulation interface and landing page.
*   **Google Apps Script (GAS) UI (`src/frontend/gas`)**:
    *   **`GasUI.js`**: Concrete `AbstractUI` implementation for Google Sheets, using the `SpreadsheetApp` API.

## Build System (Web Frontend)

The build process for the web frontend (`src/frontend/web`) is managed using Node.js, npm, and the Vite build tool.

*   **Technology**: Vite (`vite.config.js`, `package.json`) handles development server (`npm run dev`) and production builds (`npm run build`).
*   **Entry Points**: The build is configured to handle multiple HTML entry points:
    *   `index.html` (Root application entry point, providing the basic HTML structure and loading the SPA router)
    *   `src/frontend/web/landing/index.html` (Standalone landing page)
    *   `src/frontend/web/ifs/index.html` (The main interactive financial simulation interface)
*   **Core Script Handling**: A custom Vite plugin (`nonModuleConcatMinifyPlugin`) specifically addresses the non-module nature of the core simulation scripts, as Google Apps Script code cannot be modules (`src/core/*.js`):
    *   **Concatenation & Minification**: During a production build (`npm run build`), this plugin reads all `.js` files in `src/core`, concatenates them into a single `core-bundle.js`, and minifies the bundle using Terser. Global names essential for the application's functioning (like `AbstractUI`, `UIManager`, `Config`) are preserved during minification.
    *   **HTML Transformation**: The plugin modifies the main simulation HTML (`src/frontend/web/ifs/index.html`) during the build, replacing individual `<script>` tags for the core files with a single reference to the generated `core-bundle.js`.
    *   **Development Mode**: In development (`npm run dev`), Vite serves the individual `src/core` files directly, allowing for faster updates and debugging. These files are excluded from Vite's dependency optimization (`optimizeDeps.exclude`).
*   **Asset Handling**: The custom plugin also copies necessary static assets (like configuration files from `src/core/config`, general assets from `src/frontend/web/assets`, and the favicon `IFS.ico`) into the final build output directory (`dist`).
*   **Output**: The production build output is placed in the `dist/` directory.
*   **Scope**: This build process is specific to the **web frontend**. The deployment of the Google Apps Script UI (`src/frontend/gas`) is handled separately and is not integrated into the Vite build process (likely requiring manual deployment, e.g., copy-pasting code into the Apps Script editor).

## Interaction Flow

1.  User interacts with a frontend (`WebUI` or `GasUI`).
2.  The frontend UI class instantiates `UIManager`, passing itself (`this`) as the `ui` argument.
3.  The `UIManager` reads parameters and events from the UI (delegating calls to `WebUI` or `GasUI` methods defined by `AbstractUI`). It validates this input.
4.  If validation passes (checked within `UIManager`), a global `run()` function (triggered by the UI) instantiates and executes the `Simulator`, passing the validated parameters and events obtained via the `UIManager`.
5.  `Simulator.js` runs the simulation, using the financial models (`Equities`, `RealEstate`, `Revenue`), configuration (`Config`), and events (`Events`).
6.  During and after the simulation, `Simulator.js` calls methods on the `UIManager` instance (e.g., `updateDataRow`, `updateStatusCell`) to display results and status.
7.  `UIManager` formats the data and calls the appropriate methods on its stored `ui` instance (`WebUI` or `GasUI`) to update the actual user interface.
8.  Utility functions (`Utils.js`) support various calculations and operations throughout the core logic.

## Architecture Diagram (Mermaid)

```mermaid
graph TD
    subgraph Frontend
        WebUI[Web UI (WebUI.js, spa-router.js, ...)]
        GasUI[GAS UI (GasUI.js)]
    end

    subgraph Core
        AbsUI(AbstractUI.js)
        UIMgr[UIManager.js]
        Sim[Simulator.js]
        Conf[Config.js]
        Evt[Events.js]
        Eq[Equities.js]
        RE[RealEstate.js]
        Rev[Revenue.js]
        Util[Utils.js]
    end

    subgraph Build [Web Build (Vite)]
        direction LR
        ViteConf[vite.config.js]
        PkgJson[package.json]
        CustomPlugin[nonModuleConcatMinifyPlugin]
        Terser[Terser]
        HTML_In[HTML Inputs (index.html, ifs/index.html, ...)]
        CoreJS_In[Core JS (src/core/*.js)]
        Assets_In[Assets (config, assets, ico)]
        HTML_Out[Transformed HTML]
        CoreBundle_Out[core-bundle.js]
        Assets_Out[Copied Assets]
        Dist[dist/ Directory]

        PkgJson --> ViteConf
        ViteConf --> CustomPlugin
        CustomPlugin -- Uses --> Terser
        CustomPlugin -- Processes --> CoreJS_In
        CustomPlugin -- Transforms --> HTML_In
        CustomPlugin -- Copies --> Assets_In
        CustomPlugin -- Outputs --> CoreBundle_Out
        CustomPlugin -- Outputs --> HTML_Out
        CustomPlugin -- Outputs --> Assets_Out
        CoreBundle_Out --> Dist
        HTML_Out --> Dist
        Assets_Out --> Dist

    end

    %% Implementation/Inheritance
    WebUI -- Implements --> AbsUI
    GasUI -- Implements --> AbsUI

    %% Core Dependencies / Interactions
    UIMgr -- Uses (Delegates to) --> AbsUI
    Sim -- Uses --> UIMgr
    Sim -- Uses --> Conf
    Sim -- Uses --> Evt
    Sim -- Uses --> Eq
    Sim -- Uses --> RE
    Sim -- Uses --> Rev
    Sim -- Uses --> Util
    Eq -- Uses --> Util
    RE -- Uses --> Util
    Rev -- Uses --> Util
    Conf -- Uses --> AbsUI

    %% Build Relationship
    WebUI -- Built By --> Build


    style Core fill:#f9f,stroke:#333,stroke-width:2px
    style Frontend fill:#ccf,stroke:#333,stroke-width:2px
    style Build fill:#cfc,stroke:#333,stroke-width:2px
```

## Key Strengths

*   **Modularity & Separation of Concerns**: Clear distinction between simulation logic, UI interaction management, and concrete UI implementation.
*   **Flexibility**: Supports multiple frontends easily.
*   **Reusability**: `UIManager` contains common data handling and validation logic used by both frontends.
*   **Testability**: The architecture allows for easier testing of the core simulation (`Simulator`, models) and UI management (`UIManager`) by enabling the mocking of the `AbstractUI` dependency, although no automated tests are currently implemented in the project.
*   **Optimized Web Build**: The build process creates a bundled and minified version of the core logic for efficient delivery in the web frontend.