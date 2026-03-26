require('../src/core/LegacyScenarioAdapter.js');
require('../src/core/Utils.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TOY_AA, TOY_BB, deepClone } = require('./helpers/CoreConfidenceFixtures.js');

const adapterSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'LegacyScenarioAdapter.js'), 'utf8');
vm.runInThisContext(adapterSource);
const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Utils.js'), 'utf8');
vm.runInThisContext(utilsSource);

const serializeSimulation = global.serializeSimulation;
const deserializeSimulation = global.deserializeSimulation;

function createRuleset(definition) {
  const investmentTypes = (definition.investmentTypes || []).map(type => Object.assign({}, type));
  return {
    getCurrencyCode: () => definition.locale.currencyCode,
    getCurrencySymbol: () => definition.locale.currencySymbol,
    getInvestmentTypes: () => investmentTypes,
    getResolvedInvestmentTypes: () => investmentTypes,
    hasPrivatePensions: () => true
  };
}

function createRuleDefinitions() {
  const aa = deepClone(TOY_AA);
  const bb = deepClone(TOY_BB);

  aa.investmentTypes = [
    {
      key: 'funds_aa',
      label: 'Funds AA',
      baseCurrency: 'AAA',
      assetCountry: 'aa',
      residenceScope: 'local',
      taxation: { exitTax: { rate: 0.40 } }
    },
    {
      key: 'shares_aa',
      label: 'Shares AA',
      baseCurrency: 'AAA',
      assetCountry: 'aa',
      residenceScope: 'local',
      taxation: { capitalGains: { rate: 0.20, annualExemption: 1000 } }
    }
  ];
  bb.investmentTypes = [
    {
      key: 'funds_bb',
      label: 'Funds BB',
      baseCurrency: 'BBB',
      assetCountry: 'bb',
      residenceScope: 'local',
      taxation: { exitTax: { rate: 0.35 } }
    },
    {
      key: 'shares_bb',
      label: 'Shares BB',
      baseCurrency: 'BBB',
      assetCountry: 'bb',
      residenceScope: 'local',
      taxation: { capitalGains: { rate: 0.25, annualExemption: 500 } }
    }
  ];

  return { aa, bb };
}

function createConfigStub(options) {
  const settings = options || {};
  const defs = settings.ruleDefinitions || createRuleDefinitions();
  const rules = {
    aa: createRuleset(defs.aa),
    bb: createRuleset(defs.bb)
  };
  const countries = [
    { code: 'aa', name: 'Toy Alpha' },
    { code: 'bb', name: 'Toy Beta' }
  ];

  return {
    getInstance: () => ({
      isRelocationEnabled: () => settings.relocationEnabled === true,
      getCountryNameByCode: code => {
        const normalized = String(code || '').trim().toLowerCase();
        for (let i = 0; i < countries.length; i++) {
          if (countries[i].code === normalized) return countries[i].name;
        }
        return normalized.toUpperCase();
      },
      getInvestmentBaseTypes: () => [
        { baseKey: 'equity' },
        { baseKey: 'bond' }
      ],
      getAvailableCountries: () => countries,
      listCachedRuleSets: () => rules,
      getCachedTaxRuleSet: code => rules[String(code || '').trim().toLowerCase()] || null,
      getDefaultCountry: () => 'aa',
      getStartCountry: () => 'aa'
    })
  };
}

function createParameterDocument(eventDomRows) {
  const elements = {};
  const rows = eventDomRows || [];

  const doc = {
    _elements: elements,
    ensureEl(id, className) {
      if (!elements[id]) {
        elements[id] = {
          id: id,
          value: '',
          className: className || '',
          attributes: {},
          setAttribute(name, value) {
            this.attributes[name] = value;
          },
          getAttribute(name) {
            return this.attributes[name];
          }
        };
      } else if (className && !elements[id].className) {
        elements[id].className = className;
      }
      return elements[id];
    },
    getElementById(id) {
      if (id === 'Events') return this._eventsTable;
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      const prefixMatch = String(selector || '').match(/^(?:input)?\[id\^="([^"]+)"\]$/);
      if (!prefixMatch) return [];
      const prefix = prefixMatch[1];
      const matches = [];
      for (const id in elements) {
        if (!Object.prototype.hasOwnProperty.call(elements, id)) continue;
        if (id.indexOf(prefix) === 0) matches.push(elements[id]);
      }
      return matches;
    },
    _eventsTable: {
      getElementsByTagName(tag) {
        if (tag === 'tr') return rows;
        return [];
      }
    }
  };

  return doc;
}

