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
    echo "  ./run-tests.sh [test-name ...] [--runAll]"
    echo ""
    echo "EXAMPLES:"
    echo -e "  ${GREEN}./run-tests.sh${NC}                    # Run all tests"
    echo -e "  ${GREEN}./run-tests.sh TestBasicTax${NC}       # Run specific test"
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
    for arg in "$@"; do
        if [ "$arg" == "--runAll" ]; then
            RUN_ALL=true
            break
        fi
    done

    if [ "$RUN_ALL" == true ]; then
        export FINSIM_RUN_ALL=1
        # Rebuild positional args array excluding --runAll while preserving
        # original argument quoting and whitespace.
        local new_args=()
        for a in "$@"; do
            if [ "$a" != "--runAll" ]; then
                new_args+=("$a")
            fi
        done
        set -- "${new_args[@]}"
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

    if [ $# -eq 0 ]; then
        # Run all tests
        local test_files=($(find_test_files))
        if [ ${#test_files[@]} -eq 0 ]; then
            echo -e "${YELLOW}No test files found in $TESTS_DIR${NC}"
            exit 0
        fi
        local passed=0
        local failed=0
        local failed_tests=()
        
        for test_file in "${test_files[@]}"; do
            local test_name=$(basename "$test_file" .js)
            if run_test "$test_file"; then
                ((passed++))
            else
                ((failed++))
                failed_tests+=("$test_name")
            fi
        done
        
        # Run Jest-powered UI tests
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

        # -----------------------------
        # Run Playwright end-to-end tests
        # -----------------------------

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

        # Final summary counts

        # Cleanup temporary files
        if [ -n "$TEMP_JSON" ] && [ -f "$TEMP_JSON" ]; then
            rm -f "$TEMP_JSON"
        fi

        # Cleanup Playwright artifacts (test-results/, playwright-report/)
        for dir in "test-results" "playwright-report"; do
            if [ -d "$ROOT_DIR/$dir" ]; then
                rm -rf "$ROOT_DIR/$dir"
            fi
        done

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
                    if FINSIM_SUPPRESS_SUMMARY=1 "$0" "$name" --args "${extra_args[@]}"; then
                        ((total_passed++))
                    else
                        ((total_failed++))
                    fi
                else
                    if FINSIM_SUPPRESS_SUMMARY=1 "$0" "$name"; then
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
        if [[ "$input_name" == *.js ]]; then
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
