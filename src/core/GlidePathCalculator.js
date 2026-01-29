/* This file has to work on both the website and Google Sheets */

function getCurrentMix(age, config) {
  if (!config || config.type !== 'glidePath') return null;
  const startAge = config.startAge;
  const targetAge = config.targetAge;
  const startAsset1Pct = config.startAsset1Pct;
  const endAsset1Pct = config.endAsset1Pct;
  if (age < startAge) return { asset1Pct: startAsset1Pct, asset2Pct: 100 - startAsset1Pct };
  if (age >= targetAge) return { asset1Pct: endAsset1Pct, asset2Pct: 100 - endAsset1Pct };
  const progress = (age - startAge) / (targetAge - startAge);
  const asset1Pct = startAsset1Pct + (endAsset1Pct - startAsset1Pct) * progress;
  return { asset1Pct: asset1Pct, asset2Pct: 100 - asset1Pct };
}

this.GlidePathCalculator = { getCurrentMix: getCurrentMix };
