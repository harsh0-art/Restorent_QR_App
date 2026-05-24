import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

const ACTIVE_ORDER_STATUSES = ["pending", "preparing", "partially_ready", "ready", "waiting_bill"];

function buildOrderItem(cartItem) {
  const price = Number(cartItem.price || 0);
  const quantity = Number(cartItem.quantity || 0);

  return {
    itemId: cartItem.id,
    name: cartItem.name,
    price,
    quantity,
    subtotal: price * quantity,
    status: "pending",
    addedAt: new Date().toISOString(),
  };
}

export async function getTable(restaurantId, tableId) {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);
  const snapshot = await getDoc(tableRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export async function placeTableOrder({ restaurantId, tableId, cartItems, specialInstructions }) {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);
  const newItems = cartItems.map(buildOrderItem);
  const cartTotal = newItems.reduce((total, item) => total + item.subtotal, 0);

  return runTransaction(db, async (transaction) => {
    const tableSnapshot = await transaction.get(tableRef);
    const tableData = tableSnapshot.exists() ? tableSnapshot.data() : {};
    const currentOrderId = tableData.currentOrderId;

    if (currentOrderId) {
      const orderRef = doc(db, "restaurants", restaurantId, "orders", currentOrderId);
      const orderSnapshot = await transaction.get(orderRef);

      if (orderSnapshot.exists()) {
        const existingItems = orderSnapshot.data().items || [];

        transaction.update(orderRef, {
          items: [...existingItems, ...newItems],
          subtotal: increment(cartTotal),
          total: increment(cartTotal),
          status: "pending",
          paymentMethod: orderSnapshot.data().paymentMethod || "counter",
          paymentStatus: orderSnapshot.data().paymentStatus || "unpaid",
          specialInstructions: specialInstructions || orderSnapshot.data().specialInstructions || "",
          updatedAt: serverTimestamp(),
        });

        transaction.set(
          tableRef,
          {
            status: "occupied",
            currentOrderId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        return currentOrderId;
      }
    }

    const orderRef = doc(collection(db, "restaurants", restaurantId, "orders"));

    transaction.set(orderRef, {
      restaurantId,
      tableId,
      items: newItems,
      subtotal: cartTotal,
      total: cartTotal,
      status: "pending",
      paymentMethod: "counter",
      paymentStatus: "unpaid",
      specialInstructions: specialInstructions || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(
      tableRef,
      {
        status: "occupied",
        currentOrderId: orderRef.id,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return orderRef.id;
  });
}

export async function callWaiter(restaurantId, tableId) {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);

  await updateDoc(tableRef, {
    waiterCall: true,
    waiterCallActive: true,
    waiterCalledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function requestBill(restaurantId, tableId) {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);

  await runTransaction(db, async (transaction) => {
    const tableSnapshot = await transaction.get(tableRef);

    if (!tableSnapshot.exists()) {
      throw new Error("Table not found.");
    }

    const tableData = tableSnapshot.data();
    const currentOrderId = tableData.currentOrderId;

    if (!currentOrderId) {
      throw new Error("Please place an order before requesting the bill.");
    }

    const orderRef = doc(db, "restaurants", restaurantId, "orders", currentOrderId);
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists()) {
      throw new Error("Current order not found.");
    }

    transaction.update(orderRef, {
      status: "waiting_bill",
      billRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.update(tableRef, {
      status: "waiting_bill",
      billRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

function getOrderStatusFromItems(items) {
  if (items.length === 0) {
    return "pending";
  }

  if (items.every((item) => item.status === "ready")) {
    return "ready";
  }

  if (items.some((item) => item.status === "ready")) {
    return "partially_ready";
  }

  if (items.some((item) => item.status === "preparing")) {
    return "preparing";
  }

  return "pending";
}

export function listenToActiveOrders(restaurantId, onOrders, onError) {
  const ordersRef = collection(db, "restaurants", restaurantId, "orders");
  const ordersQuery = query(ordersRef);

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const activeOrders = snapshot.docs
        .map((orderDoc) => ({
          id: orderDoc.id,
          ...orderDoc.data(),
        }))
        .filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status || "pending"))
        .sort((firstOrder, secondOrder) => {
          const firstCreated = firstOrder.createdAt?.toMillis?.() || 0;
          const secondCreated = secondOrder.createdAt?.toMillis?.() || 0;

          return firstCreated - secondCreated;
        });

      onOrders(activeOrders);
    },
    onError
  );
}

export async function updateOrderItemStatus(restaurantId, orderId, itemIndex, nextStatus) {
  const orderRef = doc(db, "restaurants", restaurantId, "orders", orderId);

  await runTransaction(db, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists()) {
      throw new Error("Order not found.");
    }

    const orderData = orderSnapshot.data();
    const items = [...(orderData.items || [])];

    if (!items[itemIndex]) {
      throw new Error("Order item not found.");
    }

    items[itemIndex] = {
      ...items[itemIndex],
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    transaction.update(orderRef, {
      items,
      status: getOrderStatusFromItems(items),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function markOrderDelivered(restaurantId, orderId) {
  const orderRef = doc(db, "restaurants", restaurantId, "orders", orderId);

  await runTransaction(db, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists()) {
      throw new Error("Order not found.");
    }

    const orderData = orderSnapshot.data();
    const items = (orderData.items || []).map((item) => ({
      ...item,
      status: item.status === "cancelled" ? "cancelled" : "delivered",
      updatedAt: new Date().toISOString(),
    }));

    transaction.update(orderRef, {
      items,
      status: "delivered",
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function getOrderHistory(restaurantId) {
  const ordersRef = collection(db, "restaurants", restaurantId, "orders");
  const snapshot = await getDocs(ordersRef);

  return snapshot.docs
    .map((orderDoc) => ({
      id: orderDoc.id,
      ...orderDoc.data(),
    }))
    .sort((firstOrder, secondOrder) => {
      const firstCreated = firstOrder.createdAt?.toMillis?.() || 0;
      const secondCreated = secondOrder.createdAt?.toMillis?.() || 0;

      return secondCreated - firstCreated;
    });
}

export async function getOrder(restaurantId, orderId) {
  const orderRef = doc(db, "restaurants", restaurantId, "orders", orderId);
  const snapshot = await getDoc(orderRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}
