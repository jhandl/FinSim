// test/utils.test.js

// Import the specific function we want to test
const { evaluateFormula } = require('../src/core/Utils');

describe('Utils.evaluateFormula', () => {

    test('should evaluate simple arithmetic expressions', () => {
        expect(evaluateFormula('1 + 1')).toBe(2);
        expect(evaluateFormula('10 * 5')).toBe(50);
        expect(evaluateFormula('100 / 4')).toBe(25);
        expect(evaluateFormula('5 - 8')).toBe(-3);
        expect(evaluateFormula('2 * (3 + 4)')).toBe(14);
    });

    test('should access variables from the contextData object', () => {
        const context = { a: 5, b: 10, c: 2 };
        expect(evaluateFormula('a + b', context)).toBe(15);
        expect(evaluateFormula('b * c', context)).toBe(20);
        expect(evaluateFormula('(a + b) / c', context)).toBe(7.5);
    });

    test('should access nested variables from the contextData object', () => {
        const context = { data: { value: 100, multiplier: 0.5 } };
        expect(evaluateFormula('data.value * data.multiplier', context)).toBe(50);
    });

    test('should handle Math functions', () => {
        const context = { x: 4, y: 3 };
        expect(evaluateFormula('Math.sqrt(x)', context)).toBe(2);
        expect(evaluateFormula('Math.pow(x, y)', context)).toBe(64); // 4^3
        expect(evaluateFormula('Math.max(x, y, 10)', context)).toBe(10);
    });

    test('should return NaN for formulas accessing undefined context variables', () => {
        const context = { known: 5 };
        // The Function constructor + with block will throw a ReferenceError internally
        // which is caught and returns NaN.
        expect(evaluateFormula('known + unknown', context)).toBeNaN();
        expect(evaluateFormula('missing.value', context)).toBeNaN();
    });

    test('should return NaN for invalid formula syntax', () => {
        // expect(evaluateFormula('1 + + 2')).toBeNaN(); // This specific syntax is parsed as 3 by Function constructor, not a SyntaxError
        expect(evaluateFormula('Math.sqrt(')).toBeNaN(); // SyntaxError
        expect(evaluateFormula('5 *')).toBeNaN(); // SyntaxError
    });

    test('should handle empty contextData object', () => {
        const context = {};
        expect(evaluateFormula('10 * 2', context)).toBe(20); // No context needed
        expect(evaluateFormula('a + b', context)).toBeNaN(); // Context needed but missing
    });

    test('should handle null or undefined contextData', () => {
        expect(evaluateFormula('5 + 3', null)).toBe(8);
        expect(evaluateFormula('5 + 3', undefined)).toBe(8);
        expect(evaluateFormula('x * 2', null)).toBeNaN();
        expect(evaluateFormula('x * 2', undefined)).toBeNaN();
    });

    // Test potential edge cases or more complex scenarios if needed
    test('should handle formulas with string literals (less common but possible)', () => {
        const context = { prefix: 'hello' };
        // Note: String concatenation might work, but complex string ops are unlikely intended use
        expect(evaluateFormula("'world'", context)).toBe('world');
        // expect(evaluateFormula("prefix + ' world'", context)).toBe('hello world'); // This might work depending on Function constructor behavior
    });

     test('should handle boolean logic', () => {
        const context = { a: true, b: false, c: 5 };
        expect(evaluateFormula('a && !b', context)).toBe(true);
        expect(evaluateFormula('b || c > 10', context)).toBe(false);
        expect(evaluateFormula('c == 5 ? 1 : 0', context)).toBe(1);
    });

});