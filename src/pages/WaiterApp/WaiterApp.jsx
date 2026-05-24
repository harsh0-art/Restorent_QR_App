import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import BillView from "../../components/BillView";
import { getOrder, markOrderDelivered } from "../../firebase/orderService";
import { getRestaurant } from "../../firebase/restaurantService";
import { clearWaiterCall, listenToTables, resetTableAfterClosedOrder } from "../../firebase/tableService";

function canResetTable(table) {
  return table.status === "free" || Boolean(table.currentOrderId);
}

function getStatusLabel(status) {
  return status ? status.replace(/_/g, " ") : "free";
}

function WaiterApp() {
  const { restaurantId } = useParams();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubscribe = listenToTables(
      restaurantId,
      (tableData) => {
        setTables(tableData);
        setLoading(false);
      },
      (listenerError) => {
        setError(listenerError.message || "Could not load tables.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [restaurantId]);

  useEffect(() => {
    async function loadRestaurant() {
      try {
        setRestaurant(await getRestaurant(restaurantId));
      } catch {
        setRestaurant(null);
      }
    }

    loadRestaurant();
  }, [restaurantId]);

  const waitingBillTables = useMemo(
    () => tables.filter((table) => table.status === "waiting_bill"),
    [tables]
  );

  async function handleClearWaiterCall(tableId) {
    try {
      setError("");
      setActionMessage("");
      await clearWaiterCall(restaurantId, tableId);
      setActionMessage("Waiter call cleared.");
    } catch (clearError) {
      setError(clearError.message || "Could not clear waiter call.");
    }
  }

  async function handleMarkDelivered(orderId) {
    if (!orderId) {
      setError("No active order is linked to this table.");
      return;
    }

    try {
      setError("");
      setActionMessage("");
      await markOrderDelivered(restaurantId, orderId);
      setActionMessage("Order marked delivered.");
    } catch (deliverError) {
      setError(deliverError.message || "Could not mark order delivered.");
    }
  }

  async function handleResetTable(tableId) {
    try {
      setError("");
      setActionMessage("");
      await resetTableAfterClosedOrder(restaurantId, tableId);
      setActionMessage("Table reset.");
    } catch (resetError) {
      setError(resetError.message || "Could not reset table.");
    }
  }

  async function handleViewBill(orderId) {
    if (!orderId) {
      setError("No active order is linked to this table.");
      return;
    }

    try {
      setError("");
      setActionMessage("");
      const order = await getOrder(restaurantId, orderId);

      if (!order) {
        setError("Order not found.");
        return;
      }

      setSelectedOrder(order);
    } catch (billError) {
      setError(billError.message || "Could not load bill.");
    }
  }

  return (
    <main className="page page--waiter">
      <section className="hero">
        <p className="eyebrow">Waiter app</p>
        <h1>Tables and service calls</h1>
        <p>
          Restaurant: <strong>{restaurantId}</strong>
        </p>
      </section>

      {loading && <p className="notice">Listening for table updates...</p>}
      {error && <p className="notice notice--error">{error}</p>}
      {actionMessage && <p className="notice notice--success">{actionMessage}</p>}

      {selectedOrder && (
        <BillView restaurant={restaurant} order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      <section className="waiter-summary">
        <div>
          <p className="eyebrow">Waiting for bill</p>
          <h2>{waitingBillTables.length}</h2>
        </div>
        <div>
          <p className="eyebrow">Waiter calls</p>
          <h2>{tables.filter((table) => table.waiterCallActive || table.waiterCall).length}</h2>
        </div>
      </section>

      {!loading && tables.length === 0 && (
        <section className="panel">
          <h2>No tables found</h2>
          <p>Add table documents under this restaurant to start using the waiter app.</p>
        </section>
      )}

      <section className="waiter-table-list">
        {tables.map((table) => {
          const waiterCallActive = Boolean(table.waiterCallActive || table.waiterCall);
          const resetAllowed = canResetTable(table);

          return (
            <article
              className={waiterCallActive ? "waiter-table-card waiter-table-card--alert" : "waiter-table-card"}
              key={table.id}
            >
              <div className="waiter-table-card__top">
                <div>
                  <p className="eyebrow">Table</p>
                  <h2>{table.tableNumber || table.id}</h2>
                </div>
                <span className={`status-pill status-pill--${table.status || "free"}`}>
                  {getStatusLabel(table.status)}
                </span>
              </div>

              <dl className="table-meta">
                <div>
                  <dt>Waiter call</dt>
                  <dd>{waiterCallActive ? "Active" : "No"}</dd>
                </div>
                <div>
                  <dt>Current order</dt>
                  <dd>{table.currentOrderId || "None"}</dd>
                </div>
              </dl>

              {table.status === "waiting_bill" && (
                <p className="waiter-bill-alert">Bill requested for this table.</p>
              )}

              <div className="waiter-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!waiterCallActive}
                  onClick={() => handleClearWaiterCall(table.id)}
                >
                  Clear call
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!table.currentOrderId}
                  onClick={() => handleMarkDelivered(table.currentOrderId)}
                >
                  Mark delivered
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!table.currentOrderId}
                  onClick={() => handleViewBill(table.currentOrderId)}
                >
                  View bill
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!resetAllowed}
                  onClick={() => handleResetTable(table.id)}
                >
                  Reset table
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export default WaiterApp;
