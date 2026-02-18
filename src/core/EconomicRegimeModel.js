/**
 * EconomicRegimeModel.js
 * 
 * Purpose: Encapsulates the logic for economic regimes, including Markov chain
 * transitions, stationary distribution computation, and regime sampling.
 * 
 * GAS Compatibility: Uses plain functions and global objects, avoiding ES6 modules.
 */

function EconomicRegimeModel(regimesConfig) {
  this.config = regimesConfig;
  this.regimeMap = {};
  this.regimeKeys = [];
  this.assetClasses = {};
  this.transitionMatrix = regimesConfig.transitionMatrix;

  this._initialize();
}

/**
 * Validate and initialize the model.
 */
EconomicRegimeModel.prototype._initialize = function() {
  if (!this.config || !Array.isArray(this.config.regimes) || !this.transitionMatrix) {
    throw new Error("Economic regime configuration error: Missing regimes or transitionMatrix");
  }

  // 1. Build map and keys
  for (var i = 0; i < this.config.regimes.length; i++) {
    var r = this.config.regimes[i];
    if (!r.key) throw new Error("Economic regime configuration error: Regime missing key at index " + i);
    this.regimeMap[r.key] = r;
    this.regimeKeys.push(r.key);

    // 2. Validate asset class modifiers (Comment 2)
    for (var prop in r) {
      if (r[prop] && typeof r[prop] === 'object' && r[prop].hasOwnProperty('volatilityMultiplier')) {
        this.assetClasses[prop] = true;
        var vm = r[prop].volatilityMultiplier;
        if (typeof vm !== 'number' || isNaN(vm) || vm <= 0) {
          throw new Error("Economic regime configuration error: volatilityMultiplier must be a number > 0 in regime " + r.key);
        }

        var mm = r[prop].meanModifier;
        if (typeof mm !== 'number' || !isFinite(mm)) {
          throw new Error("Economic regime configuration error: meanModifier must be a finite number in regime " + r.key);
        }
      }
    }
  }

  // 3. Validate transition matrix rows (Comment 1)
  var matrixKeys = Object.keys(this.transitionMatrix);
  if (matrixKeys.length !== this.regimeKeys.length) {
    throw new Error("Economic regime configuration error: Transition matrix row count does not match regime count");
  }

  for (var j = 0; j < this.regimeKeys.length; j++) {
    var key = this.regimeKeys[j];
    var row = this.transitionMatrix[key];
    if (!row) {
      throw new Error("Economic regime configuration error: Missing transition matrix row for " + key);
    }

    // Ensure no extra columns (Comment 1)
    var rowKeys = Object.keys(row);
    if (rowKeys.length !== this.regimeKeys.length) {
      throw new Error("Economic regime configuration error: Transition row for " + key + " has incorrect column count");
    }

    var sum = 0;
    for (var k = 0; k < this.regimeKeys.length; k++) {
      var targetKey = this.regimeKeys[k];
      var prob = row[targetKey];
      if (typeof prob !== 'number' || isNaN(prob)) {
        throw new Error("Economic regime configuration error: Missing or invalid transition probability from " + key + " to " + targetKey);
      }
      if (prob < 0 || prob > 1) {
        throw new Error("Economic regime configuration error: Transition probability from " + key + " to " + targetKey + " must be in [0, 1] (found " + prob + ")");
      }
      sum += prob;
    }

    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error("Economic regime configuration error: Transition probabilities for " + key + " must sum to 1.0 (found " + sum + ")");
    }
  }

  // 4. Compute stationary distribution
  this._stationaryDist = this._computeStationaryDistribution();
  this._validateZeroSumMeanModifiers();
};

/**
 * Compute stationary distribution via power iteration.
 */
EconomicRegimeModel.prototype._computeStationaryDistribution = function() {
  var n = this.regimeKeys.length;
  var pi = {};
  for (var i = 0; i < n; i++) {
    pi[this.regimeKeys[i]] = 1 / n;
  }

  for (var iter = 0; iter < 10000; iter++) {
    var piNext = {};
    var maxDiff = 0;
    for (var j = 0; j < n; j++) {
      var nextVal = 0;
      for (var k = 0; k < n; k++) {
        nextVal += pi[this.regimeKeys[k]] * this.transitionMatrix[this.regimeKeys[k]][this.regimeKeys[j]];
      }
      piNext[this.regimeKeys[j]] = nextVal;
      maxDiff = Math.max(maxDiff, Math.abs(piNext[this.regimeKeys[j]] - pi[this.regimeKeys[j]]));
    }
    pi = piNext;
    if (maxDiff < 1e-10) break;
  }
  return pi;
};

/**
 * Validate stationary-distribution weighted mean is zero for each asset class.
 */
EconomicRegimeModel.prototype._validateZeroSumMeanModifiers = function() {
  var classKeys = Object.keys(this.assetClasses);
  for (var ci = 0; ci < classKeys.length; ci++) {
    var classKey = classKeys[ci];
    var weightedMean = 0;
    for (var ri = 0; ri < this.regimeKeys.length; ri++) {
      var regimeKey = this.regimeKeys[ri];
      var regime = this.regimeMap[regimeKey];
      var modifier = regime[classKey];
      var meanModifier = 0;
      if (modifier && typeof modifier.meanModifier === 'number' && isFinite(modifier.meanModifier)) {
        meanModifier = modifier.meanModifier;
      }
      weightedMean += this._stationaryDist[regimeKey] * meanModifier;
    }
    if (Math.abs(weightedMean) > 0.001) {
      throw new Error(
        "Economic regime configuration error: zero-sum mean constraint failed for asset class " +
        classKey +
        " (weighted mean " +
        weightedMean +
        ")"
      );
    }
  }
};

/**
 * Randomly sample a regime based on a probability distribution.
 */
EconomicRegimeModel.prototype._sampleRegime = function(distribution) {
  var rand = Math.random();
  var cumulative = 0;
  for (var i = 0; i < this.regimeKeys.length; i++) {
    var k = this.regimeKeys[i];
    cumulative += distribution[k];
    if (rand <= cumulative) return this.regimeMap[k];
  }
  return this.regimeMap[this.regimeKeys[0]]; // Fallback
};

/**
 * Sample the starting regime using the stationary distribution.
 */
EconomicRegimeModel.prototype.sampleStartingRegime = function() {
  return this._sampleRegime(this._stationaryDist);
};

/**
 * Sample the next regime given the current one.
 */
EconomicRegimeModel.prototype.getNextRegime = function(currentRegime) {
  if (!currentRegime || !currentRegime.key) return this.sampleStartingRegime();
  var matrixRow = this.transitionMatrix[currentRegime.key];
  return this._sampleRegime(matrixRow);
};

// Make available in context
this.EconomicRegimeModel = EconomicRegimeModel;
