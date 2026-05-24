import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebaseConfig";

export async function getAvailableMenuItems(restaurantId) {
  const menuRef = collection(db, "restaurants", restaurantId, "menu_items");
  const menuQuery = query(menuRef, where("available", "==", true));
  const snapshot = await getDocs(menuQuery);

  return snapshot.docs
    .map((itemDoc) => ({
      id: itemDoc.id,
      ...itemDoc.data(),
    }))
    .sort((firstItem, secondItem) => {
      const firstCategory = firstItem.category || "Other";
      const secondCategory = secondItem.category || "Other";

      return `${firstCategory}-${firstItem.name}`.localeCompare(`${secondCategory}-${secondItem.name}`);
    });
}

function normalizeMenuItem(menuItem) {
  const isAvailable = Boolean(menuItem.isAvailable);

  return {
    name: menuItem.name || "",
    category: menuItem.category || "Other",
    price: Number(menuItem.price || 0),
    description: menuItem.description || "",
    imageUrl: menuItem.imageUrl || "",
    isVeg: Boolean(menuItem.isVeg),
    isAvailable,
    available: isAvailable,
    sortOrder: Number(menuItem.sortOrder || 0),
    updatedAt: serverTimestamp(),
  };
}

export async function getMenuItems(restaurantId) {
  const menuRef = collection(db, "restaurants", restaurantId, "menu_items");
  const snapshot = await getDocs(menuRef);

  return snapshot.docs
    .map((itemDoc) => ({
      id: itemDoc.id,
      ...itemDoc.data(),
    }))
    .sort((firstItem, secondItem) => Number(firstItem.sortOrder || 0) - Number(secondItem.sortOrder || 0));
}

export async function saveMenuItem(restaurantId, menuItem) {
  const itemData = normalizeMenuItem(menuItem);

  if (menuItem.id) {
    const itemRef = doc(db, "restaurants", restaurantId, "menu_items", menuItem.id);
    await setDoc(itemRef, itemData, { merge: true });
    return menuItem.id;
  }

  const menuRef = collection(db, "restaurants", restaurantId, "menu_items");
  const createdItem = await addDoc(menuRef, {
    ...itemData,
    createdAt: serverTimestamp(),
  });

  return createdItem.id;
}

export async function deleteMenuItem(restaurantId, itemId) {
  const itemRef = doc(db, "restaurants", restaurantId, "menu_items", itemId);
  await deleteDoc(itemRef);
}
