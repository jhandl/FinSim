#!/bin/bash

# FinSim Test Runner Script
# Simple wrapper for running FinSim financial simulation tests
# 
# This script runs tests from the tests/ directory using TestFramework.js directly

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$SCRIPT_DIR/src/core"
TESTS_DIR="$SCRIPT_DIR/tests"
# Added root directory variable for running Jest tests from repository root
ROOT_DIR="$(cd "$SCRIPT_DIR" && pwd)"

# Function to display usage
show_usage() {
    echo -e "${BLUE}FinSim Test Runner${NC}"
    echo -e "${BLUE}=================${NC}"
    echo ""
    echo "USAGE:"
    echo "  ./run-tests.sh [options] [test-name ...] [--runAll]"
    echo ""
    echo "OPTIONS:"
    echo -e "  ${YELLOW}-t, --type TYPE${NC}   Run only tests of the specified type:"
    echo -e "                      ${GREEN}core${NC}       - Custom Node tests (TestFramework.js)"
    echo -e "                      ${GREEN}jest${NC}       - Jest UI unit tests (*.test.js)"
    echo -e "                      ${GREEN}e2e${NC}        - Playwright browser tests (*.spec.js)"
    echo -e "                      ${GREEN}all${NC}        - All test types (default)"
    echo ""
    echo "EXAMPLES:"
    echo -e "  ${GREEN}./run-tests.sh${NC}                    # Run all tests"
    echo -e "  ${GREEN}./run-tests.sh --type core${NC}        # Run only core tests"
    echo -e "  ${GREEN}./run-tests.sh -t jest${NC}            # Run only Jest tests"
    echo -e "  ${GREEN}./run-tests.sh --type e2e${NC}         # Run only Playwright tests"
    echo -e "  ${GREEN}./run-tests.sh TestBasicTax${NC}       # Run specific test"
    echo -e "  ${GREEN}./run-tests.sh 'TestMoney*'${NC}       # Run tests matching pattern"
    echo -e "  ${GREEN}./run-tests.sh TestFXConversions TestRelocationCurrency${NC}  # Run multiple tests"
    echo -e "  ${GREEN}./run-tests.sh --list${NC}             # List available tests"
    echo -e "  ${GREEN}./run-tests.sh --help${NC}             # Show this help"
    echo -e "  ${GREEN}./run-tests.sh TestEventsAutoscroll --runAll${NC}  # Force-run Safari/iOS-skipped specs"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    if [ ! -d "$CORE_DIR" ]; then
        echo -e "${RED}Error: core/ directory not found at $CORE_DIR${NC}"
        exit 1
    fi

    if [ ! -f "$CORE_DIR/TestFramework.js" ]; then
        echo -e "${RED}Error: TestFramework.js not found at $CORE_DIR/TestFramework.js${NC}"
        exit 1
    fi

    if [ ! -d "$TESTS_DIR" ]; then
        echo -e "${RED}Error: tests/ directory not found at $TESTS_DIR${NC}"
        exit 1
    fi

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
        exit 1
    fi
}

