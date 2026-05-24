import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  listenToActiveOrders,
  markOrderDelivered,
  updateOrderItemStatus,
} from "../../firebase/orderService";

function getTableLabel(tableId) {
  return tableId?.replace(/-/g, " ") || "Unknown table";
}

function formatItemTime(addedAt) {
  if (!addedAt) {
    return "Just now";
  }

  const date = typeof addedAt?.toDate === "function" ? addedAt.toDate() : new Date(addedAt);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecentlyAdded(item) {
  if (item.status !== "pending" || !item.addedAt) {
    return false;
  }

  const addedDate = typeof item.addedAt?.toDate === "function" ? item.addedAt.toDate() : new Date(item.addedAt);

  if (Number.isNaN(addedDate.getTime())) {
    return false;
  }

  return Date.now() - addedDate.getTime() < 5 * 60 * 1000;
}

function KitchenDisplay() {
  const { restaurantId } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const previousItemCountRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubscribe = listenToActiveOrders(
      restaurantId,
      (activeOrders) => {
        const itemCount = activeOrders.reduce((total, order) => total + (order.items || []).length, 0);

        if (previousItemCountRef.current > 0 && itemCount > previousItemCountRef.current) {
          console.info("Kitchen sound alert placeholder: new order item received.");
        }

        previousItemCountRef.current = itemCount;
        setOrders(activeOrders);
        setLoading(false);
      },
      (listenerError) => {
        setError(listenerError.message || "Could not load kitchen orders.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [restaurantId]);

  const ordersByTable = useMemo(() => {
    return orders.reduce((groups, order) => {
      const tableKey = order.tableId || "unknown-table";

      return {
        ...groups,
        [tableKey]: [...(groups[tableKey] || []), order],
      };
    }, {});
  }, [orders]);

  async function handleItemStatus(orderId, itemIndex, nextStatus) {
    try {
      setError("");
      setActionMessage("");
      await updateOrderItemStatus(restaurantId, orderId, itemIndex, nextStatus);
      setActionMessage(`Item marked ${nextStatus}.`);
    } catch (statusError) {
      setError(statusError.message || "Could not update item status.");
    }
  }

  async function handleDelivered(orderId) {
    try {
      setError("");
      setActionMessage("");
      await markOrderDelivered(restaurantId, orderId);
      setActionMessage("Order marked delivered.");
    } catch (deliverError) {
      setError(deliverError.message || "Could not mark order delivered.");
    }
  }

  return (
    <main className="page page--workspace">
      <section className="hero">
        <p className="eyebrow">Kitchen display</p>
        <h1>Live kitchen orders</h1>
        <p>
          Restaurant: <strong>{restaurantId}</strong>
        </p>
      </section>

      {loading && <p className="notice">Listening for kitchen orders...</p>}
      {error && <p className="notice notice--error">{error}</p>}
      {actionMessage && <p className="notice notice--success">{actionMessage}</p>}

      {!loading && orders.length === 0 && (
        <section className="panel">
          <h2>No active orders</h2>
          <p>New table orders will appear here automatically.</p>
        </section>
      )}

      <div className="kitchen-board">
        {Object.entries(ordersByTable).map(([tableId, tableOrders]) => (
          <section className="kitchen-table" key={tableId}>
            <div className="kitchen-table__header">
              <div>
                <p className="eyebrow">Table</p>
                <h2>{getTableLabel(tableId)}</h2>
              </div>
              <span>{tableOrders.length} order{tableOrders.length === 1 ? "" : "s"}</span>
            </div>

            <div className="kitchen-orders">
              {tableOrders.map((order) => (
                <article className="kitchen-order" key={order.id}>
                  <div className="kitchen-order__top">
                    <div>
                      <p className="kitchen-order__id">Order {order.id.slice(0, 8)}</p>
                      <p className="muted">Status: {order.status || "pending"}</p>
                    </div>
                    <button className="secondary-button" type="button" onClick={() => handleDelivered(order.id)}>
                      Mark delivered
                    </button>
                  </div>

                  {order.specialInstructions && (
                    <p className="kitchen-note">Note: {order.specialInstructions}</p>
                  )}

                  <div className="kitchen-items">
                    {(order.items || []).map((item, itemIndex) => (
                      <div
                        className={isRecentlyAdded(item) ? "kitchen-item kitchen-item--new" : "kitchen-item"}
                        key={`${order.id}-${item.itemId}-${itemIndex}`}
                      >
                        <div className="kitchen-item__main">
                          <span className="kitchen-item__qty">x{item.quantity}</span>
                          <div>
                            <p className="kitchen-item__name">{item.name}</p>
                            <p className="muted">
                              {item.status || "pending"} - Added {formatItemTime(item.addedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="kitchen-item__actions">
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={item.status !== "pending"}
                            onClick={() => handleItemStatus(order.id, itemIndex, "preparing")}
                          >
                            Preparing
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            disabled={item.status === "ready" || item.status === "delivered"}
                            onClick={() => handleItemStatus(order.id, itemIndex, "ready")}
                          >
                            Ready
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export default KitchenDisplay;
