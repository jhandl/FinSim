#!/bin/bash

# FinSim Test Runner Script
# Convenient wrapper for running FinSim financial simulation tests
# 
# This script runs from the src directory and executes tests from the tests/ directory
# using the TestRunner.js in the core/ directory

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$SCRIPT_DIR/core"
TESTS_DIR="$SCRIPT_DIR/tests"

# Function to display usage
show_usage() {
    echo -e "${CYAN}FinSim Test Runner${NC}"
    echo -e "${CYAN}=================${NC}"
    echo ""
    echo "USAGE:"
    echo "  ./run-tests.sh [OPTIONS] [PATTERN]"
    echo ""
    echo "QUICK COMMANDS:"
    echo -e "  ${GREEN}./run-tests.sh${NC}                    # Run all tests"
    echo -e "  ${GREEN}./run-tests.sh tax${NC}                # Run tests matching 'tax'"
    echo -e "  ${GREEN}./run-tests.sh --category=pension${NC}  # Run pension tests"
    echo -e "  ${GREEN}./run-tests.sh --verbose${NC}           # Run with detailed output"
    echo -e "  ${GREEN}./run-tests.sh --help${NC}              # Show detailed TestRunner help"
    echo ""
    echo "EXPORT OPTIONS:"
    echo -e "  ${YELLOW}./run-tests.sh --json${NC}              # Export results to JSON"
    echo -e "  ${YELLOW}./run-tests.sh --csv${NC}               # Export results to CSV"
    echo -e "  ${YELLOW}./run-tests.sh --output=results.json${NC} # Save to specific file"
    echo ""
    echo "DEVELOPMENT OPTIONS:"
    echo -e "  ${PURPLE}./run-tests.sh --list${NC}              # List available tests"
    echo -e "  ${PURPLE}./run-tests.sh --fail-fast${NC}         # Stop on first failure"
    echo -e "  ${PURPLE}./run-tests.sh --verbose --no-progress${NC} # Detailed output, no progress bar"
    echo -e "  ${PURPLE}./run-tests.sh --quiet${NC}             # Minimal output"
    echo ""
    echo "All TestRunner.js options are supported. Use --help for complete list."
}

# Function to check prerequisites
check_prerequisites() {
    if [ ! -d "$CORE_DIR" ]; then
        echo -e "${RED}Error: core/ directory not found at $CORE_DIR${NC}"
        exit 1
    fi

    if [ ! -f "$CORE_DIR/TestRunner.js" ]; then
        echo -e "${RED}Error: TestRunner.js not found at $CORE_DIR/TestRunner.js${NC}"
        exit 1
    fi

    if [ ! -d "$TESTS_DIR" ]; then
        echo -e "${YELLOW}Warning: tests/ directory not found at $TESTS_DIR${NC}"
        echo -e "${YELLOW}Creating tests directory...${NC}"
        mkdir -p "$TESTS_DIR"
    fi

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
        exit 1
    fi
}

# Function to validate TestRunner options
validate_options() {
    local args=("$@")
    local valid_options=(
        "-p" "--pattern" "-c" "--category" "-s" "--suite" "-d" "--directory"
        "-f" "--format" "-o" "--output" "-v" "--verbose" "-q" "--quiet"
        "--fail-fast" "-t" "--timeout" "--no-progress" "--no-summary" "--no-details"
        "-h" "--help" "--version" "--list"
        "--json" "--csv" "--help-script"
    )
    
    for arg in "${args[@]}"; do
        if [[ "$arg" =~ ^--?[a-zA-Z] ]]; then
            # Extract option name (handle --key=value format)
            local option="${arg%%=*}"
            local is_valid=false
            
            for valid_opt in "${valid_options[@]}"; do
                if [[ "$option" == "$valid_opt" ]]; then
                    is_valid=true
                    break
                fi
            done
            
            if [[ "$is_valid" == false ]]; then
                echo -e "${RED}Error: Unknown option '$option'${NC}"
                echo "Use --help to see available options"
                exit 1
            fi
        fi
    done
}

# Function to handle special quick options
handle_quick_options() {
    case "$1" in
        --json)
            shift
            exec node "$CORE_DIR/TestRunner.js" --directory="$TESTS_DIR" --format=json "$@"
            ;;
        --csv)
            shift
            exec node "$CORE_DIR/TestRunner.js" --directory="$TESTS_DIR" --format=csv "$@"
            ;;
        --list)
            shift
            exec node "$CORE_DIR/TestRunner.js" --directory="$TESTS_DIR" --list "$@"
            ;;
        --help-script)
            show_usage
            exit 0
            ;;
        -h|--help)
            # Show TestRunner help
            exec node "$CORE_DIR/TestRunner.js" --help
            ;;
        --version)
            exec node "$CORE_DIR/TestRunner.js" --version
            ;;
    esac
}

# Main execution
main() {
    # Check if no arguments provided
    if [ $# -eq 0 ]; then
        echo -e "${BLUE}🧪 Running all FinSim tests...${NC}"
        echo ""
    fi

    # Check prerequisites
    check_prerequisites

    # Validate all provided options
    validate_options "$@"

    # Handle special quick options
    handle_quick_options "$@"

    # Change to core directory and run TestRunner with all arguments
    cd "$CORE_DIR"
    
    echo -e "${BLUE}📁 Working directory: $(pwd)${NC}"
    echo -e "${BLUE}📂 Tests directory: $TESTS_DIR${NC}"
    echo ""

    # Execute TestRunner with all provided arguments, specifying the correct tests directory
    exec node TestRunner.js --directory="$TESTS_DIR" "$@"
}

# Handle script help
if [ "$1" = "--help-script" ]; then
    show_usage
    exit 0
fi

# Run main function with all arguments
main "$@" 