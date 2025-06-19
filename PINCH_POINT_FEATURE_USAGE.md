# Pinch Point Highlighting Feature

## Overview
The Pinch Point Highlighting feature provides visual feedback in the simulation results table to help identify financial stress points and risk areas. Each row in the results table is now color-coded to provide immediate visual insight into the financial health of each year.

## How It Works

### Visual Encoding
Each row's background color encodes three key metrics:

1. **Hue (Color)**: Risk level based on failure rate
   - **Green**: Low risk (most simulations successful)
   - **Yellow**: Medium risk (mixed outcomes)
   - **Red**: High risk (many simulations failed)

2. **Saturation (Color Intensity)**: Data relevance based on survival rate
   - **Bright/Saturated**: High confidence (most simulations still active)
   - **Desaturated/Gray**: Lower confidence (many simulations already failed)

3. **Lightness (Brightness)**: Financial impact magnitude
   - **Bright**: Small financial changes relative to expenses
   - **Dark**: Large financial changes (big surpluses or deficits)

### Single Simulation (n=1)
- **Green rows**: Years with positive cash flow
- **Yellow rows**: Break-even years (pinch points)
- **Red rows**: Years with negative cash flow
- **Gray rows**: Years after simulation failure

### Monte Carlo Simulation (n>1)
- Colors represent aggregated risk across all simulation runs
- Provides a comprehensive view of financial risk over time
- Helps identify which years are most vulnerable to market volatility

## Benefits

1. **Immediate Visual Feedback**: Quickly identify problematic years at a glance
2. **Risk Assessment**: Understand which years pose the highest financial risk
3. **Strategic Planning**: Make informed decisions about retirement timing, savings rates, and investment strategies
4. **Confidence Levels**: See how reliable the data is for each year

## Technical Details

### Metrics Calculated
- **Failure Rate**: Proportion of simulations that failed or nearly failed in each year
- **Survival Rate**: Proportion of simulations still successful at the start of each year
- **Normalized Magnitude**: Average financial impact relative to expenses

### Configuration
The visualization uses a default configuration that maps:
- Failure Rate → Hue (Green to Red)
- Survival Rate → Saturation (20% to 100%)
- Magnitude → Lightness (Pale to Dark)

## Compatibility
- Works with both single simulations and Monte Carlo runs
- Compatible with all existing simulation parameters
- No impact on simulation performance
- Maintains backward compatibility with existing scenarios

## Usage Tips
1. **Focus on red rows**: These indicate years of highest financial stress
2. **Watch for desaturated colors**: These suggest lower confidence in the projections
3. **Look for patterns**: Clusters of problematic years may indicate systemic issues
4. **Consider the full picture**: Use alongside numerical data for complete analysis

This feature helps transform raw simulation data into actionable insights for better financial planning. 