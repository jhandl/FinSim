const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const SRC_DIR = path.join(__dirname, 'src');
const OUTPUT_FILE = path.join(__dirname, 'code_reference.json');
const EXCLUDED_DIR = path.join(SRC_DIR, 'frontend', 'web', 'ifs', 'libs');

// Function to recursively find all .js files
function findJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        // Skip the excluded directory
        if (filePath.startsWith(EXCLUDED_DIR)) {
            continue; // 'continue' is valid in a for...of loop
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            findJsFiles(filePath, fileList);
        } else if (path.extname(file) === '.js') {
            fileList.push(filePath);
        }
    } // End for...of loop
    return fileList;
}

// Function to generate function/method signature string
function getSignature(node) {
    const params = node.params.map(param => {
        if (param.type === 'Identifier') {
            return param.name;
        } else if (param.type === 'AssignmentPattern') { // Default parameter
            return `${param.left.name} = ...`; // Simplified default value
        } else if (param.type === 'RestElement') { // Rest parameter
            return `...${param.argument.name}`;
        }
        return '?'; // Placeholder for complex patterns
    }).join(', ');
    return `(${params})`;
}

// Function to parse a file and extract information
function parseFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(SRC_DIR, filePath);
    const fileInfo = {
        filename: relativePath,
        classes: [],
        functions: [],
        variables: [], // Top-level variables
    };

    try {
        const ast = parser.parse(code, {
            sourceType: 'module', // Assuming ES modules
            plugins: [
                'classProperties', // Enable parsing of class properties
                'optionalChaining',
                'nullishCoalescingOperator'
                // Add other plugins if needed based on syntax used
            ],
        });

        traverse(ast, {
            ClassDeclaration(path) {
                const classInfo = {
                    name: path.node.id.name,
                    methods: [],
                    attributes: [], // Class properties/fields
                };
                path.traverse({
                    ClassMethod(methodPath) {
                        if (methodPath.node.kind === 'constructor') {
                             classInfo.methods.push(`constructor${getSignature(methodPath.node)}`);
                        } else if (methodPath.node.kind === 'method') {
                            classInfo.methods.push(`${methodPath.node.key.name}${getSignature(methodPath.node)}`);
                        }
                        // Could add getters/setters if needed
                        methodPath.skip(); // Avoid traversing into method bodies for now
                    },
                    ClassProperty(propPath) {
                         // Basic handling for class properties
                        // Just push the attribute name
                        classInfo.attributes.push(propPath.node.key.name);
                         propPath.skip();
                    }
                });
                fileInfo.classes.push(classInfo);
                path.skip(); // Don't traverse deeper into class declarations from the top level
            },
            FunctionDeclaration(path) {
                const funcName = path.node.id ? path.node.id.name : '(anonymous)';
                fileInfo.functions.push(`${funcName}${getSignature(path.node)}`);
                path.skip(); // Avoid traversing into function bodies
            },
            VariableDeclaration(path) {
                // Only capture top-level variables (direct children of Program)
                if (path.parentPath.isProgram()) {
                    path.node.declarations.forEach(declaration => {
                        if (declaration.id.type === 'Identifier') {
                            let type = 'unknown';
                            let signature = null;
                            if (declaration.init) {
                                if (declaration.init.type === 'ArrowFunctionExpression' || declaration.init.type === 'FunctionExpression') {
                                    type = 'Function';
                                    signature = getSignature(declaration.init);
                                } else {
                                    // Basic type detection
                                    type = declaration.init.type.replace('Literal', '').toLowerCase(); // e.g., 'string', 'number', 'boolean'
                                    if (type === 'identifier') type = 'variable'; // Could be reference to another var
                                    if (type === 'objectexpression') type = 'object';
                                    if (type === 'arrayexpression') type = 'array';
                                }
                            }

                            // Just push the variable name, regardless of type
                            fileInfo.variables.push(declaration.id.name);
                        }
                        // Could handle ObjectPattern/ArrayPattern destructuring if needed
                    });
                }
                 // Don't skip here, might have nested declarations we want if logic changes
            }
            // Could add ExportNamedDeclaration, ExportDefaultDeclaration etc. if needed
        });

    } catch (error) {
        console.error(`Error parsing file ${relativePath}: ${error.message}`);
        // Add basic info even if parsing fails partially or completely
        fileInfo.error = `Parsing failed: ${error.message}`;
    }

    return fileInfo;
}

// Main execution
try {
    console.log(`Starting code analysis in ${SRC_DIR}...`);
    const jsFiles = findJsFiles(SRC_DIR);
    console.log(`Found ${jsFiles.length} JavaScript files.`);

    const allFileInfo = jsFiles.map(filePath => {
        console.log(`Parsing ${path.relative(__dirname, filePath)}...`);
        return parseFile(filePath);
    });

    console.log(`Writing results to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allFileInfo, null, 2));
    console.log('Code reference generated successfully!');

} catch (error) {
    console.error('An error occurred during script execution:', error);
    process.exit(1);
}