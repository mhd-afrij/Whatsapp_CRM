import { SocketProvider } from "./providers/SocketProvider.jsx";
import { AppRoutes } from "./routes/AppRoutes.jsx";

export default function App() {
  return (
    <SocketProvider>
      <AppRoutes />
    </SocketProvider>
  );
}
