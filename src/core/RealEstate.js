/* This file has to work on both the website and Google Sheets */

class RealEstate {
  
  constructor() {
    this.properties = {}
  }
  
  buy(id, downpayment, appreciation) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].buy(downpayment, appreciation);
    return this.properties[id];
  }
  
  sell(id) {
    if (id in this.properties) {
      let value = this.properties[id].getValue();
      delete this.properties[id];
      return value;
    }
    return 0;
  }
  
  mortgage(id, years, rate, payment) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].mortgage(years, rate, payment);
    return this.properties[id];
  }
  
  getValue(id) {
    if (id in this.properties) {
      return this.properties[id].getValue();
    }
    return 0;
  }
  
  getPayment(id) {
    if (id in this.properties) {
      return this.properties[id].getPayment();
    }
    return 0;
  }
  
  getTotalValue() {
    let sum = 0;
    for (let id of Object.keys(this.properties)) {
      sum += this.properties[id].getValue();
    }
    return sum;
  }
  
  addYear() {
    for (let id of Object.keys(this.properties)) {
      this.properties[id].addYear();
    }
  }
  
}


class Property {

  constructor() {
    this.paid = 0;
    this.appreciation = 0;
    this.periods = 0;
    this.borrowed = 0;
    this.terms = 1;
    this.payment = 0;
    this.paymentsMade = 0;
    this.fractionRepaid = 0;
  }
  
  buy(paid, appreciation) {
    this.paid = paid;
    this.appreciation = appreciation;
  }
  
  mortgage(years, rate, payment) {
    const n = years * 12;
    const r = rate / 12;
    const c = Math.pow(1 + r, n);
    this.borrowed = payment/12 * (c - 1) / (r * c);
    this.terms = years;
    this.payment = payment;
    this.paymentsMade = 0;
  }
  
  addYear() {
    this.periods++;
    if (this.paymentsMade < this.terms) {
      this.paymentsMade++;
    }
    this.fractionRepaid = this.paymentsMade / this.terms;
  }

  getPayment() {
    return this.payment;
  }
  
  getValue() {
    return adjust(this.paid + this.borrowed * this.fractionRepaid, this.appreciation, this.periods);
  }
  
}
