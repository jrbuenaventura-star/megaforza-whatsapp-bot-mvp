export function nitDV(nitWithoutDV) {
  const pesos = [3,7,13,17,19,23,29,37,41,43,47,53,59,67,71];
  let s = 0;
  const digits = String(nitWithoutDV).replace(/\D/g,'').split('').reverse();
  for (let i=0;i<digits.length;i++){
    const d = parseInt(digits[i]||'0',10);
    s += d * (pesos[i]||0);
  }
  const r = s % 11;
  return (r > 1) ? (11 - r) : r;
}

export function isValidCC(cc) {
  const d = String(cc).replace(/\D/g,'');
  return d.length >= 6 && d.length <= 12;
}
