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
    echo "  ./run-tests.sh [test-name] [--runAll]"
    echo ""
    echo "EXAMPLES:"
    echo -e "  ${GREEN}./run-tests.sh${NC}                    # Run all tests"
    echo -e "  ${GREEN}./run-tests.sh TestBasicTax${NC}       # Run specific test"
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
        const testDefinition = require('$test_file');
        
        // Check if this is a custom test
        if (testDefinition.isCustomTest && testDefinition.runCustomTest) {
            // Run custom test directly
            testDefinition.runCustomTest()
                .then(result => {
                    if (result.success) {
                        console.log('✅ PASSED: $test_name');
                        process.exit(0);
                    } else {
                        console.log('❌ FAILED: $test_name');
                        if (result.errors && result.errors.length > 0) {
                            result.errors.forEach(error => console.log('  Error: ' + error));
                        }
                        process.exit(1);
                    }
                })
                .catch(error => {
                    console.error('❌ ERROR: $test_name - ' + error.message);
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
                        console.log('❌ FAILED: $test_name');
                        if (result.report) {
                            console.log(result.report);
                        }
                        process.exit(1);
                    }
                })
                .catch(error => {
                    console.error('❌ ERROR: $test_name - ' + error.message);
                    process.exit(1);
                });
        }
    "
}

# Function to find all test files
find_test_files() {
    # Exclude Jest tests (*.test.js) and Playwright tests (*.spec.js)
    find "$TESTS_DIR" -name "*.js" ! -name "*.test.js" ! -name "*.spec.js" -type f | sort
}

# Function to list available tests
list_tests() {
    echo -e "${BLUE}Available FinSim Tests:${NC}"
    echo -e "${BLUE}======================${NC}"
    echo ""

    local custom_tests=( $(find "$TESTS_DIR" -name "*.js" ! -name "*.test.js" ! -name "*.spec.js" -type f | sort) )
    local jest_tests=( $(find "$TESTS_DIR" -name "*.test.js" -type f | sort) )
    local pw_tests=( $(find "$TESTS_DIR" -name "*.spec.js" -type f | sort) )

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
        # Strip --runAll from positional args for downstream handling
        set -- $(printf '%s\n' "$@" | sed 's/--runAll//')
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
        
        for test_file in "${test_files[@]}"; do
            if run_test "$test_file"; then
                ((passed++))
            else
                ((failed++))
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
        fi

        # -----------------------------
        # Run Playwright end-to-end tests
        # -----------------------------

        for test_file in `find "$TESTS_DIR" -name "*.spec.js" -type f`; do

            TEST_NAME=$(basename "$test_file" .spec.js)
            PLAYWRIGHT_OUTPUT=`npx playwright test "$test_file"`
            if [ $? -eq 0 ]; then
                echo -e "✅ PASSED: $TEST_NAME"
                ((passed++))
            else
                echo "$PLAYWRIGHT_OUTPUT"
                echo -e "❌ FAILED: $TEST_NAME"
                ((failed++))
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
        echo

        if [ $failed -eq 0 ]; then
            exit 0
        else
            exit 1
        fi
        
    else
        # Run specific test or group of tests with the same base name
        local input_name="$1"
        shift  # Move past the test name

        # Capture any extra arguments following the optional --args flag
        local extra_args=()
        if [ "$1" == "--args" ]; then
            shift  # Remove the --args flag
            # Collect all remaining parameters as individual array elements
            while [ $# -gt 0 ]; do
                extra_args+=("$1")
                shift
            done
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

        # Summary for the requested tests
        echo
        echo -e " Results (requested): ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
        echo

        if [ $failed -eq 0 ]; then
            exit 0
        else
            exit 1
        fi
    fi
}

# Run main function with all arguments
main "$@" 
