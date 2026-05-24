import { calculateGstBill, createBillNumber } from "../utils/gstUtils";
import { formatINR } from "../utils/priceUtils";

function formatBillDate(order) {
  const date = typeof order?.createdAt?.toDate === "function" ? order.createdAt.toDate() : new Date();

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function createWhatsAppLink({ restaurant, order, bill }) {
  const text = [
    `${restaurant?.name || "Restaurant"} bill`,
    `Bill: ${createBillNumber(order.id)}`,
    `Table: ${order.tableId}`,
    `Total: ${formatINR(bill.grandTotal)}`,
    "Payment link placeholder: pay at counter / online payment coming soon.",
  ].join("\n");

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function BillView({ restaurant, order, onClose }) {
  if (!order) {
    return null;
  }

  const bill = calculateGstBill(order.items || []);
  const billNumber = createBillNumber(order.id);
  const whatsappLink = createWhatsAppLink({ restaurant, order, bill });

  return (
    <section className="bill-shell">
      <div className="bill-actions no-print">
        <button className="secondary-button" type="button" onClick={onClose}>
          Close
        </button>
        <button className="primary-button" type="button" onClick={() => window.print()}>
          Print bill
        </button>
        <a className="secondary-link" href={whatsappLink} target="_blank" rel="noreferrer">
          WhatsApp bill
        </a>
      </div>

      <article className="bill-view" id="printable-bill">
        <header className="bill-header">
          {restaurant?.logoUrl && <img src={restaurant.logoUrl} alt={restaurant.name || "Restaurant logo"} />}
          <div>
            <h2>{restaurant?.name || "Restaurant"}</h2>
            {restaurant?.gstin && <p>GSTIN: {restaurant.gstin}</p>}
            <p>HSN: {bill.hsnCode}</p>
          </div>
        </header>

        <div className="bill-meta">
          <p>
            <strong>Bill No:</strong> {billNumber}
          </p>
          <p>
            <strong>Order:</strong> {order.id}
          </p>
          <p>
            <strong>Table:</strong> {order.tableId}
          </p>
          <p>
            <strong>Date:</strong> {formatBillDate(order)}
          </p>
        </div>

        <table className="bill-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item, index) => (
              <tr key={`${item.itemId}-${index}`}>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{formatINR(item.price)}</td>
                <td>{formatINR(item.subtotal || Number(item.price || 0) * Number(item.quantity || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bill-totals">
          <p>
            <span>Subtotal</span>
            <strong>{formatINR(bill.subtotal)}</strong>
          </p>
          <p>
            <span>CGST 2.5%</span>
            <strong>{formatINR(bill.cgst)}</strong>
          </p>
          <p>
            <span>SGST 2.5%</span>
            <strong>{formatINR(bill.sgst)}</strong>
          </p>
          <p>
            <span>Total GST 5%</span>
            <strong>{formatINR(bill.totalGst)}</strong>
          </p>
          <p className="bill-grand-total">
            <span>Grand total</span>
            <strong>{formatINR(bill.grandTotal)}</strong>
          </p>
        </div>

        <footer className="bill-footer">
          <p>Payment method: {order.paymentMethod || "counter"}</p>
          <p>Payment status: {order.paymentStatus || "unpaid"}</p>
          <p>Thank you. Visit again.</p>
        </footer>
      </article>
    </section>
  );
}

export default BillView;
