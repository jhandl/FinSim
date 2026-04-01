const fs = require('fs');
const path = require('path');

function loadClass(relativePath, className) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
  return new Function(source + '\nreturn ' + className + ';')();
}

const FileManager = loadClass('src/frontend/web/components/FileManager.js', 'FileManager');

describe('FileManager iOS share save', () => {
  const originalNavigator = {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints,
    share: window.navigator.share,
    canShare: window.navigator.canShare
  };

  function setNavigator(overrides) {
    Object.defineProperty(window.navigator, 'userAgent', { value: overrides.userAgent, configurable: true });
    Object.defineProperty(window.navigator, 'platform', { value: overrides.platform, configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: overrides.maxTouchPoints, configurable: true });
    Object.defineProperty(window.navigator, 'share', { value: overrides.share, configurable: true });
    Object.defineProperty(window.navigator, 'canShare', { value: overrides.canShare, configurable: true });
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="saveSimulation"></button>
      <button id="loadSimulation"></button>
      <input type="file" id="loadSimulationDialog" accept=".csv,text/csv">
    `;
    global.serializeSimulation = jest.fn(() => '# FinSim v2.1 Save File\n# Parameters\nStartCountry,ie\n');
    global.Config = {
      getInstance: () => ({
        getStartCountry: () => 'ie',
        getCachedTaxRuleSet: () => ({}),
        getTaxRuleSet: jest.fn(() => Promise.resolve({})),
        isRelocationEnabled: () => false
      })
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    setNavigator(originalNavigator);
    jest.restoreAllMocks();
    delete global.serializeSimulation;
    delete global.Config;
  });

  test('save uses navigator.share with a csv file on iPhone-class browsers', async () => {
    const parentShareSpy = jest.fn(() => Promise.resolve(true));
    setNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
      share: jest.fn(() => Promise.resolve()),
      canShare: jest.fn(() => true)
    });
    jest.spyOn(window, 'prompt').mockReturnValue('Shared Plan');
    Object.defineProperty(window, 'top', {
      value: {
        location: { origin: window.location.origin },
        navigator: window.navigator,
        File: window.File,
        shareScenarioFileFromChild: parentShareSpy
      },
      configurable: true
    });

    const webUI = {
      saveToFile: jest.fn(),
      loadFromFile: jest.fn(),
      readEvents: jest.fn(() => []),
      notificationUtils: { showAlert: jest.fn() }
    };

    const manager = new FileManager(webUI);
    const ensureSpy = jest.spyOn(manager, '_ensureScenarioTaxRuleSetsLoaded');
    await manager.saveToFile();

    const shareBtn = document.getElementById('iosScenarioShareConfirm');
    const nameInput = document.getElementById('iosScenarioShareName');
    expect(shareBtn).not.toBeNull();
    expect(nameInput).not.toBeNull();
    expect(parentShareSpy).not.toHaveBeenCalled();
    expect(ensureSpy).not.toHaveBeenCalled();

    nameInput.value = 'Shared Plan';
    shareBtn.click();
    await Promise.resolve();

    expect(parentShareSpy).toHaveBeenCalledTimes(1);
    expect(parentShareSpy).toHaveBeenCalledWith({
      filename: 'Shared Plan.csv',
      content: '# FinSim v2.1 Save File\n# Parameters\nStartCountry,ie\n'
    });
  });
});