function createEventDomRow(eventType, meta) {
  const values = meta || {};
  return {
    dataset: {
      eventId: values.eventId || '',
      relocationImpact: values.resolved === '0' ? '1' : ''
    },
    classList: {
      contains: () => false
    },
    getElementsByTagName(tag) {
      if (tag === 'td') return [{}, {}];
      return [];
    },
    querySelector(selector) {
      if (selector === '.event-type') return { value: eventType };
      if (selector === '.event-currency' && values.currency) return { value: values.currency };
      if (selector === '.event-linked-country' && values.linkedCountry) return { value: values.linkedCountry };
      if (selector === '.event-linked-event-id' && values.linkedEventId) return { value: values.linkedEventId };
      if (selector === '.event-relocation-split-mv-id' && values.splitMvId) return { value: values.splitMvId };
      if (selector === '.event-relocation-split-anchor-amount' && values.splitAnchorAmount !== undefined && values.splitAnchorAmount !== '') {
        return { value: values.splitAnchorAmount };
      }
      if (selector === '.event-relocation-split-value-mode' && values.splitValueMode) return { value: values.splitValueMode };
      if (selector === '.event-relocation-link-id' && values.mvLinkId) return { value: values.mvLinkId };
      if (selector === '.event-relocation-sell-mv-id' && values.sellMvId) return { value: values.sellMvId };
      if (selector === '.event-relocation-rent-mv-id' && values.rentMvId) return { value: values.rentMvId };
      if (selector === '.event-resolution-override' && values.resolved === '1') return { value: '1' };
      if (selector === '.event-resolution-mv-id' && values.resolvedMvId) return { value: values.resolvedMvId };
      if (selector === '.event-resolution-category' && values.resolvedCategory) return { value: values.resolvedCategory };
      return null;
    }
  };
}

function createUi(doc, eventRows) {
  const rows = eventRows || [];
  return {
    ensureParameterInput(id, className) {
      doc.ensureEl(id, className);
    },
    setValue(id, value) {
      const el = doc.getElementById(id) || doc.ensureEl(id, '');
      el.value = value === undefined || value === null ? '' : String(value);
    },
    getValue(id) {
      const el = doc.getElementById(id);
      return el ? el.value : '';
    },
    getVersion: () => '2.1',
    isPercentage: () => false,
    isBoolean: () => false,
    getTableData: () => rows
  };
}

function seedValues(ui, values) {
  const map = values || {};
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    ui.ensureParameterInput(keys[i], '');
    ui.setValue(keys[i], map[keys[i]]);
  }
}

function snapshotDocumentValues(doc) {
  const snapshot = {};
  if (!doc || !doc._elements) return snapshot;
  const keys = Object.keys(doc._elements);
  for (let i = 0; i < keys.length; i++) {
    const el = doc._elements[keys[i]];
    snapshot[keys[i]] = el && el.value !== undefined && el.value !== null ? String(el.value) : '';
  }
  return snapshot;
}

function parseSection(csv, sectionName) {
  const lines = String(csv || '').split('\n');
  let current = '';
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      current = line.trim();
      continue;
    }
    if (current === sectionName) result.push(line.trim());
  }
  return result;
}

function parseParameterMap(csv) {
  const lines = parseSection(csv, '# Parameters');
  const map = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const commaIndex = line.indexOf(',');
    const key = commaIndex >= 0 ? line.substring(0, commaIndex) : line;
    const value = commaIndex >= 0 ? line.substring(commaIndex + 1) : '';
    map[key] = value;
  }
  return map;
}

function parseEventMetaSection(csv) {
  const lines = parseSection(csv, '# EventMeta').filter(Boolean);
  if (!lines.length) return { headers: [], rows: {} };
  const headers = lines[0].split(',');
  const rows = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const rowNumber = parts[0];
    rows[rowNumber] = {};
    for (let j = 1; j < headers.length; j++) {
      rows[rowNumber][headers[j]] = parts[j] || '';
    }
  }
  return { headers, rows };
}

function parseMetaString(metaString) {
  const meta = {};
  if (!metaString || typeof metaString !== 'string') return meta;
  const parts = metaString.split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.substring(0, eq);
    const value = decodeURIComponent(part.substring(eq + 1));
    meta[key] = value;
  }
  return meta;
}

function looksLikeMetaString(value) {
  return typeof value === 'string' && value.indexOf('=') >= 0;
}

function buildRoundTripRows(eventData) {
  const metaRows = [];
  const eventRows = [];
  for (let i = 0; i < eventData.length; i++) {
    const source = eventData[i].slice();
    const type = source.shift() || '';
    const name = source.shift() || '';
    let metaString = '';
    if (source.length && looksLikeMetaString(source[source.length - 1])) {
      metaString = source.pop();
    }
    metaRows.push(parseMetaString(metaString));
    eventRows.push([type + ':' + name].concat(source));
  }
  return { eventRows, metaRows };
}

