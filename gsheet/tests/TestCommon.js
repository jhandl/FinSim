var config, params;

class TestConfig {
  constructor() {
    this.pensionContribEarningLimit = 100000;
    this.pensionLumpSumLimit = 0.25;
    this.pensionLumpSumTaxBands = {"0": 0, "100000": 0.2, "200000": 0.4};
    this.pensionMinDrawdownBands = {"0": 0, "60": 0.04, "70": 0.05};
    this.itEmployeeTaxCredit = 1000;
    this.itExemptionLimit = 18000;
    this.itExemptionAge = 65;
    this.itSingleNoChildrenBands = {"0": 0.2, "35000": 0.4};
    this.itSingleDependentChildrenBands = {"0": 0.2, "39000": 0.4};
    this.itMarriedBands = {"0": 0.2, "44000": 0.4};
    this.itMaxMarriedBandIncrease = 25000;
    this.ageTaxCredit = 245;
    this.prsiExcemptAge = 70;
    this.prsiRate = 0.04;
    this.uscExemptAmount = 13000;
    this.uscRaducedRateAge = 70;
    this.uscReducedRateMaxIncome = 60000;
    this.uscTaxBands = {"0": 0.005, "12012": 0.02, "27382": 0.045, "70044": 0.08};
    this.uscReducedTaxBands = {"0": 0.005, "12012": 0.02};
    this.cgtRate = 0.33;
    this.cgtTaxRelief = 1270;
    this.etfDeemedDisposalYears = 8;
    this.etfExitTax = 0.41;
    this.etfCanOffsetLosses = false;
  }
}

class TestCase {
  setUp() {
    config = new TestConfig();
  }
}

function assertClose(actual, expected, message, epsilon = 0.01) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function runTests() {
  new TestRevenue().runTests();
  new TestRealEstate().runTests();
  new TestEquities().runTests();
}
