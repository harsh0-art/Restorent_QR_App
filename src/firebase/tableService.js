import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";

export function listenToTables(restaurantId, onTables, onError) {
  const tablesRef = collection(db, "restaurants", restaurantId, "tables");
  const tablesQuery = query(tablesRef);

  return onSnapshot(
    tablesQuery,
    (snapshot) => {
      const tables = snapshot.docs
        .map((tableDoc) => ({
          id: tableDoc.id,
          ...tableDoc.data(),
        }))
        .sort((firstTable, secondTable) => {
          const firstNumber = Number(firstTable.tableNumber || firstTable.id.replace(/\D/g, ""));
          const secondNumber = Number(secondTable.tableNumber || secondTable.id.replace(/\D/g, ""));

          if (Number.isNaN(firstNumber) || Number.isNaN(secondNumber)) {
            return String(firstTable.tableNumber || firstTable.id).localeCompare(
              String(secondTable.tableNumber || secondTable.id)
            );
          }

          return firstNumber - secondNumber;
        });

      onTables(tables);
    },
    onError
  );
}

export async function clearWaiterCall(restaurantId, tableId) {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);

  await updateDoc(tableRef, {
    waiterCall: false,
    waiterCallActive: false,
    waiterCallClearedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function resetTableAfterClosedOrder(restaurantId, tableId) {
  const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);

  await runTransaction(db, async (transaction) => {
    const tableSnapshot = await transaction.get(tableRef);

    if (!tableSnapshot.exists()) {
      throw new Error("Table not found.");
    }

    const tableData = tableSnapshot.data();
    const currentOrderId = tableData.currentOrderId;

    if (!currentOrderId) {
      transaction.update(tableRef, {
        status: "free",
        waiterCall: false,
        waiterCallActive: false,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const orderRef = doc(db, "restaurants", restaurantId, "orders", currentOrderId);
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists()) {
      throw new Error("Current order not found.");
    }

    const orderData = orderSnapshot.data();
    const canReset = orderData.status === "closed" || orderData.paymentStatus === "paid";

    if (!canReset) {
      throw new Error("Table can be reset only after the order is closed or paid.");
    }

    transaction.update(tableRef, {
      status: "free",
      currentOrderId: "",
      waiterCall: false,
      waiterCallActive: false,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function generateRestaurantTables(restaurantId, totalTables) {
  const tableCount = Number(totalTables || 0);
  const writes = [];

  for (let index = 1; index <= tableCount; index += 1) {
    const tableId = `table-${index}`;
    const tableRef = doc(db, "restaurants", restaurantId, "tables", tableId);

    writes.push(
      setDoc(
        tableRef,
        {
          tableNumber: String(index),
          status: "free",
          waiterCall: false,
          waiterCallActive: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);
}