function buildDomMetaRows(metaRows, eventRows) {
  const domMetaRows = [];
  const markerByRowNumber = {};
  for (let i = 0; i < eventRows.length; i++) {
    const event = eventRows[i] || [];
    const typeName = String(event[0] || '');
    const type = typeName.indexOf(':') >= 0 ? typeName.split(':')[0] : typeName;
    if (type === 'MV') {
      markerByRowNumber[String(i + 1)] = 'mvrow_' + (i + 1);
    }
  }

  for (let i = 0; i < metaRows.length; i++) {
    const source = metaRows[i] || {};
    const event = eventRows[i] || [];
    const typeName = String(event[0] || '');
    const type = typeName.indexOf(':') >= 0 ? typeName.split(':')[0] : typeName;
    const meta = Object.assign({}, source);

    if (meta.splitMvRow && !meta.splitMvId && markerByRowNumber[meta.splitMvRow]) {
      meta.splitMvId = markerByRowNumber[meta.splitMvRow];
    }
    if (meta.sellMvRow && !meta.sellMvId && markerByRowNumber[meta.sellMvRow]) {
      meta.sellMvId = markerByRowNumber[meta.sellMvRow];
    }
    if (meta.rentMvRow && !meta.rentMvId && markerByRowNumber[meta.rentMvRow]) {
      meta.rentMvId = markerByRowNumber[meta.rentMvRow];
    }
    if (meta.resolvedMvRow && !meta.resolvedMvId && markerByRowNumber[meta.resolvedMvRow]) {
      meta.resolvedMvId = markerByRowNumber[meta.resolvedMvRow];
    }
    if (type === 'MV' && !meta.mvLinkId) {
      meta.mvLinkId = markerByRowNumber[String(i + 1)] || ('mvrow_' + (i + 1));
    }

    domMetaRows.push(meta);
  }

  return domMetaRows;
}

function assertEqual(actual, expected, label, errors) {
  if (actual !== expected) {
    errors.push(label + ': expected "' + expected + '", got "' + actual + '"');
  }
}

function assertContains(text, fragment, label, errors) {
  if (String(text || '').indexOf(fragment) === -1) {
    errors.push(label + ': missing "' + fragment + '"');
  }
}

function assertParameterValues(csv, expected, errors, prefix) {
  const map = parseParameterMap(csv);
  const keys = Object.keys(expected);
  for (let i = 0; i < keys.length; i++) {
    assertEqual(map[keys[i]], expected[keys[i]], prefix + ' parameter ' + keys[i], errors);
  }
}

function getMetaCell(metaSection, rowNumber, header) {
  if (!metaSection || !metaSection.rows) return undefined;
  const row = metaSection.rows[String(rowNumber)];
  if (!row) return undefined;
  return row[header];
}

function getRowValue(rows, rowIndex, colIndex) {
  if (!Array.isArray(rows) || !Array.isArray(rows[rowIndex])) return undefined;
  return rows[rowIndex][colIndex];
}

function getRowMeta(rows, rowIndex) {
  if (!Array.isArray(rows) || !Array.isArray(rows[rowIndex])) return {};
  const row = rows[rowIndex];
  if (!row.length) return {};
  return parseMetaString(row[row.length - 1]);
}

