import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { useParams } from "react-router-dom";
import BillView from "../../components/BillView";
import { auth } from "../../firebase/firebaseConfig";
import { deleteMenuItem, getMenuItems, saveMenuItem } from "../../firebase/menuService";
import { getOrderHistory } from "../../firebase/orderService";
import { getRestaurant, saveRestaurant } from "../../firebase/restaurantService";
import { generateRestaurantTables, listenToTables } from "../../firebase/tableService";
import { formatINR } from "../../utils/priceUtils";

const emptyMenuItem = {
  id: "",
  name: "",
  category: "",
  price: "",
  description: "",
  imageUrl: "",
  isVeg: true,
  isAvailable: true,
  sortOrder: 0,
};

function getOrderDate(order) {
  if (typeof order.createdAt?.toDate === "function") {
    return order.createdAt.toDate();
  }

  return order.createdAt ? new Date(order.createdAt) : null;
}

function isToday(order) {
  const orderDate = getOrderDate(order);

  if (!orderDate || Number.isNaN(orderDate.getTime())) {
    return false;
  }

  const today = new Date();
  return orderDate.toDateString() === today.toDateString();
}

function formatDateTime(order) {
  const orderDate = getOrderDate(order);

  if (!orderDate || Number.isNaN(orderDate.getTime())) {
    return "-";
  }

  return orderDate.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getBaseUrl() {
  return import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
}

function AdminPanel() {
  const { restaurantId } = useParams();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [restaurantForm, setRestaurantForm] = useState({
    name: "",
    gstin: "",
    logoUrl: "",
    totalTables: 1,
  });
  const [menuForm, setMenuForm] = useState(emptyMenuItem);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedBillOrder, setSelectedBillOrder] = useState(null);
  const [qrCodes, setQrCodes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    async function loadAdminData() {
      try {
        setLoading(true);
        setError("");

        const [restaurantData, menuData, orderData] = await Promise.all([
          getRestaurant(restaurantId),
          getMenuItems(restaurantId),
          getOrderHistory(restaurantId),
        ]);

        if (restaurantData) {
          setRestaurantForm({
            name: restaurantData.name || "",
            gstin: restaurantData.gstin || "",
            logoUrl: restaurantData.logoUrl || "",
            totalTables: restaurantData.totalTables || 1,
          });
        }

        setMenuItems(menuData);
        setOrders(orderData);
      } catch (loadError) {
        setError(loadError.message || "Could not load admin data.");
      } finally {
        setLoading(false);
      }
    }

    loadAdminData();

    return listenToTables(
      restaurantId,
      (tableData) => setTables(tableData),
      (tableError) => setError(tableError.message || "Could not load tables.")
    );
  }, [restaurantId, user]);

  useEffect(() => {
    async function buildQrCodes() {
      const nextQrCodes = {};
      const baseUrl = getBaseUrl().replace(/\/$/, "");

      for (const table of tables) {
        const qrUrl = `${baseUrl}/order/${restaurantId}/${table.id}`;
        nextQrCodes[table.id] = {
          url: qrUrl,
          image: await QRCode.toDataURL(qrUrl, { margin: 1, width: 160 }),
        };
      }

      setQrCodes(nextQrCodes);
    }

    if (tables.length > 0) {
      buildQrCodes();
    } else {
      setQrCodes({});
    }
  }, [restaurantId, tables]);

  const dailySummary = useMemo(() => {
    const todaysOrders = orders.filter((order) => isToday(order) && order.status !== "cancelled");
    const totalSales = todaysOrders.reduce((total, order) => total + Number(order.total || 0), 0);

    return {
      orderCount: todaysOrders.length,
      totalSales,
    };
  }, [orders]);

  async function handleAuthSubmit(event) {
    event.preventDefault();

    try {
      setError("");
      setMessage("");
      await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
    } catch (signInError) {
      setError(signInError.message || "Could not sign in.");
    }
  }

  async function handleCreateAccount() {
    try {
      setError("");
      setMessage("");
      await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
      setMessage("Admin account created.");
    } catch (createError) {
      setError(createError.message || "Could not create account.");
    }
  }

  async function handleRestaurantSave(event) {
    event.preventDefault();

    try {
      setError("");
      setMessage("");
      await saveRestaurant(restaurantId, restaurantForm);
      setMessage("Restaurant details saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save restaurant details.");
    }
  }

  async function handleMenuSave(event) {
    event.preventDefault();

    try {
      setError("");
      setMessage("");
      await saveMenuItem(restaurantId, menuForm);
      setMenuForm(emptyMenuItem);
      setMenuItems(await getMenuItems(restaurantId));
      setMessage("Menu item saved.");
    } catch (menuError) {
      setError(menuError.message || "Could not save menu item.");
    }
  }

  async function handleDeleteMenuItem(itemId) {
    try {
      setError("");
      setMessage("");
      await deleteMenuItem(restaurantId, itemId);
      setMenuItems(await getMenuItems(restaurantId));
      setMessage("Menu item deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete menu item.");
    }
  }

  async function handleGenerateTables() {
    try {
      setError("");
      setMessage("");
      await generateRestaurantTables(restaurantId, restaurantForm.totalTables);
      setMessage("Tables generated.");
    } catch (tableError) {
      setError(tableError.message || "Could not generate tables.");
    }
  }

  if (authLoading) {
    return (
      <main className="page page--workspace">
        <p className="notice">Checking admin session...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page page--workspace">
        <section className="hero">
          <p className="eyebrow">Owner admin</p>
          <h1>Restaurant control panel</h1>
          <p>
            Restaurant: <strong>{restaurantId}</strong>
          </p>
        </section>

        {error && <p className="notice notice--error">{error}</p>}

        <form className="admin-card admin-auth" onSubmit={handleAuthSubmit}>
          <h2>Admin login</h2>
          <label>
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={authForm.password}
              onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              required
            />
          </label>
          <div className="admin-actions">
            <button className="primary-button" type="submit">
              Login
            </button>
            <button className="secondary-button" type="button" onClick={handleCreateAccount}>
              Create account
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="page page--workspace">
      <section className="hero admin-hero">
        <div>
          <p className="eyebrow">Owner admin</p>
          <h1>Restaurant control panel</h1>
          <p>
            Restaurant: <strong>{restaurantId}</strong>
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => signOut(auth)}>
          Logout
        </button>
      </section>

      {loading && <p className="notice">Loading admin data...</p>}
      {error && <p className="notice notice--error">{error}</p>}
      {message && <p className="notice notice--success">{message}</p>}

      {selectedBillOrder && (
        <BillView
          restaurant={{ ...restaurantForm, id: restaurantId }}
          order={selectedBillOrder}
          onClose={() => setSelectedBillOrder(null)}
        />
      )}

      <section className="admin-grid">
        <form className="admin-card" onSubmit={handleRestaurantSave}>
          <h2>Restaurant details</h2>
          <label>
            Name
            <input
              value={restaurantForm.name}
              onChange={(event) => setRestaurantForm({ ...restaurantForm, name: event.target.value })}
              required
            />
          </label>
          <label>
            GSTIN
            <input
              value={restaurantForm.gstin}
              onChange={(event) => setRestaurantForm({ ...restaurantForm, gstin: event.target.value })}
              placeholder="24ABCDE1234F1Z5"
            />
          </label>
          <label>
            Logo URL
            <input
              value={restaurantForm.logoUrl}
              onChange={(event) => setRestaurantForm({ ...restaurantForm, logoUrl: event.target.value })}
              placeholder="https://..."
            />
          </label>
          <label>
            Total tables
            <input
              min="1"
              type="number"
              value={restaurantForm.totalTables}
              onChange={(event) => setRestaurantForm({ ...restaurantForm, totalTables: event.target.value })}
            />
          </label>
          <div className="admin-actions">
            <button className="primary-button" type="submit">
              Save restaurant
            </button>
            <button className="secondary-button" type="button" onClick={handleGenerateTables}>
              Generate tables
            </button>
          </div>
        </form>

        <section className="admin-card">
          <h2>Daily sales</h2>
          <div className="admin-metric">
            <span>Today orders</span>
            <strong>{dailySummary.orderCount}</strong>
          </div>
          <div className="admin-metric">
            <span>Today sales</span>
            <strong>{formatINR(dailySummary.totalSales)}</strong>
          </div>
        </section>
      </section>

      <section className="admin-card">
        <h2>{menuForm.id ? "Edit menu item" : "Add menu item"}</h2>
        <form className="menu-form" onSubmit={handleMenuSave}>
          <label>
            Name
            <input
              value={menuForm.name}
              onChange={(event) => setMenuForm({ ...menuForm, name: event.target.value })}
              required
            />
          </label>
          <label>
            Category
            <input
              value={menuForm.category}
              onChange={(event) => setMenuForm({ ...menuForm, category: event.target.value })}
              required
            />
          </label>
          <label>
            Price
            <input
              min="0"
              type="number"
              value={menuForm.price}
              onChange={(event) => setMenuForm({ ...menuForm, price: event.target.value })}
              required
            />
          </label>
          <label>
            Sort order
            <input
              type="number"
              value={menuForm.sortOrder}
              onChange={(event) => setMenuForm({ ...menuForm, sortOrder: event.target.value })}
            />
          </label>
          <label className="menu-form__wide">
            Description
            <textarea
              rows="2"
              value={menuForm.description}
              onChange={(event) => setMenuForm({ ...menuForm, description: event.target.value })}
            />
          </label>
          <label className="menu-form__wide">
            Image URL
            <input
              value={menuForm.imageUrl}
              onChange={(event) => setMenuForm({ ...menuForm, imageUrl: event.target.value })}
              placeholder="https://..."
            />
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={menuForm.isVeg}
              onChange={(event) => setMenuForm({ ...menuForm, isVeg: event.target.checked })}
            />
            Veg item
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={menuForm.isAvailable}
              onChange={(event) => setMenuForm({ ...menuForm, isAvailable: event.target.checked })}
            />
            Available
          </label>
          <div className="admin-actions">
            <button className="primary-button" type="submit">
              Save item
            </button>
            <button className="secondary-button" type="button" onClick={() => setMenuForm(emptyMenuItem)}>
              Clear
            </button>
          </div>
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
                <th>Sort</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{formatINR(item.price)}</td>
                  <td>{item.available || item.isAvailable ? "Available" : "Hidden"}</td>
                  <td>{item.sortOrder || 0}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          setMenuForm({
                            id: item.id,
                            name: item.name || "",
                            category: item.category || "",
                            price: item.price || "",
                            description: item.description || "",
                            imageUrl: item.imageUrl || "",
                            isVeg: Boolean(item.isVeg),
                            isAvailable: Boolean(item.available || item.isAvailable),
                            sortOrder: item.sortOrder || 0,
                          })
                        }
                      >
                        Edit
                      </button>
                      <button className="secondary-button" type="button" onClick={() => handleDeleteMenuItem(item.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {menuItems.length === 0 && (
                <tr>
                  <td colSpan="6">No menu items yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h2>Table QR codes</h2>
        <div className="qr-grid">
          {tables.map((table) => (
            <article className="qr-card" key={table.id}>
              <h3>Table {table.tableNumber || table.id}</h3>
              {qrCodes[table.id]?.image && <img src={qrCodes[table.id].image} alt={`QR for table ${table.id}`} />}
              <p>{qrCodes[table.id]?.url}</p>
            </article>
          ))}
          {tables.length === 0 && <p className="muted">Generate tables to create QR codes.</p>}
        </div>
      </section>

      <section className="admin-card">
        <h2>Order history</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Table</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
                <th>Bill</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.id.slice(0, 8)}</td>
                  <td>{order.tableId}</td>
                  <td>{order.status || "pending"}</td>
                  <td>{formatINR(order.total)}</td>
                  <td>{formatDateTime(order)}</td>
                  <td>
                    <button className="secondary-button" type="button" onClick={() => setSelectedBillOrder(order)}>
                      View bill
                    </button>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan="6">No orders yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default AdminPanel;
