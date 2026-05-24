export const HSN_CODE = "996331";
export const CGST_RATE = 0.025;
export const SGST_RATE = 0.025;
export const TOTAL_GST_RATE = CGST_RATE + SGST_RATE;

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function calculateGstBill(items = []) {
  const subtotal = roundMoney(
    items.reduce((total, item) => total + Number(item.subtotal || Number(item.price || 0) * Number(item.quantity || 0)), 0)
  );
  const cgst = roundMoney(subtotal * CGST_RATE);
  const sgst = roundMoney(subtotal * SGST_RATE);
  const totalGst = roundMoney(cgst + sgst);
  const grandTotal = roundMoney(subtotal + totalGst);

  return {
    subtotal,
    cgst,
    sgst,
    totalGst,
    grandTotal,
    hsnCode: HSN_CODE,
  };
}

export function createBillNumber(orderId) {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const suffix = String(orderId || "ORDER").slice(0, 6).toUpperCase();

  return `BILL-${year}${month}-${suffix}`;
}