function buildFullParameterValues() {
  return {
    StartCountry: 'aa',
    StartingAge: '30',
    TargetAge: '67',
    InitialSavings: '12000',
    InitialPension: '5000',
    RetirementAge: '65',
    EmergencyStash: '1500',
    PensionGrowthRate: '4.5',
    PensionGrowthStdDev: '6.5',
    MarriageYear: '31',
    YoungestChildBorn: '34',
    OldestChildBorn: '32',
    P2StartingAge: '29',
    P2RetirementAge: '64',
    InitialPensionP2: '7000',
    simulation_mode: 'couple',
    economy_mode: 'montecarlo',
    investmentStrategiesEnabled: 'on',
    Inflation_aa: '2.0',
    Inflation_bb: '3.0',
    Priority_cash: '1',
    Priority_pension: '2',
    Priority_funds: '3',
    Priority_shares: '4',
    InitialCapital_funds_aa: '11000',
    InitialCapital_shares_aa: '9000',
    InvestmentAllocation_aa_funds: '60',
    InvestmentAllocation_aa_shares: '40',
    StatePension_aa: '300',
    StatePension_bb: '450',
    P2StatePension_aa: '200',
    P2StatePension_bb: '250',
    P1PensionContrib_aa: '10',
    P1PensionContrib_bb: '11',
    P2PensionContrib_aa: '12',
    P2PensionContrib_bb: '13',
    PensionCapped_aa: 'Yes',
    PensionCapped_bb: 'Match',
    TaxCredit_medical_aa: '123',
    TaxCredit_medical_bb: '456',
    GlobalAssetGrowth_equity: '7.1',
    GlobalAssetVolatility_equity: '15.2',
    GlobalAssetGrowth_bond: '2.2',
    GlobalAssetVolatility_bond: '5.3',
    LocalAssetGrowth_aa_funds: '4.4',
    LocalAssetVolatility_aa_funds: '8.8',
    LocalAssetGrowth_bb_shares: '6.6',
    LocalAssetVolatility_bb_shares: '12.1',
    GlobalAllocation_equity: '70',
    GlobalAllocation_bond: '30',
    MixConfig_aa_funds_type: 'glide',
    MixConfig_aa_funds_asset1: 'equity',
    MixConfig_aa_funds_asset2: 'bond',
    MixConfig_aa_funds_startAge: '30',
    MixConfig_aa_funds_targetAge: '60',
    MixConfig_aa_funds_targetAgeOverridden: 'true',
    MixConfig_aa_funds_startAsset1Pct: '80',
    MixConfig_aa_funds_startAsset2Pct: '20',
    MixConfig_aa_funds_endAsset1Pct: '55',
    MixConfig_aa_funds_endAsset2Pct: '45',
    GlobalMixConfig_equity_type: 'fixed',
    GlobalMixConfig_equity_asset1: 'funds',
    GlobalMixConfig_equity_asset2: 'shares',
    GlobalMixConfig_equity_startAge: '30',
    GlobalMixConfig_equity_targetAge: '65',
    GlobalMixConfig_equity_targetAgeOverridden: 'false',
    GlobalMixConfig_equity_startAsset1Pct: '65',
    GlobalMixConfig_equity_startAsset2Pct: '35',
    GlobalMixConfig_equity_endAsset1Pct: '50',
    GlobalMixConfig_equity_endAsset2Pct: '50'
  };
}

function runNoRelocationCase(errors) {
  global.Config = createConfigStub({ relocationEnabled: false });

  const parameterValues = buildFullParameterValues();
  const eventRows = [
    ['SI:Salary:Alpha,Bonus', '5000', '30', '31', '0.05', '0'],
    ['E:Sparse Expense', '', '32', '', '', '']
  ];
  const eventDomRows = [
    createEventDomRow('SI', { currency: 'AAA', linkedCountry: 'aa', linkedEventId: 'ignored_group', resolved: '0' }),
    createEventDomRow('E', {})
  ];

  const doc = createParameterDocument(eventDomRows);
  global.document = doc;
  const ui = createUi(doc, eventRows);
  seedValues(ui, parameterValues);

  const csv = serializeSimulation(ui);
  assertContains(csv, 'SI,Salary:Alpha%2CBonus,5000,30,31,0.05,0', 'No-relocation serialized event name', errors);
  assertContains(csv, 'E,Sparse Expense,,32,,,', 'No-relocation sparse event row', errors);
  if (csv.indexOf('# EventMeta') !== -1) {
    errors.push('No-relocation CSV should not contain # EventMeta');
  }

  assertParameterValues(csv, {
    StartCountry: 'aa',
    InitialCapital_funds_aa: '11000',
    InitialCapital_shares_aa: '9000',
    InvestmentAllocation_aa_funds: '60',
    InvestmentAllocation_aa_shares: '40',
    GlobalAllocation_equity: '70',
    MixConfig_aa_funds_type: 'glide',
    GlobalMixConfig_equity_endAsset2Pct: '50'
  }, errors, 'No-relocation');

  const sinkDoc = createParameterDocument([]);
  global.document = sinkDoc;
  const uiSink = createUi(sinkDoc, []);
  const loadedRows = deserializeSimulation(csv, uiSink);

  assertEqual(loadedRows.length, 2, 'No-relocation row count', errors);
  assertEqual(getRowValue(loadedRows, 0, 1), 'Salary:Alpha,Bonus', 'No-relocation decoded event name', errors);
  assertEqual(getRowValue(loadedRows, 1, 2), '', 'No-relocation sparse amount', errors);
  assertEqual(uiSink.getValue('StartCountry'), 'aa', 'No-relocation StartCountry restore', errors);
  assertEqual(uiSink.getValue('InvestmentAllocation_aa_funds'), '60', 'No-relocation per-country allocation map', errors);
  assertEqual(uiSink.getValue('InvestmentAllocation_aa_shares'), '40', 'No-relocation second allocation map', errors);
  assertEqual(uiSink.getValue('GlobalAllocation_equity'), '70', 'No-relocation global allocation restore', errors);

  const reround = buildRoundTripRows(loadedRows);
  const reroundDoc = createParameterDocument([
    createEventDomRow('SI', reround.metaRows[0]),
    createEventDomRow('E', reround.metaRows[1])
  ]);
  global.document = reroundDoc;
  const reroundUi = createUi(reroundDoc, reround.eventRows);
  seedValues(reroundUi, snapshotDocumentValues(sinkDoc));
  const csv2 = serializeSimulation(reroundUi);
  if (csv !== csv2) {
    errors.push('No-relocation CSV round-trip is not idempotent');
    const lines1 = csv.split('\n');
    const lines2 = csv2.split('\n');
    const limit = Math.min(lines1.length, lines2.length);
    for (let i = 0; i < limit; i++) {
      if (lines1[i] !== lines2[i]) {
        errors.push('No-relocation first differing line ' + (i + 1) + ': expected "' + lines1[i] + '", got "' + lines2[i] + '"');
        break;
      }
    }
  }
}

