#!/bin/bash
#
# normalize.sh
#
# Processes a data table export CSV file:
# - Finds values that are NOT within quotes
# - Removes any character that is not a digit or a minus sign from them
# - Wraps them in quotes
#
# Usage: ./normalize.sh input.csv [output.csv]
#        If output.csv is not specified, outputs to stdout
#

if [ $# -lt 1 ]; then
    echo "Usage: $0 input.csv [output.csv]" >&2
    exit 1
fi

input_file="$1"
output_file="${2:-/dev/stdout}"

if [ ! -f "$input_file" ]; then
    echo "Error: Input file '$input_file' not found" >&2
    exit 1
fi

# Process the CSV using awk
awk '
BEGIN {
    FS = ""  # Character-by-character processing
    ORS = ""
}

NR == 1 {
    print $0 "\n"
    next
}

{
    line = $0
    len = length(line)
    result = ""
    i = 1
    first_field = 1
    
    while (i <= len) {
        if (!first_field) {
            result = result ","
        }
        first_field = 0
        
        # Check if we are at a quoted field
        if (substr(line, i, 1) == "\"") {
            # Quoted field - output as is
            field = "\""
            i++
            while (i <= len) {
                ch = substr(line, i, 1)
                field = field ch
                i++
                if (ch == "\"") {
                    # Check for escaped quote ""
                    if (i <= len && substr(line, i, 1) == "\"") {
                        field = field "\""
                        i++
                    } else {
                        break
                    }
                }
            }
            result = result field
            # Skip the comma after this field
            if (i <= len && substr(line, i, 1) == ",") {
                i++
            }
        } else {
            # Unquoted field - collect until comma or end
            field = ""
            while (i <= len && substr(line, i, 1) != ",") {
                field = field substr(line, i, 1)
                i++
            }
            # Skip the comma from the input (we added one to result at start of loop if not first)
            if (i <= len && substr(line, i, 1) == ",") {
                i++
            }
            
            # Remove any character that is not a digit or a minus sign
            gsub(/[^0-9-]/, "", field)
            
            # Add quotes around the field
            result = result "\"" field "\""
        }
    }
    
    print result "\n"
}
' "$input_file" > "$output_file"
