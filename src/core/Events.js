/* This file has to work on both the website and Google Sheets */

class SimEvent {
  
  constructor(type, id, amount, fromAge, toAge, rate, match, currency, linkedEventId, linkedCountry) {
    this.type = type;
    this.id = id;
    this.amount = amount;
    this.fromAge = fromAge;
    this.toAge = toAge;
    this.rate = rate;
    this.match = match;
    this.currency = currency;
    this.linkedEventId = linkedEventId;
    this.linkedCountry = linkedCountry;
  }
  
}