function runRelocationCase(errors) {
  global.Config = createConfigStub({ relocationEnabled: true });

  const parameterValues = buildFullParameterValues();
  const eventRows = [
    ['SI:Salary:Alpha,Bonus', '5000', '30', '31', '0.05', '0'],
    ['MV:bb', '', '32', '32', '', ''],
    ['SI:Salary BB', '9000', '32', '35', '0.02', '0'],
    ['R:Property Sale', '75000', '33', '33', '', ''],
    ['RI:Rent Roll', '800', '33', '36', '', ''],
    ['MV:aa', '', '37', '37', '', ''],
    ['E:Sparse Expense', '', '38', '', '', '']
  ];
  const eventDomRows = [
    createEventDomRow('SI', { currency: 'AAA', linkedCountry: 'aa', linkedEventId: 'income_chain' }),
    createEventDomRow('MV', { mvLinkId: 'mvrow_A' }),
    createEventDomRow('SI', {
      currency: 'BBB',
      linkedCountry: 'bb',
      linkedEventId: 'income_chain',
      splitMvId: 'mvrow_A',
      splitAnchorAmount: '5000.75',
      splitValueMode: 'suggested',
      resolved: '1',
      resolvedMvId: 'mvrow_A',
      resolvedCategory: 'split'
    }),
    createEventDomRow('R', {
      currency: 'AAA',
      linkedCountry: 'aa',
      sellMvId: 'mvrow_A'
    }),
    createEventDomRow('RI', {
      currency: 'AAA',
      linkedCountry: 'aa',
      rentMvId: 'mvrow_A',
      resolved: '0'
    }),
    createEventDomRow('MV', { mvLinkId: 'mvrow_B' }),
    createEventDomRow('E', {
      currency: 'AAA',
      linkedCountry: 'aa',
      linkedEventId: 'income_chain',
      splitMvId: 'mvrow_B',
      resolved: '1',
      resolvedMvId: 'mvrow_B',
      resolvedCategory: 'manual'
    })
  ];

  const doc = createParameterDocument(eventDomRows);
  global.document = doc;
  const ui = createUi(doc, eventRows);
  seedValues(ui, parameterValues);

  const csv = serializeSimulation(ui);
  assertContains(csv, '# EventMeta', 'Relocation CSV meta section', errors);
  assertContains(csv, 'Row,Currency,LinkedCountry,LinkedRows,SplitMvRow,SplitMvId,SplitAnchorAmount,SellMvRow,SellMvId,RentMvRow,RentMvId,Resolved,ResolvedMvRow,ResolvedMvId,ResolvedCategory,SplitValueMode', 'Relocation EventMeta header', errors);
  assertContains(csv, 'MV,bb,,32,32,,', 'Relocation first MV row', errors);
  assertContains(csv, 'MV,aa,,37,37,,', 'Relocation second MV row', errors);

  assertParameterValues(csv, {
    StartCountry: 'aa',
    Inflation_bb: '3.0',
    StatePension_bb: '450',
    P2StatePension_bb: '250',
    P1PensionContrib_bb: '11',
    P2PensionContrib_bb: '13',
    PensionCapped_bb: 'Match',
    TaxCredit_medical_bb: '456',
    GlobalAssetGrowth_equity: '7.1',
    GlobalAssetVolatility_bond: '5.3',
    LocalAssetGrowth_bb_shares: '6.6',
    LocalAssetVolatility_bb_shares: '12.1',
    MixConfig_aa_funds_startAsset1Pct: '80',
    GlobalMixConfig_equity_asset2: 'shares'
  }, errors, 'Relocation');

  const meta = parseEventMetaSection(csv);
  assertEqual(getMetaCell(meta, 1, 'Currency'), 'AAA', 'Relocation meta row 1 currency', errors);
  assertEqual(getMetaCell(meta, 1, 'LinkedCountry'), 'aa', 'Relocation meta row 1 linked country', errors);
  assertEqual(getMetaCell(meta, 1, 'LinkedRows'), '1|3|7', 'Relocation meta row 1 linked rows', errors);
  assertEqual(getMetaCell(meta, 3, 'Currency'), 'BBB', 'Relocation meta row 3 currency', errors);
  assertEqual(getMetaCell(meta, 3, 'LinkedCountry'), 'bb', 'Relocation meta row 3 linked country', errors);
  assertEqual(getMetaCell(meta, 3, 'LinkedRows'), '1|3|7', 'Relocation meta row 3 linked rows', errors);
  assertEqual(getMetaCell(meta, 3, 'SplitMvRow'), '2', 'Relocation meta row 3 split MV row', errors);
  assertEqual(getMetaCell(meta, 3, 'SplitAnchorAmount'), '5000.75', 'Relocation meta row 3 split anchor amount', errors);
  assertEqual(getMetaCell(meta, 3, 'SplitValueMode'), 'suggested', 'Relocation meta row 3 split value mode', errors);
  assertEqual(getMetaCell(meta, 3, 'Resolved'), '1', 'Relocation meta row 3 resolved flag', errors);
  assertEqual(getMetaCell(meta, 3, 'ResolvedMvRow'), '2', 'Relocation meta row 3 resolved MV row', errors);
  assertEqual(getMetaCell(meta, 3, 'ResolvedCategory'), 'split', 'Relocation meta row 3 resolved category', errors);
  assertEqual(getMetaCell(meta, 4, 'SellMvRow'), '2', 'Relocation meta row 4 sell MV row', errors);
  assertEqual(getMetaCell(meta, 5, 'RentMvRow'), '2', 'Relocation meta row 5 rent MV row', errors);
  assertEqual(getMetaCell(meta, 5, 'Resolved'), '0', 'Relocation meta row 5 unresolved flag', errors);
  assertEqual(getMetaCell(meta, 7, 'SplitMvRow'), '6', 'Relocation meta row 7 second split MV row', errors);
  assertEqual(getMetaCell(meta, 7, 'ResolvedMvRow'), '6', 'Relocation meta row 7 second resolved MV row', errors);
  assertEqual(getMetaCell(meta, 7, 'ResolvedCategory'), 'manual', 'Relocation meta row 7 manual category', errors);

  const sinkDoc = createParameterDocument([]);
  global.document = sinkDoc;
  const uiSink = createUi(sinkDoc, []);
  const loadedRows = deserializeSimulation(csv, uiSink);

  assertEqual(loadedRows.length, 7, 'Relocation row count', errors);
  assertEqual(getRowValue(loadedRows, 0, 1), 'Salary:Alpha,Bonus', 'Relocation decoded event name', errors);
  assertEqual(getRowValue(loadedRows, 6, 2), '', 'Relocation sparse amount', errors);
  assertEqual(uiSink.getValue('StartCountry'), 'aa', 'Relocation StartCountry restore', errors);
  assertEqual(uiSink.getValue('InvestmentAllocation_aa_funds'), '60', 'Relocation allocation aa funds restore', errors);
  assertEqual(uiSink.getValue('InvestmentAllocation_aa_shares'), '40', 'Relocation allocation aa shares restore', errors);
  assertEqual(uiSink.getValue('StatePension_bb'), '450', 'Relocation state pension restore', errors);
  assertEqual(uiSink.getValue('P2StatePension_bb'), '250', 'Relocation P2 state pension restore', errors);
  assertEqual(uiSink.getValue('P1PensionContrib_bb'), '11', 'Relocation P1 contrib restore', errors);
  assertEqual(uiSink.getValue('P2PensionContrib_bb'), '13', 'Relocation P2 contrib restore', errors);
  assertEqual(uiSink.getValue('TaxCredit_medical_bb'), '456', 'Relocation tax credit restore', errors);
  assertEqual(uiSink.getValue('MixConfig_aa_funds_asset1'), 'equity', 'Relocation mix config restore', errors);
  assertEqual(uiSink.getValue('GlobalMixConfig_equity_asset2'), 'shares', 'Relocation global mix restore', errors);

  const row0Meta = getRowMeta(loadedRows, 0);
  const row2Meta = getRowMeta(loadedRows, 2);
  const row3Meta = getRowMeta(loadedRows, 3);
  const row4Meta = getRowMeta(loadedRows, 4);
  const row6Meta = getRowMeta(loadedRows, 6);
  assertEqual(row0Meta.currency, 'AAA', 'Relocation row 1 inline currency', errors);
  assertEqual(row0Meta.linkedCountry, 'aa', 'Relocation row 1 inline linked country', errors);
  assertEqual(row0Meta.linkedEventId, 'split_1', 'Relocation row 1 regenerated linked event id', errors);
  assertEqual(row2Meta.linkedEventId, 'split_1', 'Relocation row 3 regenerated linked event id', errors);
  assertEqual(row2Meta.splitMvRow, '2', 'Relocation row 3 split MV row in inline meta', errors);
  assertEqual(row2Meta.splitValueMode, 'suggested', 'Relocation row 3 split value mode in inline meta', errors);
  assertEqual(row2Meta.resolvedMvRow, '2', 'Relocation row 3 resolved MV row in inline meta', errors);
  assertEqual(row3Meta.sellMvRow, '2', 'Relocation row 4 sell MV row in inline meta', errors);
  assertEqual(row4Meta.rentMvRow, '2', 'Relocation row 5 rent MV row in inline meta', errors);
  assertEqual(row4Meta.resolved, '0', 'Relocation row 5 unresolved inline flag', errors);
  assertEqual(row6Meta.splitMvRow, '6', 'Relocation row 7 split MV row in inline meta', errors);
  assertEqual(row6Meta.resolvedCategory, 'manual', 'Relocation row 7 resolved category in inline meta', errors);

  const reround = buildRoundTripRows(loadedRows);
  const reroundDomMeta = buildDomMetaRows(reround.metaRows, reround.eventRows);
  const reroundDoc = createParameterDocument([
    createEventDomRow('SI', reroundDomMeta[0]),
    createEventDomRow('MV', reroundDomMeta[1]),
    createEventDomRow('SI', reroundDomMeta[2]),
    createEventDomRow('R', reroundDomMeta[3]),
    createEventDomRow('RI', reroundDomMeta[4]),
    createEventDomRow('MV', reroundDomMeta[5]),
    createEventDomRow('E', reroundDomMeta[6])
  ]);
  global.document = reroundDoc;
  const reroundUi = createUi(reroundDoc, reround.eventRows);
  seedValues(reroundUi, snapshotDocumentValues(sinkDoc));
  const csv2 = serializeSimulation(reroundUi);
  if (csv !== csv2) {
    errors.push('Relocation CSV round-trip is not idempotent');
    const lines1 = csv.split('\n');
    const lines2 = csv2.split('\n');
    const limit = Math.min(lines1.length, lines2.length);
    for (let i = 0; i < limit; i++) {
      if (lines1[i] !== lines2[i]) {
        errors.push('Relocation first differing line ' + (i + 1) + ': expected "' + lines1[i] + '", got "' + lines2[i] + '"');
        break;
      }
    }
  }
}

