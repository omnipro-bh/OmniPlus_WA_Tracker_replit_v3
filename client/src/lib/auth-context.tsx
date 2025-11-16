import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User, Plan, Subscription } from "@shared/schema";

type UserWithDetails = User & {
  currentPlan?: Plan;
  currentSubscription?: Subscription;
  channelsUsed: number;
  channelsLimit: number;
  messagesSentToday: number;
};

type AuthContextType = {
  user: UserWithDetails | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, refetch } = useQuery<UserWithDetails>({
    queryKey: ["/api/me"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated: !!user,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
