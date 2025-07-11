/**
 * IconRenderer - Centralized icon rendering system for consistent iconography
 * 
 * This class provides a unified way to render icons across the application,
 * ensuring consistency and making it easy to update icon styles globally.
 */
class IconRenderer {
  
  /**
   * Main icon rendering method
   * @param {string} iconType - Type of icon to render
   * @param {Object} options - Rendering options (size, color, etc.)
   * @returns {string} HTML string for the icon
   */
  static render(iconType, options = {}) {
    if (!iconType) {
      return '';
    }

    const iconMethod = this.getIconMethod(iconType);
    if (!iconMethod) {
      console.warn(`Unknown icon type: ${iconType}`);
      return this.renderFallbackIcon(iconType, options);
    }

    try {
      return iconMethod.call(this, options);
    } catch (error) {
      console.error(`Error rendering icon ${iconType}:`, error);
      return this.renderFallbackIcon(iconType, options);
    }
  }

  /**
   * Gets the appropriate rendering method for an icon type
   * @param {string} iconType - Type of icon
   * @returns {Function|null} Icon rendering method
   */
  static getIconMethod(iconType) {
    const iconMethods = {
      'user-toggle': this.renderUserToggleIcon,
      'chart-line': this.renderChartLineIcon,
      'chart-variable': this.renderChartVariableIcon,
      'palette': this.renderPaletteIcon,
      'user': this.renderUserIcon,
      'user-friends': this.renderUserFriendsIcon,
      'demo': this.renderDemoIcon,
      'save': this.renderSaveIcon,
      'load': this.renderLoadIcon,
      'help': this.renderHelpIcon,
      'run': this.renderRunIcon
    };

    return iconMethods[iconType] || null;
  }

  /**
   * Renders user toggle icon (single vs couple mode)
   * @param {Object} options - Rendering options
   * @returns {string} HTML for user toggle icon
   */
  static renderUserToggleIcon(options = {}) {
    return '<i class="fas fa-user"></i> / <i class="fas fa-user-friends"></i>';
  }

  /**
   * Renders single user icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for user icon
   */
  static renderUserIcon(options = {}) {
    return '<i class="fas fa-user"></i>';
  }

  /**
   * Renders user friends icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for user friends icon
   */
  static renderUserFriendsIcon(options = {}) {
    return '<i class="fas fa-user-friends"></i>';
  }

  /**
   * Renders linear chart icon (fixed growth)
   * @param {Object} options - Rendering options
   * @returns {string} HTML for chart line icon
   */
  static renderChartLineIcon(options = {}) {
    const width = options.width || 18;
    const height = options.height || 14;
    const style = options.style || 'vertical-align: middle;';
    
    return `<svg width="${width}" height="${height}" viewBox="0 0 20 16" style="${style}">
      <line x1="2" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1"/>
      <line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="1"/>
      <line x1="3" y1="12" x2="19" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  /**
   * Renders variable chart icon (volatile growth)
   * @param {Object} options - Rendering options
   * @returns {string} HTML for chart variable icon
   */
  static renderChartVariableIcon(options = {}) {
    const width = options.width || 18;
    const height = options.height || 14;
    const style = options.style || 'vertical-align: middle;';
    
    return `<svg width="${width}" height="${height}" viewBox="0 0 20 16" style="${style}">
      <line x1="2" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1"/>
      <line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="1"/>
      <path d="M3 12 L6 9 L9 11 L12 7 L15 10 L19 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
  }

  /**
   * Renders palette icon with gradient colors
   * @param {Object} options - Rendering options
   * @returns {string} HTML for palette icon
   */
  static renderPaletteIcon(options = {}) {
    const gradientStyle = 'background: linear-gradient(45deg,#fe0000 0%,#f34201 20%,#eda600 40%,#e0cd00 60%,#94ac29 80%,#00e000 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;';
    
    return `<i class="fas fa-palette" style="${gradientStyle}"></i>`;
  }

