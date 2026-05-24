import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getAvailableMenuItems } from "../../firebase/menuService";
import { callWaiter, getTable, placeTableOrder, requestBill } from "../../firebase/orderService";
import { getRestaurant } from "../../firebase/restaurantService";
import { formatINR } from "../../utils/priceUtils";

function groupItemsByCategory(items) {
  return items.reduce((groups, item) => {
    const category = item.category || "Other";
    return {
      ...groups,
      [category]: [...(groups[category] || []), item],
    };
  }, {});
}

function CustomerOrder() {
  const { restaurantId, tableId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState({});
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadCustomerPage() {
      try {
        setLoading(true);
        setError("");

        const [restaurantData, menuData] = await Promise.all([
          getRestaurant(restaurantId),
          getAvailableMenuItems(restaurantId),
        ]);

        setRestaurant(restaurantData);
        setMenuItems(menuData);
      } catch (pageError) {
        setError(pageError.message || "Could not load this restaurant menu.");
      } finally {
        setLoading(false);
      }
    }

    loadCustomerPage();
  }, [restaurantId]);

  const groupedMenu = useMemo(() => groupItemsByCategory(menuItems), [menuItems]);

  const cartItems = useMemo(
    () =>
      Object.values(cart).map((cartItem) => ({
        ...cartItem,
        subtotal: Number(cartItem.price || 0) * cartItem.quantity,
      })),
    [cart]
  );

  const cartTotal = cartItems.reduce((total, item) => total + item.subtotal, 0);
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  function addToCart(item) {
    setSuccessMessage("");
    setCart((currentCart) => {
      const currentItem = currentCart[item.id];

      return {
        ...currentCart,
        [item.id]: {
          id: item.id,
          name: item.name,
          price: Number(item.price || 0),
          quantity: currentItem ? currentItem.quantity + 1 : 1,
        },
      };
    });
  }

  function decreaseQuantity(itemId) {
    setSuccessMessage("");
    setCart((currentCart) => {
      const currentItem = currentCart[itemId];

      if (!currentItem) {
        return currentCart;
      }

      if (currentItem.quantity === 1) {
        const nextCart = { ...currentCart };
        delete nextCart[itemId];
        return nextCart;
      }

      return {
        ...currentCart,
        [itemId]: {
          ...currentItem,
          quantity: currentItem.quantity - 1,
        },
      };
    });
  }

  async function handlePlaceOrder() {
    if (cartItems.length === 0) {
      setError("Add at least one item before placing the order.");
      return;
    }

    try {
      setPlacingOrder(true);
      setError("");
      setSuccessMessage("");

      await getTable(restaurantId, tableId);

      const orderId = await placeTableOrder({
        restaurantId,
        tableId,
        cartItems,
        specialInstructions,
      });

      setCart({});
      setSpecialInstructions("");
      setSuccessMessage(`Order sent to kitchen. Order ID: ${orderId}`);
    } catch (orderError) {
      setError(orderError.message || "Could not place the order. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleCallWaiter() {
    try {
      setError("");
      await callWaiter(restaurantId, tableId);
      setSuccessMessage("Waiter has been called for this table.");
    } catch (waiterError) {
      setError(waiterError.message || "Could not call waiter right now.");
    }
  }

  async function handleRequestBill() {
    try {
      setError("");
      await requestBill(restaurantId, tableId);
      setSuccessMessage("Bill requested. Staff will come to your table.");
    } catch (billError) {
      setError(billError.message || "Could not request bill right now.");
    }
  }

  return (
    <main className="page page--customer">
      <header className="customer-header">
        <p className="eyebrow">Table {tableId}</p>
        <h1>{restaurant?.name || "Restaurant menu"}</h1>
        {restaurant?.address && <p className="muted">{restaurant.address}</p>}
      </header>

      {loading && <p className="notice">Loading menu...</p>}
      {error && <p className="notice notice--error">{error}</p>}
      {successMessage && <p className="notice notice--success">{successMessage}</p>}

      {!loading && !restaurant && (
        <section className="panel">
          <h2>Restaurant not found</h2>
          <p>Please check the QR code or ask restaurant staff for help.</p>
        </section>
      )}

      {!loading && restaurant && (
        <>
          <div className="customer-actions">
            <button className="secondary-button" type="button" onClick={handleCallWaiter}>
              Call waiter
            </button>
            <button className="secondary-button" type="button" onClick={handleRequestBill}>
              Request bill
            </button>
          </div>

          {Object.entries(groupedMenu).map(([category, items]) => (
            <section className="menu-section" key={category}>
              <h2>{category}</h2>

              <div className="menu-list">
                {items.map((item) => {
                  const cartItem = cart[item.id];

                  return (
                    <article className="food-card" key={item.id}>
                      {item.imageUrl && (
                        <img className="food-card__image" src={item.imageUrl} alt={item.name} />
                      )}

                      <div className="food-card__body">
                        <div className="food-card__top">
                          <div>
                            <p className="food-card__name">{item.name}</p>
                            <p className="food-card__price">{formatINR(item.price)}</p>
                          </div>
                          <span className={item.isVeg ? "food-type food-type--veg" : "food-type"}>
                            {item.isVeg ? "Veg" : "Non-veg"}
                          </span>
                        </div>

                        {item.description && (
                          <p className="food-card__description">{item.description}</p>
                        )}

                        <div className="quantity-row">
                          {cartItem ? (
                            <div className="quantity-control">
                              <button type="button" onClick={() => decreaseQuantity(item.id)}>
                                -
                              </button>
                              <span>{cartItem.quantity}</span>
                              <button type="button" onClick={() => addToCart(item)}>
                                +
                              </button>
                            </div>
                          ) : (
                            <button className="primary-button" type="button" onClick={() => addToCart(item)}>
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          {menuItems.length === 0 && (
            <section className="panel">
              <h2>No items available</h2>
              <p>Please ask the restaurant staff to enable menu items for this restaurant.</p>
            </section>
          )}
        </>
      )}

      {cartItems.length > 0 && (
        <section className="cart-panel" aria-label="Cart">
          <div>
            <p className="cart-panel__title">
              {itemCount} item{itemCount === 1 ? "" : "s"} in cart
            </p>
            <p className="cart-panel__total">{formatINR(cartTotal)}</p>
          </div>

          <label className="cart-panel__instructions">
            Special instructions
            <textarea
              rows="2"
              value={specialInstructions}
              onChange={(event) => setSpecialInstructions(event.target.value)}
              placeholder="Less spicy, no onion, Jain preparation..."
            />
          </label>

          <button
            className="primary-button primary-button--wide"
            type="button"
            disabled={placingOrder}
            onClick={handlePlaceOrder}
          >
            {placingOrder ? "Placing order..." : "Place order"}
          </button>
        </section>
      )}
    </main>
  );
}

export default CustomerOrder;
