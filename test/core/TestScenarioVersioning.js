// Test suite for verifying scenario file versioning, loading old formats, and saving new formats.

console.log('Loading TestScenarioVersioning.js');

function runScenarioVersioningTests(testFramework) {
    if (!testFramework) {
        console.error('Test framework is not available. Skipping TestScenarioVersioning tests.');
        return;
    }

    const { describe, it, beforeEach, afterEach, assert } = testFramework;
    // We need access to serializeSimulation and deserializeSimulation directly
    // These are global functions defined in Utils.js, which should be loaded in the test environment.

    describe('Scenario Versioning Tests', () => {

        let mockUi;
        let setValueSpy;
        let showOldScenarioWarningSpy;
        let getTableDataSpy;
        let isPercentageSpy;
        let isBooleanSpy;

        const CURRENT_SCENARIO_VERSION_STRING = "1.27";
        const CURRENT_SCENARIO_VERSION_NUMBER = 1.27;

        beforeEach(() => {
            // Reset spies and mockUi for each test
            setValueSpy = {}; // Store calls to setValue: { key: value }
            showOldScenarioWarningSpy = { called: false, version: null };
            getTableDataSpy = () => []; // Default to no events
            isPercentageSpy = () => false; // Default
            isBooleanSpy = () => false; // Default

            mockUi = {
                getValue: (key) => { // Used by serializeSimulation
                    // Provide some default values for saving tests if needed, or set them per test
                    return mockUi.paramsToSave ? mockUi.paramsToSave[key] : '';
                },
                setValue: (key, value) => { // Used by deserializeSimulation
                    setValueSpy[key] = value;
                },
                showOldScenarioWarning: (version) => { // Used by deserializeSimulation
                    showOldScenarioWarningSpy.called = true;
                    showOldScenarioWarningSpy.version = version;
                },
                getTableData: (tableName, numCols) => { // Used by serializeSimulation
                    return getTableDataSpy(tableName, numCols);
                },
                isPercentage: (key) => {
                    return isPercentageSpy(key);
                },
                isBoolean: (key) => {
                    return isBooleanSpy(key);
                },
                paramsToSave: {} // For serialize tests
            };
            console.log("ScenarioVersioningTests: beforeEach completed.");
        });

        afterEach(() => {
            console.log("ScenarioVersioningTests: afterEach completed.");
        });

        it('should correctly load parameters from an old version scenario (v1.0, no P2 fields)', () => {
            const oldFileVersion = 1.0;
            const oldScenarioCsv = 
`# Ireland Financial Simulator v${oldFileVersion} Save File
# Parameters
StartingAge,30
TargetAge,90
InitialSavings,10000
RetirementAge,65
StatePensionWeekly,250
Inflation,0.02
# Events
Type,Name,Amount,FromAge,ToAge,Rate,Extra
SI,Salary,60000,30,64,,
E,Living Costs,20000,30,89,,
`;

            const eventData = deserializeSimulation(oldScenarioCsv, mockUi);

            assert(setValueSpy['StartingAge'] === '30', 'P1 Starting Age should be loaded');
            assert(setValueSpy['InitialSavings'] === '10000', 'P1 InitialSavings should be loaded');
            assert(setValueSpy['P2StartingAge'] === undefined, 'P2 Starting Age should be undefined');
            assert(setValueSpy['P2RetirementAge'] === undefined, 'P2 Retirement Age should be undefined');
            assert(setValueSpy['InitialPensionP2'] === undefined, 'InitialPensionP2 should be undefined');

            assert(showOldScenarioWarningSpy.called === true, 'showOldScenarioWarning should have been called');
            assert(showOldScenarioWarningSpy.version === oldFileVersion, `Warning should be for version ${oldFileVersion}`);

            assert(eventData.length === 2, 'Should parse 2 events');
            assert(eventData[0][0] === 'SI' && eventData[0][1] === 'Salary', 'Correctly parsed first event');
            assert(eventData[1][0] === 'E' && eventData[1][1] === 'Living Costs', 'Correctly parsed second event');
            console.log("Test: loading old scenario (v1.0) completed.");
        });

        it('should correctly load parameters from the current version scenario (v1.27)', () => {
            const scenarioCsv_v1_27 = 
`# Ireland Financial Simulator v${CURRENT_SCENARIO_VERSION_STRING} Save File
# Parameters
StartingAge,35
P2StartingAge,33
TargetAge,95
InitialSavings,20000
RetirementAge,66
P2RetirementAge,64
StatePensionWeekly,260
P2StatePensionWeekly,240
InitialPensionP2,5000
Inflation,0.025
# Events
Type,Name,Amount,FromAge,ToAge,Rate,Extra
SI,P1 Salary,70000,35,65,,
SInp,P2 Salary,50000,33,63,,
`;
            const eventData = deserializeSimulation(scenarioCsv_v1_27, mockUi);

            assert(setValueSpy['StartingAge'] === '35', 'P1 Starting Age should be loaded');
            assert(setValueSpy['P2StartingAge'] === '33', 'P2 Starting Age should be loaded');
            assert(setValueSpy['InitialPensionP2'] === '5000', 'P2 Initial Pension should be loaded');
            assert(setValueSpy['P2StatePensionWeekly'] === '240', 'P2 State Pension Weekly should be loaded');

            assert(showOldScenarioWarningSpy.called === false, 'showOldScenarioWarning should NOT have been called');

            assert(eventData.length === 2, 'Should parse 2 events from v1.27');
            assert(eventData[0][0] === 'SI' && eventData[0][1] === 'P1 Salary', 'Correctly parsed first event v1.27');
            console.log("Test: loading current version scenario (v1.27) completed.");
        });

        it('should save a scenario with the current version string (${CURRENT_SCENARIO_VERSION_STRING}) and all P2 fields', () => {
            mockUi.paramsToSave = {
                StartingAge: '40',
                P2StartingAge: '38',
                TargetAge: '90',
                InitialSavings: '15000',
                RetirementAge: '67',
                P2RetirementAge: '66',
                StatePensionWeekly: '270',
                P2StatePensionWeekly: '250',
                InitialPensionP2: '10000',
                PensionContributionPercentageP2: '0.10',
                Inflation: '0.01'
                // Add other fields that serializeSimulation expects from ui.getValue
            };
            getTableDataSpy = (tableName, numCols) => {
                if (tableName === 'Events') {
                    return [
                        ['SI:P1 Work', '80000', '40', '66', '', ''],
                        ['SInp:P2 Work', '60000', '38', '65', '', '']
                    ];
                }
                return [];
            };
            isPercentageSpy = (key) => key === 'PensionContributionPercentageP2' || key === 'Inflation';

            const savedCsv = serializeSimulation(mockUi);
            const lines = savedCsv.split('\n');

            assert(lines[0] === `# Ireland Financial Simulator v${CURRENT_SCENARIO_VERSION_STRING} Save File`, `First line should be version header v${CURRENT_SCENARIO_VERSION_STRING}`);
            
            let paramsFromCsv = {};
            let inParamsSection = false;
            for (const line of lines) {
                if (line.startsWith('# Parameters')) { inParamsSection = true; continue; }
                if (line.startsWith('# Events')) { inParamsSection = false; break; }
                if (inParamsSection && line) {
                    const [key, value] = line.split(',');
                    paramsFromCsv[key] = value;
                }
            }

            assert(paramsFromCsv['StartingAge'] === '40', 'Saved P1 Starting Age correct');
            assert(paramsFromCsv['P2StartingAge'] === '38', 'Saved P2 Starting Age correct');
            assert(paramsFromCsv['InitialPensionP2'] === '10000', 'Saved InitialPensionP2 correct');
            assert(paramsFromCsv['PensionContributionPercentageP2'] === '10.00%', 'Saved P2 Pension Contribution Percentage correct and formatted');
            assert(paramsFromCsv['Inflation'] === '1.00%', 'Saved Inflation correct and formatted');

            const eventHeaderIndex = lines.findIndex(line => line === 'Type,Name,Amount,FromAge,ToAge,Rate,Extra');
            assert(eventHeaderIndex > -1, "Event header should exist");
            assert(lines[eventHeaderIndex + 1].startsWith('SI,P1 Work'), "First event saved correctly");
            assert(lines[eventHeaderIndex + 2].startsWith('SInp,P2 Work'), "Second event saved correctly");
            console.log("Test: saving scenario (v1.27) completed.");
        });

        it('should throw an error for an unrecognized file format (no version header)', () => {
            const badScenarioCsv = 
`# This is not a valid simulator file
SomeKey,SomeValue
`;
            let errorThrown = false;
            try {
                deserializeSimulation(badScenarioCsv, mockUi);
            } catch (e) {
                errorThrown = true;
                assert(e.message === 'Invalid or unrecognized scenario file format.', 'Correct error message for bad format');
            }
            assert(errorThrown === true, 'Error should have been thrown for bad format');
            console.log("Test: unrecognized file format completed.");
        });

        it('should correctly handle legacy field names during load (e.g., InitialETFs to InitialFunds)', () => {
            const legacyFileVersion = 1.1; // A version that might have used legacy names
            const legacyScenarioCsv = 
`# Ireland Financial Simulator v${legacyFileVersion} Save File
# Parameters
StartingAge,25
InitialETFs,5000
EtfAllocation,0.6
# Events
Type,Name,Amount,FromAge,ToAge,Rate,Extra
E,Costs,1000,25,80,,
`;
            deserializeSimulation(legacyScenarioCsv, mockUi);

            assert(setValueSpy['StartingAge'] === '25', 'StartingAge from legacy should be loaded');
            assert(setValueSpy['InitialFunds'] === '5000', 'InitialETFs should be mapped to InitialFunds');
            assert(setValueSpy['InitialETFs'] === undefined, 'Original InitialETFs key should not be set');
            assert(setValueSpy['FundsAllocation'] === '0.6', 'EtfAllocation should be mapped to FundsAllocation');

            assert(showOldScenarioWarningSpy.called === true, 'showOldScenarioWarning should be called for legacy file');
            assert(showOldScenarioWarningSpy.version === legacyFileVersion, `Warning should be for version ${legacyFileVersion}`);
            console.log("Test: loading legacy field names completed.");
        });

        // Test for event name with comma encoding/decoding
        it('should correctly handle event names with commas (encode on save, decode on load)', () => {
            const eventNameWithComma = "Groceries, monthly";
            const encodedEventName = "Groceries%2C monthly";

            // Test Save (serialize)
            mockUi.paramsToSave = { StartingAge: '30' }; // Minimal params for saving
            getTableDataSpy = (tableName, numCols) => {
                if (tableName === 'Events') {
                    return [
                        [`E:${eventNameWithComma}`, '300', '30', '90', '', '']
                    ];
                }
                return [];
            };
            const savedCsv = serializeSimulation(mockUi);
            const lines = savedCsv.split('\n');
            const eventLine = lines.find(line => line.startsWith('E,'));
            assert(eventLine && eventLine.includes(encodedEventName), 'Event name with comma should be URL encoded on save');

            // Test Load (deserialize)
            const csvToLoad = 
`# Ireland Financial Simulator v${CURRENT_SCENARIO_VERSION_STRING} Save File
# Parameters
StartingAge,30
# Events
Type,Name,Amount,FromAge,ToAge,Rate,Extra
E,${encodedEventName},300,30,90,,
`;
            const eventData = deserializeSimulation(csvToLoad, mockUi);
            assert(eventData.length === 1, "Should parse 1 event for comma test");
            assert(eventData[0][1] === eventNameWithComma, "Event name with comma should be decoded on load");
            console.log("Test: event name comma handling completed.");
        });

    });
}

if (typeof TestFramework !== 'undefined' && TestFramework.registerTestGroup) {
    TestFramework.registerTestGroup('ScenarioVersioning', runScenarioVersioningTests);
} else {
    console.log('TestScenarioVersioning.js loaded - TestFramework not detected for registration.');
} 