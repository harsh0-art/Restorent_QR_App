import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";

export async function getRestaurant(restaurantId) {
  const restaurantRef = doc(db, "restaurants", restaurantId);
  const snapshot = await getDoc(restaurantRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export async function saveRestaurant(restaurantId, restaurantData) {
  const restaurantRef = doc(db, "restaurants", restaurantId);

  await setDoc(
    restaurantRef,
    {
      ...restaurantData,
      totalTables: Number(restaurantData.totalTables || 0),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
