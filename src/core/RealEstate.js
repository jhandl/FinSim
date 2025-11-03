/* This file has to work on both the website and Google Sheets */

class RealEstate {
  
  constructor() {
    this.properties = {}
  }
  
  buy(id, downpayment, appreciation, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].buy(downpayment, appreciation, currency, linkedCountry);
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
  
  mortgage(id, years, rate, payment, currency, linkedCountry) {
    if (!(id in this.properties)) {
      this.properties[id] = new Property();
    }
    this.properties[id].mortgage(years, rate, payment, currency, linkedCountry);
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

  getCurrency(id) {
    if (id in this.properties) {
      return this.properties[id].getCurrency();
    }
    return null;
  }

  getLinkedCountry(id) {
    if (id in this.properties) {
      return this.properties[id].getLinkedCountry();
    }
    return null;
  }
  
  getTotalValue() {
    let sum = 0;
   for (let id of Object.keys(this.properties)) {
     sum += this.properties[id].getValue();
   }
   return sum;
 }

  getTotalValueConverted(targetCurrency, currentCountry, currentYear) {
    if (typeof convertCurrencyAmount !== 'function') {
      return this.getTotalValue();
    }
    let sum = 0;
    const currency = (typeof normalizeCurrency === 'function') ? normalizeCurrency : function(code){ return (code || '').toString().trim().toUpperCase(); };
    const country = (typeof normalizeCountry === 'function') ? normalizeCountry : function(code){ return (code || '').toString().trim().toLowerCase(); };
    for (let id of Object.keys(this.properties)) {
      const property = this.properties[id];
      const value = property.getValue();
      const fromCurrency = currency(property.getCurrency());
      const fromCountry = country(property.getLinkedCountry());
      sum += convertCurrencyAmount(value, fromCurrency, fromCountry, targetCurrency, currentCountry, currentYear);
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
    this.currency = null;
    this.linkedCountry = null;
  }
  
  buy(paid, appreciation, currency, linkedCountry) {
    this.paid = paid;
    this.appreciation = appreciation;
    if (currency !== undefined && currency !== null && currency !== '') {
      this.currency = String(currency).toUpperCase();
    }
    if (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') {
      this.linkedCountry = String(linkedCountry).toLowerCase();
    }
  }
  
  mortgage(years, rate, payment, currency, linkedCountry) {
    const n = years * 12;
    const r = rate / 12;
    const c = Math.pow(1 + r, n);
    this.borrowed = payment/12 * (c - 1) / (r * c);
    this.terms = years;
    this.payment = payment;
    this.paymentsMade = 0;
    if (currency !== undefined && currency !== null && currency !== '') {
      this.currency = String(currency).toUpperCase();
    }
    if (linkedCountry !== undefined && linkedCountry !== null && linkedCountry !== '') {
      this.linkedCountry = String(linkedCountry).toLowerCase();
    }
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

  getCurrency() {
    return this.currency;
  }

  getLinkedCountry() {
    return this.linkedCountry;
  }
  
}