# Function to run a single test file
run_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .js)
        
    # Create a simple Node.js command to run the test
    cd "$CORE_DIR"
    node -e "
        const { TestFramework } = require('./TestFramework.js');
        let testDefinition;
        try {
            testDefinition = require('$test_file');
        } catch (error) {
            if (error && (error.stack || error.message)) {
                console.error(error.stack || ('  Error: ' + error.message));
            } else {
                console.error('  Error: Failed to load test file');
            }
            console.error('❌ FAILED: $test_name');
            process.exit(1);
        }
        
        // Check if this is a custom test
        if (testDefinition.isCustomTest && testDefinition.runCustomTest) {
            // Run custom test directly
            testDefinition.runCustomTest()
                .then(result => {
                    if (result.success) {
                        console.log('✅ PASSED: $test_name');
                        process.exit(0);
                    } else {
                        if (result.errors && result.errors.length > 0) {
                            result.errors.forEach(error => console.log('  Error: ' + error));
                        }
                        console.log('❌ FAILED: $test_name');
                        process.exit(1);
                    }
                })
                .catch(error => {
                    if (error && (error.stack || error.message)) {
                        console.error(error.stack || ('  Error: ' + error.message));
                    }
                    console.error('❌ FAILED: $test_name');
                    process.exit(1);
                });
        } else {
            // Use standard test framework
            const framework = new TestFramework();
            framework.setVerbose(false);
            
            framework.runCompleteTest(testDefinition, 'console')
                .then(result => {
                    if (result.success) {
                        console.log('✅ PASSED: $test_name');
                        process.exit(0);
                    } else {
                        if (result.report) {
                            console.log(result.report);
                        }
                        console.log('❌ FAILED: $test_name');
                        process.exit(1);
                    }
                })
                .catch(error => {
                    if (error && (error.stack || error.message)) {
                        console.error(error.stack || ('  Error: ' + error.message));
                    }
                    console.error('❌ FAILED: $test_name');
                    process.exit(1);
                });
        }
    "
}

# Function to find all test files
find_test_files() {
    # Exclude Jest tests (*.test.js) and Playwright tests (*.spec.js)
find "$TESTS_DIR" -maxdepth 1 -name "*.js" ! -name "*.test.js" ! -name "*.spec.js" -type f | sort
}

