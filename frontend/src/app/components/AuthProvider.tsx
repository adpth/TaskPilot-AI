"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface AuthUser {
  id: number;
  email: string;
  name: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const validateToken = useCallback(async (jwt: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ id: data.id, email: data.email, name: data.name });
        setToken(jwt);
      } else {
        // Token expired or invalid
        localStorage.removeItem("taskpilot_token");
      }
    } catch {
      // Server offline — keep token, try to decode payload locally
      try {
        const payloadB64 = jwt.split(".")[1];
        const payload = JSON.parse(atob(payloadB64 + "=="));
        setUser({ id: payload.user_id, email: payload.email, name: payload.name });
        setToken(jwt);
      } catch {
        localStorage.removeItem("taskpilot_token");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // On mount, check for stored token and validate it
  useEffect(() => {
    const stored = localStorage.getItem("taskpilot_token");
    if (stored) {
      validateToken(stored);
    } else {
      setIsLoading(false);
    }
  }, [validateToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("taskpilot_token", data.token);
    setToken(data.token);
    setUser({ id: data.user_id, email: data.email, name: data.name });
    router.push("/dashboard");
  }, [router]);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Signup failed");
    }
    const data = await res.json();
    localStorage.setItem("taskpilot_token", data.token);
    setToken(data.token);
    setUser({ id: data.user_id, email: data.email, name: data.name });
    router.push("/dashboard");
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem("taskpilot_token");
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
