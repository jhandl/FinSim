const fs = require('fs');
const path = require('path');

global.Config = {
  getInstance: () => ({})
};
global.WebUI = {
  getInstance: () => ({ eventsTableManager: { ageYearMode: 'age' } })
};

const formatUtilsPath = path.resolve(__dirname, '../src/frontend/web/utils/FormatUtils.js');
const formatUtilsSource = fs.readFileSync(formatUtilsPath, 'utf8');
eval(`${formatUtilsSource}\n;global.FormatUtils = FormatUtils;`);

describe('FormatUtils optional variable segments', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps bracketed segment when variable has a value', () => {
    const text = 'One two three [four ${countryName} five] six seven.';
    expect(FormatUtils.processVariables(text, { countryName: 'Ireland' }))
      .toBe('One two three four Ireland five six seven.');
  });

  test('drops bracketed segment when variable is missing or blank', () => {
    const text = 'One two three [four ${countryName} five] six seven.';
    expect(FormatUtils.processVariables(text, {})).toBe('One two three six seven.');
    expect(FormatUtils.processVariables(text, { countryName: '' })).toBe('One two three six seven.');
  });

  test('does not warn for missing variables inside optional bracketed segments', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(FormatUtils.processVariables('A [B ${missingVar} C] D', {})).toBe('A D');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('does not alter markdown links', () => {
    expect(FormatUtils.processVariables('[OpenAI](https://openai.com)', {}))
      .toBe('[OpenAI](https://openai.com)');
  });
});