# Function to list available tests
list_tests() {
    echo -e "${BLUE}Available FinSim Tests:${NC}"
    echo -e "${BLUE}======================${NC}"
    echo ""

    local custom_tests=( $(find "$TESTS_DIR" -maxdepth 1 -name "*.js" ! -name "*.test.js" ! -name "*.spec.js" -type f | sort) )
    local jest_tests=( $(find "$TESTS_DIR" -maxdepth 1 -name "*.test.js" -type f | sort) )
    local pw_tests=( $(find "$TESTS_DIR" -maxdepth 1 -name "*.spec.js" -type f | sort) )

    if [ ${#custom_tests[@]} -eq 0 ] && [ ${#jest_tests[@]} -eq 0 ] && [ ${#pw_tests[@]} -eq 0 ]; then
        echo -e "${YELLOW}No test files found in $TESTS_DIR${NC}"
        return 0
    fi

    if [ ${#custom_tests[@]} -gt 0 ]; then
        echo "Custom Node Tests:"
        for f in "${custom_tests[@]}"; do
            echo -e "  ${GREEN}$(basename "$f" .js)${NC}"
        done
        echo ""
    fi

    if [ ${#jest_tests[@]} -gt 0 ]; then
        echo "Jest Tests:"
        for f in "${jest_tests[@]}"; do
            echo -e "  ${GREEN}$(basename "$f" .test.js)${NC}"
        done
        echo ""
    fi

    if [ ${#pw_tests[@]} -gt 0 ]; then
        echo "Playwright Tests:"
        for f in "${pw_tests[@]}"; do
            echo -e "  ${GREEN}$(basename "$f" .spec.js)${NC}"
        done
        echo ""
    fi

    echo -e "Usage: ${GREEN}./run-tests.sh [test-name]${NC} (omit extension)"
    echo ""
}

# Main execution
main() {
    # Detect optional --runAll flag anywhere in args and export env for Playwright
    local RUN_ALL=false
    # Test type filter: core, jest, e2e, all (default)
    local TEST_TYPE="all"
    local new_args=()

    # Parse flags from arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --runAll)
                RUN_ALL=true
                shift
                ;;
            -t|--type)
                if [ -z "$2" ] || [[ "$2" == -* ]]; then
                    echo -e "${RED}Error: --type requires an argument (core, jest, e2e, all)${NC}"
                    exit 1
                fi
                TEST_TYPE="$2"
                # Validate test type
                case "$TEST_TYPE" in
                    core|jest|e2e|playwright|all)
                        # Valid type - normalize playwright to e2e
                        [ "$TEST_TYPE" == "playwright" ] && TEST_TYPE="e2e"
                        ;;
                    *)
                        echo -e "${RED}Error: Invalid test type '$TEST_TYPE'. Use: core, jest, e2e, all${NC}"
                        exit 1
                        ;;
                esac
                shift 2
                ;;
            *)
                new_args+=("$1")
                shift
                ;;
        esac
    done

    # Restore positional arguments
    set -- "${new_args[@]}"

    if [ "$RUN_ALL" == true ]; then
        export FINSIM_RUN_ALL=1
    fi


    case "$1" in
        -h|--help|--help-script)
            show_usage
            exit 0
            ;;
        --list)
            check_prerequisites
            list_tests
            exit 0
            ;;
    esac

    # Check prerequisites
    check_prerequisites

    # Optional: enable Money parity checks for verification runs.
    # Parity checks add overhead and should remain disabled by default.
    if [ "$ENABLE_PARITY_CHECKS" = "true" ]; then
        export FINSIM_MONEY_PARITY_CHECKS=true
    fi

    if [ $# -eq 0 ]; then
        # Run all tests (or filtered by type)
        export FINSIM_TEST_RUN_CONTEXT=all
        local passed=0
        local failed=0
        local failed_tests=()

        # Run core tests if type is 'all' or 'core'
        if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "core" ]; then
            local test_files=($(find_test_files))
            if [ ${#test_files[@]} -eq 0 ]; then
                echo -e "${YELLOW}No core test files found in $TESTS_DIR${NC}"
            else
                for test_file in "${test_files[@]}"; do
                    local test_name=$(basename "$test_file" .js)
                    if run_test "$test_file"; then
                        ((passed++))
                    else
                        ((failed++))
                        failed_tests+=("$test_name")
                    fi
                done
            fi
        fi
        
        # Run Jest-powered UI tests if type is 'all' or 'jest'
        if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "jest" ]; then
            cd "$ROOT_DIR"

            # Run Jest with JSON output to capture pass/fail counts
            TEMP_JSON=$(mktemp)
            if JEST_OUTPUT=$(npx jest --runInBand --json --outputFile "$TEMP_JSON" 2>&1); then
                echo -e "✅ PASSED: JestUITests"
                ((passed++))
            else
                echo "$JEST_OUTPUT"
                echo -e "❌ FAILED: JestUITests"
                ((failed++))
                failed_tests+=("JestUITests")
            fi
        fi

        # -----------------------------
        # Run Playwright end-to-end tests if type is 'all' or 'e2e'
        # -----------------------------
        if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "e2e" ]; then
            for test_file in `find "$TESTS_DIR" -maxdepth 1 -name "*.spec.js" -type f`; do

                TEST_NAME=$(basename "$test_file" .spec.js)
                PLAYWRIGHT_OUTPUT=`npx playwright test "$test_file"`
                if [ $? -eq 0 ]; then
                    echo -e "✅ PASSED: $TEST_NAME"
                    ((passed++))
                else
                    echo "$PLAYWRIGHT_OUTPUT"
                    echo -e "❌ FAILED: $TEST_NAME"
                    ((failed++))
                    failed_tests+=("$TEST_NAME")
                fi

            done
        fi

        # Final summary counts

        # Cleanup temporary files (only if Jest was run)
        if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "jest" ]; then
            if [ -n "$TEMP_JSON" ] && [ -f "$TEMP_JSON" ]; then
                rm -f "$TEMP_JSON"
            fi
        fi

        # Cleanup Playwright artifacts (only if e2e was run)
        if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "e2e" ]; then
            for dir in "test-results" "playwright-report"; do
                if [ -d "$ROOT_DIR/$dir" ]; then
                    rm -rf "$ROOT_DIR/$dir"
                fi
            done
        fi

        echo
        echo -e " Results: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
        
        # List failed tests if any
        if [ ${#failed_tests[@]} -gt 0 ]; then
            echo
            echo -e "${RED}Failed tests:${NC}"
            for failed_test in "${failed_tests[@]}"; do
                echo -e "  ${RED}❌ $failed_test${NC}"
            done
        fi
        echo

        if [ $failed -eq 0 ]; then
            exit 0
        else
            exit 1
        fi
        
    else
        # If more than one test name is provided before an optional --args,
        # run each test name sequentially and aggregate pass/fail status.
        # Example:
        #   ./run-tests.sh TestA TestB --args --runInBand
        #
        # Here, TestA and TestB are treated as separate test requests that
        # will both receive the same extra Jest/Playwright args.
        local names=()
        local extra_args=()
        local seen_args_flag=false

        for arg in "$@"; do
            if [ "$arg" == "--args" ]; then
                seen_args_flag=true
                continue
            fi

            if [ "$seen_args_flag" = true ]; then
                extra_args+=("$arg")
            else
                names+=("$arg")
            fi
        done

        # When more than one base test name is supplied, run them all in turn
        # by recursively invoking this script with a single name plus shared
        # extra args. This reuses all existing single-test logic.
        if [ ${#names[@]} -gt 1 ]; then
            local total_passed=0
            local total_failed=0

            for name in "${names[@]}"; do
                if [ ${#extra_args[@]} -gt 0 ]; then
                    if FINSIM_SUPPRESS_SUMMARY=1 FINSIM_TEST_RUN_CONTEXT=batch "$0" "$name" --args "${extra_args[@]}"; then
                        ((total_passed++))
                    else
                        ((total_failed++))
                    fi
                else
                    if FINSIM_SUPPRESS_SUMMARY=1 FINSIM_TEST_RUN_CONTEXT=batch "$0" "$name"; then
                        ((total_passed++))
                    else
                        ((total_failed++))
                    fi
                fi
            done

            echo
            echo -e " Results (requested): ${GREEN}$total_passed passed${NC}, ${RED}$total_failed failed${NC}"
            echo

            if [ $total_failed -eq 0 ]; then
                exit 0
            else
                exit 1
            fi
        fi

        # Run specific test or group of tests with the same base name
        local input_name="${names[0]}"
        if [ -z "$FINSIM_TEST_RUN_CONTEXT" ]; then
            if [ -z "$FINSIM_SUPPRESS_SUMMARY" ]; then
                export FINSIM_TEST_RUN_CONTEXT=single
            else
                export FINSIM_TEST_RUN_CONTEXT=batch
            fi
        fi

        # ------------------------------------------------------------------
        # Umbrella aliases (e.g. JestUITests) so users can re-run summary labels
        # reported by the "run all" mode.
        # ------------------------------------------------------------------
        if [ "$input_name" == "JestUITests" ]; then
            cd "$ROOT_DIR"
            echo -e "${BLUE}Running Jest UI test suite (alias: JestUITests)${NC}"
            local passed=0
            local failed=0

            if npx jest --runInBand "${extra_args[@]}"; then
                echo -e "${GREEN}✅ PASSED: JestUITests${NC}"
                passed=1
            else
                echo -e "${RED}❌ FAILED: JestUITests${NC}"
                failed=1
            fi

            if [ -z "$FINSIM_SUPPRESS_SUMMARY" ]; then
                echo
                echo -e " Results (requested): ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
                echo
            fi

            if [ $failed -eq 0 ]; then
                exit 0
            else
                exit 1
            fi
        fi

        local test_files=()

        # If the user already supplied an extension (e.g., .js / .test.js / .spec.js),
        # treat the argument as an explicit file name. Otherwise, gather all matching
        # files that share the same base name.
        if [[ "$input_name" == *\** ]]; then
            # Glob pattern provided (contains *)
            # Find all matching test files
            local pattern="$input_name"
            
            # If pattern doesn't end with .js, match all extensions
            if [[ "$pattern" != *.js ]]; then
                # Find .js files (excluding .test.js and .spec.js)
                while IFS= read -r -d '' f; do
                    test_files+=("$f")
                done < <(find "$TESTS_DIR" -maxdepth 1 -name "${pattern}.js" ! -name "*.test.js" ! -name "*.spec.js" -type f -print0 2>/dev/null | sort -z)
                
                # Find .test.js files
                while IFS= read -r -d '' f; do
                    test_files+=("$f")
                done < <(find "$TESTS_DIR" -maxdepth 1 -name "${pattern}.test.js" -type f -print0 2>/dev/null | sort -z)
                
                # Find .spec.js files
                while IFS= read -r -d '' f; do
                    test_files+=("$f")
                done < <(find "$TESTS_DIR" -maxdepth 1 -name "${pattern}.spec.js" -type f -print0 2>/dev/null | sort -z)
            else
                # Pattern already has .js extension
                while IFS= read -r -d '' f; do
                    test_files+=("$f")
                done < <(find "$TESTS_DIR" -maxdepth 1 -name "$pattern" -type f -print0 2>/dev/null | sort -z)
            fi

            if [ ${#test_files[@]} -eq 0 ]; then
                echo -e "${RED}Error: No test files found matching pattern: $input_name${NC}"
                exit 1
            fi
            
            echo -e "${BLUE}Pattern '$input_name' matched ${#test_files[@]} test file(s)${NC}"
        elif [[ "$input_name" == *.js ]]; then
            # Explicit filename provided
            if [ -f "$TESTS_DIR/$input_name" ]; then
                test_files+=("$TESTS_DIR/$input_name")
            else
                echo -e "${RED}Error: Test file not found: $TESTS_DIR/$input_name${NC}"
                exit 1
            fi
        else
            # No extension – collect all matching variants (.js, .test.js, .spec.js)
            local base_path="$TESTS_DIR/$input_name"
            [ -f "${base_path}.js" ]       && test_files+=("${base_path}.js")
            [ -f "${base_path}.test.js" ] && test_files+=("${base_path}.test.js")
            [ -f "${base_path}.spec.js" ] && test_files+=("${base_path}.spec.js")

            if [ ${#test_files[@]} -eq 0 ]; then
                echo -e "${RED}Error: No test files found for base name: $input_name${NC}"
                exit 1
            fi
        fi

        # Run each collected test file and track pass/fail counts
        local passed=0
        local failed=0

        for test_file in "${test_files[@]}"; do
            local test_name=$(basename "$test_file")
            case "$test_file" in
                *.test.js)
                    echo -e "${BLUE}Running Jest test: $test_name${NC}"
                    cd "$ROOT_DIR"
                    if npx jest --runInBand "${extra_args[@]}" "$test_file"; then
                        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
                        ((passed++))
                    else
                        echo -e "${RED}❌ FAILED: $test_name${NC}"
                        ((failed++))
                    fi
                    ;;
                *.spec.js)
                    echo -e "${BLUE}Running Playwright test: $test_name${NC}"
                    cd "$ROOT_DIR"
                    if npx playwright test "$test_file" --reporter=list "${extra_args[@]}"; then
                        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
                        ((passed++))
                    else
                        echo -e "${RED}❌ FAILED: $test_name${NC}"
                        ((failed++))
                    fi
                    ;;
                *)
                    # Custom Node-based test
                    if run_test "$test_file"; then
                        ((passed++))
                    else
                        ((failed++))
                    fi
                    ;;
            esac
        done

        # Summary for the requested tests (unless suppressed by parent wrapper)
        if [ -z "$FINSIM_SUPPRESS_SUMMARY" ]; then
            echo
            echo -e " Results (requested): ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
            echo
        fi

        if [ $failed -eq 0 ]; then
            exit 0
        else
            exit 1
        fi
    fi
}

# Run main function with all arguments
main "$@" 