function runLegacyInlineMetaCase(errors) {
  global.Config = createConfigStub({ relocationEnabled: true });

  const csv = [
    '# FinSim v2.1 Save File',
    '# Parameters',
    'StartCountry,aa',
    'StartingAge,30',
    'TargetAge,40',
    'InitialSavings,500',
    'InvestmentAllocation_aa_funds,55',
    'InvestmentAllocation_aa_shares,45',
    'StatePension_bb,450',
    '',
    '# Events',
    'Type,Name,Amount,FromAge,ToAge,Rate,Extra,Meta',
    'MV,bb,,32,32,,,mvLinkId=mvrow_2',
    'SI,Legacy%2CInline,9000,32,35,0.02,0,currency=BBB;linkedCountry=bb;linkedEventId=legacy_group;splitMvId=mvrow_2;splitAnchorAmount=99.5;splitValueMode=custom;resolved=1;resolvedMvId=mvrow_2;resolvedCategory=legacy',
    'RI,Legacy Rent,700,33,36,,,currency=AAA;rentMvId=mvrow_2;resolved=0',
    'R,Legacy Sale,80000,33,33,,,currency=AAA;sellMvId=mvrow_2'
  ].join('\n');

  const sinkDoc = createParameterDocument([]);
  global.document = sinkDoc;
  const uiSink = createUi(sinkDoc, []);
  const loadedRows = deserializeSimulation(csv, uiSink);

  assertEqual(loadedRows.length, 4, 'Legacy-inline row count', errors);
  assertEqual(getRowValue(loadedRows, 1, 1), 'Legacy,Inline', 'Legacy-inline decoded name', errors);
  assertEqual(uiSink.getValue('InvestmentAllocation_aa_funds'), '55', 'Legacy-inline allocation mapping', errors);
  assertEqual(uiSink.getValue('InvestmentAllocation_aa_shares'), '45', 'Legacy-inline second allocation mapping', errors);
  assertEqual(uiSink.getValue('StatePension_bb'), '450', 'Legacy-inline state pension restore', errors);

  const row1Meta = getRowMeta(loadedRows, 1);
  const row2Meta = getRowMeta(loadedRows, 2);
  const row3Meta = getRowMeta(loadedRows, 3);
  assertEqual(row1Meta.currency, 'BBB', 'Legacy-inline currency restore', errors);
  assertEqual(row1Meta.linkedCountry, 'bb', 'Legacy-inline linked country restore', errors);
  assertEqual(row1Meta.linkedEventId, 'legacy_group', 'Legacy-inline linked event id restore', errors);
  assertEqual(row1Meta.splitMvId, 'mvrow_2', 'Legacy-inline split MV id restore', errors);
  assertEqual(row1Meta.splitValueMode, 'custom', 'Legacy-inline split value mode restore', errors);
  assertEqual(row1Meta.resolvedMvId, 'mvrow_2', 'Legacy-inline resolved MV id restore', errors);
  assertEqual(row1Meta.resolvedCategory, 'legacy', 'Legacy-inline resolved category restore', errors);
  assertEqual(row2Meta.rentMvId, 'mvrow_2', 'Legacy-inline rent MV id restore', errors);
  assertEqual(row2Meta.resolved, '0', 'Legacy-inline unresolved flag restore', errors);
  assertEqual(row3Meta.sellMvId, 'mvrow_2', 'Legacy-inline sell MV id restore', errors);

  const reround = buildRoundTripRows(loadedRows);
  const reroundDomMeta = buildDomMetaRows(reround.metaRows, reround.eventRows);
  const reroundDoc = createParameterDocument([
    createEventDomRow('MV', reroundDomMeta[0]),
    createEventDomRow('SI', reroundDomMeta[1]),
    createEventDomRow('RI', reroundDomMeta[2]),
    createEventDomRow('R', reroundDomMeta[3])
  ]);
  global.document = reroundDoc;
  const reroundUi = createUi(reroundDoc, reround.eventRows);
  seedValues(reroundUi, snapshotDocumentValues(sinkDoc));
  const csv2 = serializeSimulation(reroundUi);
  const meta = parseEventMetaSection(csv2);
  assertContains(csv2, '# EventMeta', 'Legacy-inline reserialize emits EventMeta section', errors);
  assertEqual(getMetaCell(meta, 2, 'SplitMvRow'), '1', 'Legacy-inline row 2 split MV row reserialized', errors);
  assertEqual(getMetaCell(meta, 2, 'ResolvedMvRow'), '1', 'Legacy-inline row 2 resolved MV row reserialized', errors);
  assertEqual(getMetaCell(meta, 2, 'ResolvedCategory'), 'legacy', 'Legacy-inline row 2 resolved category reserialized', errors);
  assertEqual(getMetaCell(meta, 3, 'RentMvRow'), '1', 'Legacy-inline row 3 rent MV row reserialized', errors);
  assertEqual(getMetaCell(meta, 4, 'SellMvRow'), '1', 'Legacy-inline row 4 sell MV row reserialized', errors);
}

function runMatrixCase(caseName, errors, fn) {
  var caseErrors = [];
  try {
    fn(caseErrors);
  } catch (err) {
    caseErrors.push(err && err.message ? err.message : String(err));
  }
  for (var i = 0; i < caseErrors.length; i++) {
    errors.push('[' + caseName + '] ' + caseErrors[i]);
  }
}

module.exports = {
  name: 'C_H-CSV-ROUNDTRIP',
  description: 'Authoritative CSV round-trip matrix for modern, relocation, and legacy-inline persistence contracts.',
  category: 'confidence',
  isCustomTest: true,
  async runCustomTest() {
    const originalDocument = global.document;
    const originalConfig = global.Config;
    const errors = [];

    try {
      runMatrixCase('Relocation disabled behavior', errors, runNoRelocationCase);
      runMatrixCase('Relocation enabled behavior', errors, runRelocationCase);
      runMatrixCase('Legacy inline meta compatibility', errors, runLegacyInlineMetaCase);
    } finally {
      global.document = originalDocument;
      global.Config = originalConfig;
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