  /**
   * Renders demo icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for demo icon
   */
  static renderDemoIcon(options = {}) {
    return '<i class="fas fa-play-circle"></i>';
  }

  /**
   * Renders save icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for save icon
   */
  static renderSaveIcon(options = {}) {
    return '<i class="fas fa-save"></i>';
  }

  /**
   * Renders load icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for load icon
   */
  static renderLoadIcon(options = {}) {
    return '<i class="fas fa-folder-open"></i>';
  }

  /**
   * Renders help icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for help icon
   */
  static renderHelpIcon(options = {}) {
    return '<i class="fas fa-question-circle"></i>';
  }

  /**
   * Renders run icon
   * @param {Object} options - Rendering options
   * @returns {string} HTML for run icon
   */
  static renderRunIcon(options = {}) {
    return '<i class="fas fa-calculator"></i>';
  }

  /**
   * Renders a fallback icon for unknown types
   * @param {string} iconType - The unknown icon type
   * @param {Object} options - Rendering options
   * @returns {string} HTML for fallback icon
   */
  static renderFallbackIcon(iconType, options = {}) {
    // Try to render as FontAwesome class if it looks like one
    if (iconType.startsWith('fa-') || iconType.startsWith('fas-') || iconType.startsWith('far-')) {
      const className = iconType.startsWith('fa-') ? `fas ${iconType}` : iconType.replace('-', ' ');
      return `<i class="${className}"></i>`;
    }
    
    // Generic fallback
    return '<i class="fas fa-circle"></i>';
  }

  /**
   * Creates a custom SVG icon
   * @param {string} pathData - SVG path data
   * @param {Object} options - SVG options (width, height, viewBox, etc.)
   * @returns {string} HTML for custom SVG icon
   */
  static renderCustomSVG(pathData, options = {}) {
    const width = options.width || 16;
    const height = options.height || 16;
    const viewBox = options.viewBox || `0 0 ${width} ${height}`;
    const fill = options.fill || 'currentColor';
    const stroke = options.stroke || 'none';
    const strokeWidth = options.strokeWidth || 0;
    const className = options.className || '';
    const style = options.style || '';
    
    return `<svg width="${width}" height="${height}" viewBox="${viewBox}" class="${className}" style="${style}">
      <path d="${pathData}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
    </svg>`;
  }

  /**
   * Wraps an icon with additional styling or container
   * @param {string} iconHtml - The icon HTML
   * @param {Object} options - Wrapper options
   * @returns {string} Wrapped icon HTML
   */
  static wrapIcon(iconHtml, options = {}) {
    if (!options.wrapper) {
      return iconHtml;
    }

    const wrapperClass = options.wrapperClass || '';
    const wrapperStyle = options.wrapperStyle || '';
    const wrapperTag = options.wrapperTag || 'span';
    
    return `<${wrapperTag} class="${wrapperClass}" style="${wrapperStyle}">${iconHtml}</${wrapperTag}>`;
  }

  /**
   * Renders multiple icons in sequence
   * @param {Array} iconTypes - Array of icon types to render
   * @param {Object} options - Rendering options
   * @returns {string} HTML for multiple icons
   */
  static renderMultiple(iconTypes, options = {}) {
    if (!Array.isArray(iconTypes)) {
      return '';
    }

    const separator = options.separator || ' ';
    const iconOptions = options.iconOptions || {};
    
    return iconTypes
      .map(iconType => this.render(iconType, iconOptions))
      .join(separator);
  }

  /**
   * Gets available icon types
   * @returns {Array} Array of available icon type names
   */
  static getAvailableIcons() {
    return [
      'user-toggle', 'chart-line', 'chart-variable', 'palette',
      'user', 'user-friends', 'demo', 'save', 'load', 'help', 'run'
    ];
  }

  /**
   * Validates if an icon type is available
   * @param {string} iconType - Icon type to validate
   * @returns {boolean} True if icon type is available
   */
  static isValidIconType(iconType) {
    return this.getAvailableIcons().includes(iconType);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IconRenderer;
}
