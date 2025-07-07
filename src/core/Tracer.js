/* This file has to work on both the website and Google Sheets */

const EXPLAIN_MODE = true; // Master switch for the tracing functionality

class Tracer {
  constructor() {
    this.traces = {};
    this.active = EXPLAIN_MODE;
  }

  setActive(isActive) {
    this.active = isActive && EXPLAIN_MODE;
  }

  trace(year, source, target, amount, description) {
    if (!this.active) return;

    if (!this.traces[year]) {
      this.traces[year] = {};
    }
    if (!this.traces[year][target]) {
      this.traces[year][target] = [];
    }
    this.traces[year][target].push({ source, amount, description });
  }

  getTraces(year, target) {
    if (!this.active || !this.traces[year] || !this.traces[year][target]) {
      return [];
    }
    return this.traces[year][target];
  }

  getFormattedTraces(year, target) {
    const traces = this.getTraces(year, target);
    if (traces.length === 0) return "";

    const total = traces.reduce((sum, trace) => sum + trace.amount, 0);
    
    return traces.map(trace => {
      const percentage = total ? (trace.amount / total * 100).toFixed(0) : 0;
      return `€${Math.round(trace.amount)} (${percentage}%) from ${trace.source} '${trace.description}'`;
    }).join('\n');
  }

  reset() {
    this.traces = {};
  }
}