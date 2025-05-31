#!/bin/bash

# FinSim Test Runner Script
# Simple wrapper for running FinSim financial simulation tests
# 
# This script runs tests from the tests/ directory using TestFramework.js directly

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$SCRIPT_DIR/core"
TESTS_DIR="$SCRIPT_DIR/tests"

# Function to display usage
show_usage() {
    echo -e "${BLUE}FinSim Test Runner${NC}"
    echo -e "${BLUE}=================${NC}"
    echo ""
    echo "USAGE:"
    echo "  ./run-tests.sh [test-name]"
    echo ""
    echo "EXAMPLES:"
    echo -e "  ${GREEN}./run-tests.sh${NC}                    # Run all tests"
    echo -e "  ${GREEN}./run-tests.sh TestBasicTax${NC}       # Run specific test"
    echo -e "  ${GREEN}./run-tests.sh --help${NC}             # Show this help"
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
    
    echo -e "${BLUE}Running test: ${test_name}${NC}"
    
    # Create a simple Node.js command to run the test
    cd "$CORE_DIR"
    node -e "
        const { TestFramework } = require('./TestFramework.js');
        const testDefinition = require('$test_file');
        
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
    "
}

# Function to find all test files
find_test_files() {
    find "$TESTS_DIR" -name "*.js" -type f | sort
}

# Main execution
main() {
    case "$1" in
        -h|--help|--help-script)
            show_usage
            exit 0
            ;;
    esac

    # Check prerequisites
    check_prerequisites

    if [ $# -eq 0 ]; then
        # Run all tests
        echo -e "${BLUE}🧪 Running all FinSim tests...${NC}"
        echo ""
        
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
        
        echo ""
        echo -e "${BLUE}Test Results: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
        
        if [ $failed -eq 0 ]; then
            echo -e "${GREEN}🎉 All tests passed!${NC}"
            exit 0
        else
            exit 1
        fi
        
    else
        # Run specific test
        local test_name="$1"
        local test_file="$TESTS_DIR/$test_name.js"
        
        if [ ! -f "$test_file" ]; then
            echo -e "${RED}Error: Test file not found: $test_file${NC}"
            exit 1
        fi
        
        run_test "$test_file"
    fi
}

# Run main function with all arguments
main "$@" 