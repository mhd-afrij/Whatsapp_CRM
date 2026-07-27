import { createContext, useContext } from "react";
import { useAuthStore } from "../store/index.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const auth = useAuthStore();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
