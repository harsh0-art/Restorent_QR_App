import { Navigate, Route, Routes } from "react-router-dom";
import AdminPanel from "../pages/AdminPanel/AdminPanel.jsx";
import CustomerOrder from "../pages/CustomerOrder/CustomerOrder.jsx";
import KitchenDisplay from "../pages/KitchenDisplay/KitchenDisplay.jsx";
import WaiterApp from "../pages/WaiterApp/WaiterApp.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/order/demo-restaurant/table-1" replace />} />
      <Route path="/order/:restaurantId/:tableId" element={<CustomerOrder />} />
      <Route path="/kitchen/:restaurantId" element={<KitchenDisplay />} />
      <Route path="/waiter/:restaurantId" element={<WaiterApp />} />
      <Route path="/admin/:restaurantId" element={<AdminPanel />} />
    </Routes>
  );
}

export default App;
