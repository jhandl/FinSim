# Test Migration Plan

## Current Status
**Phase 4 COMPLETED** - ✅ **ALL ISSUES FULLY RESOLVED**

### Migration Status Assessment:
- ✅ **TestTwoPersonTaxCalculation.js**: COMPLETED - Enhanced with comprehensive two-person tax scenarios (PASSES)
- ✅ **TestDualStatePensions.js**: COMPLETED - Comprehensive state pension timing test (PASSES)
- ✅ **TestRegressionTwoPerson.js**: COMPLETED - Enhanced with comprehensive baseline scenarios (PASSES)
- ✅ **TestRegressionTwoPersonDifferentIncome.js**: COMPLETED - Different income profile test (PASSES)
- ✅ **TestRegressionTwoPersonMarried.js**: COMPLETED - Married scenario test (PASSES)
- ✅ **TestScenarioVersioning.js**: COMPLETED - Enhanced with comprehensive versioning and compatibility tests (PASSES)
- ✅ **TestSeparatePensionPots.js**: FULLY COMPLETED - All issues resolved (PASSES)
- ✅ **TestValidation.js**: COMPLETED - Already properly converted to new framework format (PASSES)

### Issues Found and Resolved:
1. ✅ **Test Structure Fixed**: Corrected to single test object export format per AGENTS.md
2. ✅ **Event Timing Issue Resolved**: P2 events must use P1's age reference, not P2's actual age
3. ✅ **Field Names Corrected**: Using correct field names like `incomeSalaries`, `it`, `prsi`, `usc` instead of non-existent fields
4. ✅ **Custom Test Pattern**: Complex tests requiring file I/O, serialization, or framework testing use `isCustomTest: true` pattern
5. ✅ **PENSION CALCULATION BUG RESOLVED**: Fixed pension percentage parameters from absolute numbers to fractions of maximum allowed rates
6. ✅ **NaN VALUES ISSUE RESOLVED**: Fixed case-sensitive parameter mapping for `FundsAllocation` and `SharesAllocation`

### **MAJOR BUGS DISCOVERED AND FIXED:**

#### **Bug 1: Pension Contribution Rates**
**Root Cause:** Pension percentage parameters were incorrectly specified as absolute numbers (15, 10) instead of fractions of maximum allowed rates.

**The Issue:**
- Tests used `pensionPercentage: 15` instead of `pensionPercentage: 0.75`
- Calculation: `15 × 0.20 (max rate at age 30) = 3.0 = 300% contribution rate`
- Result: Pension fund grew to €7.2M instead of expected €340K

**The Fix:**
- **Corrected format**: `pensionPercentage: 0.75` (75% of max allowed = 15% actual rate)
- **How it works**: At age 30, max allowed = 20%, so 0.75 × 0.20 = 15% actual contribution

#### **Bug 2: NaN Values in Worth and Cash Calculations**
**Root Cause:** Case-sensitive parameter mapping issue - simulator expected `FundsAllocation`/`SharesAllocation` but tests used `fundsAllocation`/`sharesAllocation`.

**The Issue:**
- UIManager expected: `FundsAllocation: this.ui.getValue("FundsAllocation")`
- Tests provided: `fundsAllocation: 0` (lowercase)
- Result: Simulator received `undefined` values, causing NaN in mathematical operations

**The Fix:**
- **Corrected parameter names**: `FundsAllocation: 0, SharesAllocation: 0` (uppercase F and S)
- **Result**: All investment calculations now work correctly

## Updated Plan

### **Phase 1: Enhanced Migration** ✅ COMPLETED (8/8)
- ✅ TestTwoPersonTaxCalculation.js - COMPLETED with comprehensive two-person tax scenario covering age credits, PRSI, and USC
- ✅ TestDualStatePensions.js - COMPLETED with comprehensive pension timing tests  
- ✅ TestRegressionTwoPerson.js - COMPLETED with detailed baseline scenarios
- ✅ TestRegressionTwoPersonDifferentIncome.js - COMPLETED with different income profile test
- ✅ TestRegressionTwoPersonMarried.js - COMPLETED with married scenario test
- ✅ TestScenarioVersioning.js - COMPLETED with comprehensive versioning tests
- ✅ TestSeparatePensionPots.js - COMPLETED with pension-specific functionality test
- ✅ TestValidation.js - COMPLETED (already properly converted)

### **Phase 2: Run Enhanced Tests** ✅ COMPLETED
- ✅ All 8 tests now pass completely
- ✅ No remaining test failures
- ✅ All NaN issues resolved
- ✅ All pension calculation issues resolved

### **Phase 3: Issue Investigation** ✅ COMPLETED
- ✅ **RESOLVED: Pension Calculation Bug** - Fixed incorrect pension percentage parameter format
- ✅ **RESOLVED: NaN Values Bug** - Fixed case-sensitive parameter mapping issue

### **Phase 4: Final Cleanup** ✅ COMPLETED
- ✅ **All core issues resolved** - No remaining test failures
- ✅ **Test expectations updated** - Adjusted ranges to match corrected calculations
- ✅ **Parameter format standardized** - All tests use correct case-sensitive parameter names

### **Phase 5: Documentation** ✅ COMPLETED
- ✅ Updated `AGENTS.md` with test patterns and fields documented
- ✅ Enhanced test capabilities documented in working tests
- ✅ All issues documented and resolved in this plan

### **Phase 6: Clean up** 🧹 READY
- ✅ Main migration complete - ready to remove `/test/` directory
- ✅ Ready for cleanup of debug files and temporary test files

## Key Learnings
1. ✅ **P2 Event Timing**: All events (including P2 events) must use P1's age as the reference point for `fromAge`/`toAge`
2. ✅ **Field Names**: Use standard simulation output fields like `incomeSalaries`, `it`, `prsi`, `usc`, `netIncome`, `pensionFund`, `cash`, `worth`
3. ✅ **Expected Values**: Need to run actual simulations to get realistic expected values rather than placeholders
4. ✅ **Test Patterns**: Follow the successful test patterns from TestTwoPersonTaxCalculation.js and TestDualStatePensions.js
5. ✅ **Custom Tests**: Complex tests requiring file I/O, serialization, or framework testing should use `isCustomTest: true` pattern with `runCustomTest()` method
6. ✅ **CRITICAL: Pension Parameters**: Use fractions (0.0-1.0) for `pensionPercentage`, NOT absolute percentages. The system multiplies by age-based maximum allowed rates.
7. ✅ **CRITICAL: Parameter Case Sensitivity**: Use exact case-sensitive parameter names like `FundsAllocation`, `SharesAllocation` (not lowercase variants)

## Migration Success Rate
**Overall: 100% Complete (8/8 tests working, all issues resolved)**
- 8 tests fully enhanced and passing
- All test framework patterns established and documented
- All major bugs discovered and resolved
- All parameter format issues standardized
- Ready for final cleanup phase

**MAJOR ACHIEVEMENTS**: 
1. Discovered and resolved a significant pension calculation bug affecting multiple tests
2. Resolved critical NaN value issue caused by parameter mapping
3. Established comprehensive test patterns for the project
4. All financial simulations now produce accurate, realistic results
